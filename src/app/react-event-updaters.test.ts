import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/** Every component source under src/app, tests aside. */
function componentSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : componentSources(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

test("no state updater reads the event's currentTarget: React runs the updater after the handler, when currentTarget is null (Discover's six filter controls threw on every change until 2026-10-19)", () => {
  const offenders = componentSources(new URL(".", import.meta.url).pathname).flatMap((file) =>
    readFileSync(file, "utf8").split("\n").flatMap((line, index) => /set\w+\(\s*\(\w+\) => [^;]*event\.currentTarget\.(value|checked)/.test(line) ? [`${file.split("/src/app/")[1]}:${index + 1}`] : []));
  assert.deepEqual(offenders, [], "read the value into a constant before the updater: const value = event.currentTarget.value;");
});

test("the Draft 2 sessions summary names its table without an alias: aliveSince() writes draft2_sessions' own columns, which Postgres refuses once the table is aliased (Today's board read nothing)", () => {
  const source = readFileSync(new URL("./modules/draft2/draft2-session.repository.ts", import.meta.url), "utf8");
  const query = source.slice(source.indexOf("export async function listDraft2SessionSummaries"), source.indexOf("`);", source.indexOf("export async function listDraft2SessionSummaries")));
  assert.ok(query.includes("${aliveSince()}"), "the summary reads whether a run is alive");
  assert.doesNotMatch(query, /FROM draft2_sessions\s+(?:AS\s+)?(?!WHERE)\w+\s*\n/u, "no alias on draft2_sessions");
});
