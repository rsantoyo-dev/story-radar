ALTER TABLE "collection_runs" ADD COLUMN "exact_duplicates_removed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "similar_duplicates_removed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "ready_items" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "needs_enrichment_items" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "review_items" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_runs" ADD COLUMN "rejected_items" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "collection_runs"
SET
  "exact_duplicates_removed" = "duplicates_removed",
  "review_items" = "included_items";--> statement-breakpoint
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_duplicate_types_check" CHECK ("collection_runs"."exact_duplicates_removed" >= 0
        AND "collection_runs"."similar_duplicates_removed" >= 0
        AND "collection_runs"."duplicates_removed" = "collection_runs"."exact_duplicates_removed" + "collection_runs"."similar_duplicates_removed");--> statement-breakpoint
ALTER TABLE "collection_runs" ADD CONSTRAINT "collection_runs_relevance_check" CHECK ("collection_runs"."ready_items" >= 0
        AND "collection_runs"."needs_enrichment_items" >= 0
        AND "collection_runs"."review_items" >= 0
        AND "collection_runs"."rejected_items" >= 0
        AND "collection_runs"."included_items" = "collection_runs"."ready_items" + "collection_runs"."needs_enrichment_items" + "collection_runs"."review_items" + "collection_runs"."rejected_items");
