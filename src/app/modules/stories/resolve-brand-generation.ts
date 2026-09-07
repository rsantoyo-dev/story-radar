import "server-only";
import { createHash } from "node:crypto";
import type { BrandReferenceSelection } from "./creative-content.types";
import type { BrandGenerationReference } from "./creative-brand-generation";
import { findCreativeBrandReference } from "./creative-brand-references.repository";
import { parseCreativeBrandContribution, brandContributionIsConfigured } from "./creative-brand-reference-metadata";
import { getBrandReferenceSelectionBudget } from "./select-brand-references";
import { readPrivateR2ImageFile } from "./r2-storage";

export async function resolveBrandGenerationReferences(topicId: string, selection?: BrandReferenceSelection): Promise<BrandGenerationReference[]> {
  return Promise.all((selection?.selected ?? []).map(async (entry) => {
    const row = await findCreativeBrandReference(topicId, entry.id);
    if (!row || !row.isActive || !row.activatedForJourney || !row.providerTransmissionAllowed ||
        row.version !== entry.version || row.configVersion !== entry.configVersion) {
      throw new Error("A selected brand reference changed or cannot be sent. Save a new draft version to refresh its references.");
    }
    const contribution = parseCreativeBrandContribution(row.contribution);
    if (!brandContributionIsConfigured(contribution)) throw new Error("Brand reference guidance is missing.");
    return { ...entry, usageNote: row.usageNote, provenance: row.provenance, topicId, name: row.name, objectKey: row.objectKey, sha256: row.sha256,
      contentType: row.contentType, fileName: row.fileName, contribution };
  }));
}

export async function loadBrandGenerationImages(references: BrandGenerationReference[], characterImageCount: number): Promise<File[]> {
  assertBrandGenerationBudget(references.length, characterImageCount);
  const files: File[] = [];
  let bytes = 0;
  for (const reference of references) {
    await assertBrandReferenceEligibility([reference]);
    if (!(await findCreativeBrandReference(reference.topicId, reference.id))?.activatedForJourney) throw new Error("A brand reference is disabled for generation.");
    const file = await readPrivateR2ImageFile({ ...reference, signal: AbortSignal.timeout(20_000) });
    bytes += file.size;
    if (bytes > 20 * 1024 * 1024) throw new Error("Brand references exceed the 20 MB transmission budget.");
    if (createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex") !== reference.sha256) {
      throw new Error("Brand reference bytes do not match their saved snapshot.");
    }
    files.push(file);
  }
  return files;
}

export async function assertBrandReferenceEligibility(references: BrandGenerationReference[]): Promise<void> {
  for (const reference of references) {
    const current = await findCreativeBrandReference(reference.topicId, reference.id);
    if (!current?.isActive || !current.providerTransmissionAllowed ||
        current.version !== reference.version || current.sha256 !== reference.sha256 || (current.usageNote ?? null) !== (reference.usageNote ?? null)) {
      throw new Error("A stored brand reference is no longer eligible for use. Its historical image remains unchanged.");
    }
  }
}

export function assertBrandGenerationBudget(brandCount: number, otherCount: number): void {
  const budget = getBrandReferenceSelectionBudget();
  if (brandCount > budget.maxPerUnit || brandCount + otherCount > budget.maxUnitReferenceImages) throw new Error("The selected character, brand and base images exceed the reference budget. Reduce the selected references.");
}
