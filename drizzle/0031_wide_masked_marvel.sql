ALTER TABLE "creative_profiles" ADD COLUMN "conversion_goal" text DEFAULT 'followers' NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD CONSTRAINT "creative_profiles_conversion_goal_check" CHECK ("creative_profiles"."conversion_goal" IN ('followers', 'discussion', 'saves', 'shares'));--> statement-breakpoint
UPDATE "creative_profiles"
SET "call_to_action_style" = 'Use one natural call to action aligned with the primary conversion goal. State a concrete audience benefit without engagement bait or artificial urgency.'
WHERE "call_to_action_style" = 'Invite informed discussion without engagement bait or artificial urgency.';
