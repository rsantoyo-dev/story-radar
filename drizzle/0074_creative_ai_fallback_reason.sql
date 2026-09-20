ALTER TABLE "creative_ai_runs" ADD COLUMN "fallback_reason" text;--> statement-breakpoint
UPDATE "creative_profiles" AS "profile"
SET "name" = "topic"."name",
    "updated_at" = now()
FROM "topics" AS "topic"
WHERE "profile"."topic_id" = "topic"."id"
  AND (
    (lower(trim("topic"."name")) = 'canada en breve' AND "profile"."name" = 'Press Craftor')
    OR (lower(trim("topic"."name")) LIKE 'perinatal%' AND "profile"."name" = 'Story Radar')
  );