import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid, boolean } from "drizzle-orm/pg-core";
import { topics } from "./topics";
import { topicStories } from "./topic-stories";
import type { EditorialLineConfig, EditorialCollectionContext } from "@/app/modules/editorial-lines/editorial-lines";
export const editorialLines = pgTable("editorial_lines", {
  id:uuid("id").defaultRandom().primaryKey(),topicId:uuid("topic_id").notNull().references(()=>topics.id,{onDelete:"cascade"}),
  revision:integer("revision").notNull().default(1),archived:boolean("archived").notNull().default(false),
  config:jsonb("config").$type<EditorialLineConfig>().notNull(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).defaultNow().notNull(),
}, t=>[unique("editorial_lines_topic_id_unique").on(t.topicId,t.id)]);
export const editorialLineRevisions = pgTable("editorial_line_revisions",{
  lineId:uuid("line_id").notNull().references(()=>editorialLines.id,{onDelete:"cascade"}),revision:integer("revision").notNull(),config:jsonb("config").$type<EditorialLineConfig>().notNull(),archived:boolean("archived").notNull(),
},t=>[primaryKey({columns:[t.lineId,t.revision]})]);
export const editorialCollectionRuns = pgTable("editorial_collection_runs",{
  id:uuid("id").primaryKey(),topicId:uuid("topic_id").notNull().references(()=>topics.id,{onDelete:"cascade"}),lineId:uuid("line_id"),
  context:jsonb("context").$type<EditorialCollectionContext>(),status:text("status").notNull().default("running"),
  result:jsonb("result").$type<Record<string,unknown>>(),error:text("error"),
  startedAt:timestamp("started_at",{withTimezone:true}).defaultNow().notNull(),finishedAt:timestamp("finished_at",{withTimezone:true}),
},t=>[unique("editorial_collection_runs_topic_id_unique").on(t.topicId,t.id),index("editorial_collection_runs_budget_idx").on(t.topicId,t.startedAt),foreignKey({columns:[t.topicId,t.lineId],foreignColumns:[editorialLines.topicId,editorialLines.id]})]);
export const editorialStoryContexts = pgTable("editorial_story_contexts",{
  topicId:uuid("topic_id").notNull(),storyId:uuid("story_id").notNull(),runId:uuid("run_id").notNull(),context:jsonb("context").$type<EditorialCollectionContext>().notNull(),
  reasons:text("reasons").array().notNull(),createdAt:timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
},t=>[primaryKey({columns:[t.topicId,t.storyId,t.runId]}),foreignKey({columns:[t.topicId,t.storyId],foreignColumns:[topicStories.topicId,topicStories.storyId],name:"editorial_story_contexts_story_fk"}).onDelete("cascade"),foreignKey({columns:[t.topicId,t.runId],foreignColumns:[editorialCollectionRuns.topicId,editorialCollectionRuns.id],name:"editorial_story_contexts_run_fk"}).onDelete("cascade")]);
