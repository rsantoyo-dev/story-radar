import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { topics } from "./topics";
import { stories } from "./stories";
import type { Draft2Fact, Draft2FactsEvaluation, Draft2FactsRound, Draft2Threads, Draft2TraceEntry } from "@/app/modules/draft2/draft2-facts.types";
import type { Draft2Closing } from "@/app/modules/draft2/draft2-closing.types";
import type { Draft2Deck } from "@/app/modules/draft2/draft2-deck.types";
import type { Draft2Inventory } from "@/app/modules/draft2/draft2-inventory.types";
import type { Draft2Visual } from "@/app/modules/draft2/draft2-visual.types";
import type { Draft2Images } from "@/app/modules/draft2/draft2-images.types";
import type { Draft2Mentions } from "@/app/modules/draft2/draft2-mentions.types";
import type { Draft2Caption } from "@/app/modules/draft2/draft2-caption.types";
import type { Draft2Publication } from "@/app/modules/draft2/draft2-publication.types";
import type { Draft2Review } from "@/app/modules/draft2/draft2-review.types";
import type { Draft2Focus } from "@/app/modules/draft2/draft2-focus.types";
import type { Draft2Opening } from "@/app/modules/draft2/draft2-opening.types";

/**
 * One run of the Draft 2 pipeline for a story. Vercel functions keep nothing
 * between requests, so "the facts in memory" and the provider conversations
 * (the OpenAI response chain, Claude's cached transcript) live here, checkpointed
 * after every provider call so a later step can continue the same context.
 */
export const draft2Sessions = pgTable("draft2_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").notNull().references(() => stories.id, { onDelete: "cascade" }),
  step: text("step").notNull().default("facts"),
  status: text("status").notNull().default("running"),
  /** The latest facts list (verified when status is ready). */
  facts: jsonb("facts").$type<Draft2Fact[]>(),
  /** The reviewer's latest verdict on that list. */
  evaluation: jsonb("evaluation").$type<Draft2FactsEvaluation>(),
  /** The facts rounds. */
  rounds: jsonb("rounds").$type<Draft2FactsRound[]>().notNull().default(sql`'[]'::jsonb`),
  /** Step 2: what the story is for (line, audience, framing, structure, goal, voice, direction), Claude's values and the editor's changes. */
  focus: jsonb("focus").$type<Draft2Focus>(),
  /** Step 3: the cover and slide 2, every round's candidates and verdicts, the winner, the editor's choice and the focus it followed. */
  opening: jsonb("opening").$type<Draft2Opening>(),
  /** Step 4: the penultimate and last slides (or the last alone), every round, the winner, the editor's choice, the opening it ends and the focus it followed. */
  closing: jsonb("closing").$type<Draft2Closing>(),
  /** Step 5: the slides between slide 2 and the closing, every round, the winner, the editor's choice, and the opening and closing it connects. */
  deck: jsonb("deck").$type<Draft2Deck>(),
  /** The review between the deck and the visual script: the whole carousel read by a reader and an editor, with the patches and what they replaced. */
  review: jsonb("review").$type<Draft2Review>(),
  /** Step 6: the people, places and organizations the facts name, their verified material, the editor's confirmations and the characters choice. */
  inventory: jsonb("inventory").$type<Draft2Inventory>(),
  /** Step 7: the visual script, every round, the winner, the editor's choice, and what it scripted and followed. */
  visual: jsonb("visual").$type<Draft2Visual>(),
  /** Step 8: the slides' images as runs of attempts (generated, reviewed, corrected), the version each slide shows, and earlier runs. The image files live in R2. */
  images: jsonb("images").$type<Draft2Images>(),
  /** Step 9, before the caption: the Instagram accounts it may tag, checked on Instagram and confirmed by the editor. */
  mentions: jsonb("mentions").$type<Draft2Mentions>(),
  /** Step 9: the post caption, every round, the winner, the editor's choice, and what it wrote for. */
  caption: jsonb("caption").$type<Draft2Caption>(),
  /** Step 10: what the editor approved and the v1 draft and batch it was copied into for v1's publication. */
  publication: jsonb("publication").$type<Draft2Publication>(),
  threads: jsonb("threads").$type<Draft2Threads>().notNull().default(sql`'{}'::jsonb`),
  trace: jsonb("trace").$type<Draft2TraceEntry[]>().notNull().default(sql`'[]'::jsonb`),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("draft2_sessions_story_idx").on(t.topicId, t.storyId, t.createdAt),
  check("draft2_sessions_status_check", sql`${t.status} IN ('running','ready','needs-review','failed')`),
]);

export type Draft2SessionRow = typeof draft2Sessions.$inferSelect;
