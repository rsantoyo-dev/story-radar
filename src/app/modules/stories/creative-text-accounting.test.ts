import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as cost from "./creative-text-cost";
import * as errors from "./creative-run-errors";
import type { CreativeDraft, CreativeBrief } from "./creative-content.types";
const localRequire = createRequire(import.meta.url);
const topic = randomUUID(), story = randomUUID(), draftId = randomUUID();
async function fixture() {
    const client = new PGlite();
    await client.exec(`CREATE TABLE topics(id uuid PRIMARY KEY); CREATE TABLE stories(id uuid PRIMARY KEY);
 CREATE TABLE creative_drafts(id uuid PRIMARY KEY,topic_id uuid,version int,status text);
 CREATE TABLE creative_ai_runs(id uuid,topic_id uuid,story_id uuid);
 INSERT INTO topics VALUES('${topic}');INSERT INTO stories VALUES('${story}');
 INSERT INTO creative_drafts VALUES('${draftId}','${topic}',1,'draft');`);
    await client.exec(readFileSync(new URL("../../../../drizzle/0075_chemical_swarm.sql", import.meta.url), "utf8"));
    const dialect = new PgDialect();
    const execute = (query: SQL) => { const q = dialect.sqlToQuery(query); return { query, then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => client.query(q.sql, q.params).then(resolve, reject) }; };
    const db = { execute, batch: (queries: ReturnType<typeof execute>[]) => client.transaction(async (tx) => {
            const out = [];
            for (const { query } of queries) {
                const q = dialect.sqlToQuery(query);
                out.push(await tx.query(q.sql, q.params));
            }
            return out;
        }) };
    function load<T>(file: string): T {
        const exports = {};
        vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
            exports, Date, Number, Error, console, require: (name: string) => {
                if (name === "drizzle-orm")
                    return localRequire(name);
                if (name === "@/db/client")
                    return { db };
                if (name === "./creative-text-cost")
                    return cost;
                if (name === "./creative-run-errors")
                    return errors;
                return {};
            },
        });
        return exports as T;
    }
    return { client, account: load<typeof import("./creative-text-accounting.repository")>("./creative-text-accounting.repository.ts"), recovery: load<typeof import("./creative-recovery.repository")>("./creative-recovery.repository.ts") };
}
test("cumulative budget reserves atomically, retains uncertain charges and isolates stories", async () => {
    const { client, account } = await fixture();
    try {
        const base = { topicId: topic, storyId: story, runId: randomUUID(), provider: "openai", model: "test", operation: "test", rate: { input: 1, output: 1, cached: 0, version: "test" }, reserved: 600000, limit: 1000000 };
        const a = randomUUID(), b = randomUUID();
        const results = await Promise.allSettled([account.reserveTextCall({ ...base, id: a }), account.reserveTextCall({ ...base, id: b })]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        const winner = results[0].status === 'fulfilled' ? a : b;
        await account.finishTextCall(winner, base, null);
        await assert.rejects(account.reserveTextCall({ ...base, id: randomUUID() }), (error: unknown) => {
            assert.ok(error instanceof cost.CreativeTextBudgetError);
            assert.match(error.message, /estimated usage: US\$0\.0000/);
            assert.match(error.message, /unconfirmed reservations: US\$0\.6000/);
            assert.match(error.message, /available: US\$0\.4000/);
            assert.match(error.message, /requires a reservation of US\$0\.6000/);
            assert.match(error.message, /test \(test\)/);
            return true;
        });
        // An uncertain result is never silently released by a late duplicate settlement.
        await account.finishTextCall(winner, base, 0);
        assert.equal((await account.getCreativeTextSpend(topic, story)).reservedUsd, .6);
        const next = randomUUID();
        await account.reserveTextCall({ ...base, id: next, reserved: 400000 });
        await account.finishTextCall(next, base, 100000);
        const spend = await account.getCreativeTextSpend(topic, story);
        assert.equal(spend.estimatedUsd, .1);
        assert.ok(Math.abs(spend.availableUsd - .3) < 1e-9);
        const another = randomUUID();
        await client.query('INSERT INTO stories VALUES($1)', [another]);
        await account.reserveTextCall({ ...base, id: randomUUID(), storyId: another });
    }
    finally {
        await client.close();
    }
});
test("accepted carousel denominator counts each metered draft once, not revisions", async () => {
    const { client, account } = await fixture();
    try {
        const draft = { id: draftId, storyId: story, version: 1, format: "carousel", status: "draft", qualityReviewIsCurrent: true, qualityReview: { status: "accepted" } } as CreativeDraft;
        await account.recordTextOutcome(topic, draft);
        assert.equal((await account.getCreativeTextSpend(topic, story)).acceptedCarousels, 0);
        await account.reserveTextCall({ id: randomUUID(), topicId: topic, storyId: story, runId: randomUUID(), provider: "test", model: "test", operation: "test", rate: { input: 0, output: 0, cached: 0, version: "test" }, reserved: 0, limit: 1000000 });
        await account.recordTextOutcome(topic, draft);
        await account.recordTextOutcome(topic, { ...draft, version: 2 });
        assert.equal((await account.getCreativeTextSpend(topic, story)).acceptedCarousels, 1);
    }
    finally {
        await client.close();
    }
});
test("recovery claims reject duplicate workers, resume checkpoints and fence expired leases", async () => {
    const { client, recovery } = await fixture();
    try {
        const draft = { id: draftId, storyId: story, version: 1 } as CreativeDraft, brief = {} as CreativeBrief, id = randomUUID();
        const job = await recovery.claimRecovery(topic, id, draft, brief);
        await assert.rejects(recovery.claimRecovery(topic, id, draft, brief), errors.CreativeContentConflictError);
        await assert.rejects(recovery.claimRecovery(topic, randomUUID(), draft, brief), errors.CreativeContentConflictError);
        const checkpoint = { stage: "patched" as const, draft, usage: { promptTokens: 1, outputTokens: 1, thoughtsTokens: 0, totalTokens: 2 } };
        await recovery.checkpointRecovery(topic, id, checkpoint, job.lease_token);
        await client.query("UPDATE creative_draft_recoveries SET updated_at=now()-interval '11 minutes' WHERE id=$1", [id]);
        const resumed = await recovery.claimRecovery(topic, id, draft, brief);
        assert.equal(resumed.result?.stage, "patched");
        assert.notEqual(resumed.lease_token, job.lease_token);
        await assert.rejects(recovery.checkpointRecovery(topic, id, checkpoint, job.lease_token), errors.CreativeContentConflictError);
        await recovery.checkpointRecovery(topic, id, { ...checkpoint, stage: "reviewed" }, resumed.lease_token);
        assert.equal((await recovery.claimRecovery(topic, id, draft, brief)).result?.stage, "reviewed");
        await recovery.finishRecovery(topic, id, resumed.lease_token);
        assert.equal((await recovery.getRecovery(topic, id))?.status, "completed");
    }
    finally {
        await client.close();
    }
});
test("a saved ready recovery cannot block recovery of a newer manually edited version", async () => {
    const { client, recovery } = await fixture();
    try {
        const draft = { id: draftId, storyId: story, version: 1 } as CreativeDraft, brief = {} as CreativeBrief, id = randomUUID();
        const job = await recovery.claimRecovery(topic, id, draft, brief);
        await recovery.checkpointRecovery(topic, id, { stage: "reviewed", draft, usage: { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, totalTokens: 0 } }, job.lease_token);
        await client.query('UPDATE creative_drafts SET version=2 WHERE id=$1', [draftId]);
        const newerId = randomUUID();
        await recovery.claimRecovery(topic, newerId, { ...draft, version: 2 }, brief);
        await assert.rejects(recovery.claimRecovery(topic, id, draft, brief), errors.CreativeContentConflictError);
        assert.equal((await recovery.getRecovery(topic, newerId))?.status, 'running', 'stale requests cannot cancel a newer worker');
        assert.equal((await recovery.getRecovery(topic, id))?.status, "failed");
        assert.equal((await recovery.getRecovery(topic, id))?.result?.stage, "reviewed");
    }
    finally {
        await client.close();
    }
});
