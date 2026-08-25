CREATE TABLE "radar_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"favored_terms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"unfavored_terms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "radar_preferences" ("id", "favored_terms", "unfavored_terms")
VALUES (
	'default',
	ARRAY['canada', 'canadian', 'toronto', 'ontario', 'quebec', 'vancouver']::text[],
	ARRAY['india']::text[]
)
ON CONFLICT ("id") DO NOTHING;
