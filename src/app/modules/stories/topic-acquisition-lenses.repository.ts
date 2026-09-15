import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { topicAcquisitionLenses } from "@/db/schema";

import {
  AcquisitionLensError,
  parseTopicAcquisitionTaxonomyPublication,
  parseTopicAcquisitionLenses,
  type TopicAcquisitionTaxonomy,
  type TopicAcquisitionTaxonomyPublication,
} from "./acquisition-lenses";

export class TopicAcquisitionTaxonomyNotFoundError extends Error {}
export class TopicAcquisitionTaxonomyConflictError extends Error {}

/** Returns the current topic snapshot; Editorial Line overrides are not active in v1. */
export async function getCurrentTopicAcquisitionTaxonomy(
  topicId: string,
): Promise<TopicAcquisitionTaxonomy> {
  const [snapshot] = await db
    .select()
    .from(topicAcquisitionLenses)
    .where(
      and(
        eq(topicAcquisitionLenses.topicId, topicId),
        isNull(topicAcquisitionLenses.lineId),
      ),
    )
    .orderBy(desc(topicAcquisitionLenses.taxonomyVersion))
    .limit(1);

  if (!snapshot) {
    throw new TopicAcquisitionTaxonomyNotFoundError(
      "This topic has no acquisition taxonomy. Run the database migrations.",
    );
  }

  try {
    return {
      topicId: snapshot.topicId,
      taxonomyVersion: snapshot.taxonomyVersion,
      lenses: parseTopicAcquisitionLenses(snapshot.lenses),
    };
  } catch (error) {
    if (error instanceof AcquisitionLensError) {
      throw new TopicAcquisitionTaxonomyNotFoundError(
        "This topic's acquisition taxonomy is invalid.",
      );
    }
    throw error;
  }
}

/** Publishes a new immutable topic-level snapshot after an optimistic version check. */
export async function publishTopicAcquisitionTaxonomy(
  topicId: string,
  input: TopicAcquisitionTaxonomyPublication,
): Promise<TopicAcquisitionTaxonomy> {
  const publication = parseTopicAcquisitionTaxonomyPublication(input);

  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(topicAcquisitionLenses)
      .where(
        and(
          eq(topicAcquisitionLenses.topicId, topicId),
          isNull(topicAcquisitionLenses.lineId),
        ),
      )
      .orderBy(desc(topicAcquisitionLenses.taxonomyVersion))
      .limit(1)
      .for("update");

    if (!current) {
      throw new TopicAcquisitionTaxonomyNotFoundError(
        "This topic has no acquisition taxonomy. Run the database migrations.",
      );
    }
    if (current.taxonomyVersion !== publication.expectedTaxonomyVersion) {
      throw new TopicAcquisitionTaxonomyConflictError(
        "The acquisition taxonomy changed. Reload it before publishing.",
      );
    }

    const [created] = await transaction
      .insert(topicAcquisitionLenses)
      .values({
        topicId,
        taxonomyVersion: current.taxonomyVersion + 1,
        lenses: publication.lenses,
      })
      .returning();

    if (!created) throw new Error("The acquisition taxonomy could not be published");
    return {
      topicId: created.topicId,
      taxonomyVersion: created.taxonomyVersion,
      lenses: parseTopicAcquisitionLenses(created.lenses),
    };
  });
}