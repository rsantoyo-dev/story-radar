import "server-only";

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { creativeBrandReferences, creativeBrandAnalysisQuota } from "@/db/schema";

import {
  brandAnalysisCacheHash,
  BRAND_ANALYZER_PROMPT_VERSION,
} from "./brand-analyzer.config";
import {
  parseBrandReferenceAnalysis,
} from "./brand-reference-analysis";
import {
  brandContributionIsConfigured,
  parseCreativeBrandContribution,
} from "./creative-brand-reference-metadata";
import type {
  BrandReferenceAnalysis,
  CreativeBrandContribution,
  CreativeBrandReference,
  CreativeBrandReferenceKind,
} from "./creative-content.types";

export const MAX_CREATIVE_BRAND_REFERENCES = 60;

export type StoredCreativeBrandReference =
  typeof creativeBrandReferences.$inferSelect;

export type CreateCreativeBrandReferenceInput = {
  originalSnapshot?: StoredCreativeBrandReference["originalSnapshot"];
  id: string;
  topicId: string;
  version: number;
  objectKey: string;
  sha256: string;
  originalContentType: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  name: string;
  kind: CreativeBrandReferenceKind;
  provenance: string | null;
  usageNote: string | null;
  providerTransmissionAllowed: boolean;
};

export type CreativeBrandReferencePatch = Partial<{
  name: string;
  kind: CreativeBrandReferenceKind;
  provenance: string | null;
  usageNote: string | null;
  providerTransmissionAllowed: boolean;
  isActive: boolean;
  contribution: CreativeBrandContribution;
  activatedForJourney: boolean;
}>;

/**
 * Brand references eligible for the creative journey (BRAND-03): active AND
 * turned on for the journey AND with a real contribution configured. Oldest
 * first (an established reference is a stable tiebreak).
 */
export async function listActivatedBrandReferences(
  topicId: string,
): Promise<CreativeBrandReference[]> {
  const rows = await db
    .select()
    .from(creativeBrandReferences)
    .where(
      and(
        eq(creativeBrandReferences.topicId, topicId),
        eq(creativeBrandReferences.isActive, true),
        eq(creativeBrandReferences.activatedForJourney, true),
      ),
    )
    .orderBy(asc(creativeBrandReferences.createdAt));
  return rows
    .map(publicBrandReference)
    .filter((reference) => brandContributionIsConfigured(reference.contribution));
}

/** Every brand reference for a topic, newest first, active ones before archived. */
export async function listCreativeBrandReferences(
  topicId: string,
): Promise<CreativeBrandReference[]> {
  const rows = await db
    .select()
    .from(creativeBrandReferences)
    .where(eq(creativeBrandReferences.topicId, topicId))
    .orderBy(
      desc(creativeBrandReferences.isActive),
      desc(creativeBrandReferences.createdAt),
    );
  return rows.map(publicBrandReference);
}

export async function createCreativeBrandReference(
  input: CreateCreativeBrandReferenceInput,
): Promise<CreativeBrandReference> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creativeBrandReferences)
    .where(eq(creativeBrandReferences.topicId, input.topicId));
  if (count >= MAX_CREATIVE_BRAND_REFERENCES) {
    throw new CreativeBrandReferenceConflictError(
      `The brand reference library is full (${MAX_CREATIVE_BRAND_REFERENCES} maximum)`,
    );
  }

  const [created] = await db
    .insert(creativeBrandReferences)
    .values({
      id: input.id,
      topicId: input.topicId,
      version: input.version,
      originalSnapshot: input.originalSnapshot,
      objectKey: input.objectKey,
      sha256: input.sha256,
      contentType: "image/webp",
      originalContentType: input.originalContentType,
      fileName: input.fileName,
      fileSize: input.fileSize,
      width: input.width,
      height: input.height,
      name: input.name,
      kind: input.kind,
      provenance: input.provenance,
      usageNote: input.usageNote,
      providerTransmissionAllowed: input.providerTransmissionAllowed,
    })
    .returning();

  if (!created) {
    throw new Error("The brand reference could not be saved");
  }
  return publicBrandReference(created);
}

export async function updateCreativeBrandReference(
  topicId: string,
  referenceId: string,
  patch: CreativeBrandReferencePatch,
  expected?: StoredCreativeBrandReference,
): Promise<CreativeBrandReference> {
  const set: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (Object.keys(patch).length) {
    // A changed contribution bumps the config version so BRAND-05 can fold it
    // into the generation hash.
    set.configVersion = sql`${creativeBrandReferences.configVersion} + 1`;
  }

  if (expected) {
    const { revisions: _revisions, analysis: _analysis, ...revision } = expected;
    void _revisions; void _analysis;
    set.revisions = sql`${creativeBrandReferences.revisions} || ${JSON.stringify([revision])}::jsonb`;
  }
  const [updated] = await db
    .update(creativeBrandReferences)
    .set(set)
    .where(
      and(
        eq(creativeBrandReferences.id, referenceId),
        eq(creativeBrandReferences.topicId, topicId),
        ...(expected ? [eq(creativeBrandReferences.configVersion, expected.configVersion), eq(creativeBrandReferences.version, expected.version)] : []),
      ),
    )
    .returning();

  if (!updated) {
    if (expected) throw new CreativeBrandReferenceConflictError("The reference changed. Reload before saving.");
    throw new CreativeBrandReferenceNotFoundError(
      "The brand reference was not found",
    );
  }
  return publicBrandReference(updated);
}

/** Persists an AI visual analysis (BRAND-02). */
export async function saveCreativeBrandReferenceAnalysis(
  topicId: string,
  referenceId: string,
  input: {
    expectedVersion?: number;
    expectedConfigVersion?: number;
    analysis: BrandReferenceAnalysis;
    hash: string;
    model: string;
    promptVersion: string;
    runAt: Date;
  },
): Promise<CreativeBrandReference> {
  const [updated] = await db
    .update(creativeBrandReferences)
    .set({
      analysis: input.analysis,
      analysisHash: input.hash,
      analysisModel: input.model,
      analysisPromptVersion: input.promptVersion,
      analysisRunAt: input.runAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeBrandReferences.id, referenceId),
        eq(creativeBrandReferences.topicId, topicId),
        eq(creativeBrandReferences.providerTransmissionAllowed, true),
        ...(input.expectedVersion === undefined ? [] : [eq(creativeBrandReferences.version, input.expectedVersion)]),
        ...(input.expectedConfigVersion === undefined ? [] : [eq(creativeBrandReferences.configVersion, input.expectedConfigVersion)]),
      ),
    )
    .returning();

  if (!updated) {
    throw new CreativeBrandReferenceNotFoundError(
      "The brand reference was not found",
    );
  }
  return publicBrandReference(updated);
}

/** Distinct references analyzed for a topic since the start of the current UTC day. */
export async function countBrandReferenceAnalysesToday(
  topicId: string,
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creativeBrandReferences)
    .where(
      and(
        eq(creativeBrandReferences.topicId, topicId),
        gte(creativeBrandReferences.analysisRunAt, startOfDay),
      ),
    );
  return count;
}

/** Resolves a reference only when it belongs to the selected topic. */
export async function findCreativeBrandReference(
  topicId: string,
  referenceId: string,
): Promise<StoredCreativeBrandReference | undefined> {
  const [row] = await db
    .select()
    .from(creativeBrandReferences)
    .where(
      and(
        eq(creativeBrandReferences.id, referenceId),
        eq(creativeBrandReferences.topicId, topicId),
      ),
    )
    .limit(1);
  return row;
}

function readContribution(
  value: unknown,
): CreativeBrandContribution | null {
  if (value == null) return null;
  try {
    return parseCreativeBrandContribution(value);
  } catch {
    return null;
  }
}

function readAnalysis(value: unknown): BrandReferenceAnalysis | null {
  if (value == null) return null;
  try {
    return parseBrandReferenceAnalysis(JSON.stringify(value));
  } catch {
    return null;
  }
}

/** Browser-safe projection — drops topicId, objectKey, sha256 and the raw hash. */
export function publicBrandReference(
  row: StoredCreativeBrandReference,
): CreativeBrandReference {
  const analysis = readAnalysis(row.analysis);
  const currentHash =
    analysis && row.analysisModel && row.analysisPromptVersion
      ? brandAnalysisCacheHash({
          imageSha256: row.sha256,
          model: row.analysisModel,
          promptVersion: row.analysisPromptVersion,
        })
      : null;
  const analysisIsStale = Boolean(
    analysis &&
      (row.analysisPromptVersion !== BRAND_ANALYZER_PROMPT_VERSION ||
        row.analysisHash !== currentHash),
  );

  return {
    id: row.id,
    originalAvailable: Boolean(row.originalSnapshot),
    sha256: row.sha256,
    name: row.name,
    kind: row.kind as CreativeBrandReferenceKind,
    provenance: row.provenance,
    usageNote: row.usageNote,
    providerTransmissionAllowed: row.providerTransmissionAllowed,
    originalContentType: row.originalContentType,
    contentType: "image/webp",
    fileName: row.fileName,
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    version: row.version,
    isActive: row.isActive,
    contribution: readContribution(row.contribution),
    configVersion: row.configVersion,
    activatedForJourney: row.activatedForJourney,
    analysis,
    analysisRunAt: row.analysisRunAt ? row.analysisRunAt.toISOString() : null,
    analysisPromptVersion: row.analysisPromptVersion,
    analysisIsStale,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CreativeBrandReferenceNotFoundError extends Error {}
export class CreativeBrandReferenceConflictError extends Error {}

export async function reserveBrandAnalysisAttempt(topicId: string, limit: number): Promise<boolean> {
  const id = `${topicId}:${new Date().toISOString().slice(0, 10)}`;
  const rows = await db.insert(creativeBrandAnalysisQuota).values({ id, topicId, attempts: 1 })
    .onConflictDoUpdate({ target: creativeBrandAnalysisQuota.id,
      set: { attempts: sql`${creativeBrandAnalysisQuota.attempts} + 1` },
      setWhere: sql`${creativeBrandAnalysisQuota.attempts} < ${limit}` })
    .returning({ attempts: creativeBrandAnalysisQuota.attempts });
  return rows.length === 1;
}

export async function replaceBrandReferenceFile(previous: StoredCreativeBrandReference, input: CreateCreativeBrandReferenceInput): Promise<CreativeBrandReference> {
  const { revisions: _revisions, analysis: _analysis, ...revision } = previous;
  void _revisions; void _analysis;
  const [row] = await db.update(creativeBrandReferences).set({
    version: input.version, configVersion: previous.configVersion + 1,
    objectKey: input.objectKey, sha256: input.sha256, originalSnapshot: input.originalSnapshot,
    originalContentType: input.originalContentType, fileName: input.fileName, fileSize: input.fileSize,
    width: input.width, height: input.height, activatedForJourney: false,
    revisions: sql`${creativeBrandReferences.revisions} || ${JSON.stringify([revision])}::jsonb`, updatedAt: new Date(),
  }).where(and(eq(creativeBrandReferences.id, previous.id), eq(creativeBrandReferences.topicId, previous.topicId),
    eq(creativeBrandReferences.version, previous.version), eq(creativeBrandReferences.configVersion, previous.configVersion)))
    .returning();
  if (!row) throw new CreativeBrandReferenceConflictError("The reference changed while uploading. Reload and try again.");
  return publicBrandReference(row);
}
