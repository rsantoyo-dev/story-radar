CREATE TYPE "public"."rss_content_mode" AS ENUM('excerpt', 'full', 'auto');--> statement-breakpoint
CREATE TABLE "rss_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"language" text NOT NULL,
	"region" text NOT NULL,
	"content_mode" "rss_content_mode" DEFAULT 'auto' NOT NULL,
	"poll_every_minutes" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rss_sources_workspace_slug_unique" UNIQUE("workspace_id","slug"),
	CONSTRAINT "rss_sources_workspace_url_unique" UNIQUE("workspace_id","url"),
	CONSTRAINT "rss_sources_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "rss_sources_name_not_blank_check" CHECK (char_length(btrim("rss_sources"."name")) > 0),
	CONSTRAINT "rss_sources_slug_format_check" CHECK ("rss_sources"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "rss_sources_url_protocol_check" CHECK ("rss_sources"."url" ~* '^https?://'),
	CONSTRAINT "rss_sources_poll_interval_check" CHECK ("rss_sources"."poll_every_minutes" BETWEEN 5 AND 1440)
);
--> statement-breakpoint
CREATE TABLE "topic_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"rss_source_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_sources_topic_source_unique" UNIQUE("topic_id","rss_source_id"),
	CONSTRAINT "topic_sources_priority_check" CHECK ("topic_sources"."priority" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_workspace_slug_unique" UNIQUE("workspace_id","slug"),
	CONSTRAINT "topics_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "topics_name_not_blank_check" CHECK (char_length(btrim("topics"."name")) > 0),
	CONSTRAINT "topics_slug_format_check" CHECK ("topics"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workspaces_name_not_blank_check" CHECK (char_length(btrim("workspaces"."name")) > 0),
	CONSTRAINT "workspaces_slug_format_check" CHECK ("workspaces"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "rss_sources" ADD CONSTRAINT "rss_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_sources" ADD CONSTRAINT "topic_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_sources" ADD CONSTRAINT "topic_sources_workspace_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_sources" ADD CONSTRAINT "topic_sources_workspace_rss_source_fk" FOREIGN KEY ("workspace_id","rss_source_id") REFERENCES "public"."rss_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rss_sources_workspace_active_idx" ON "rss_sources" USING btree ("workspace_id","is_active");--> statement-breakpoint
CREATE INDEX "topic_sources_workspace_topic_enabled_idx" ON "topic_sources" USING btree ("workspace_id","topic_id","enabled");--> statement-breakpoint
CREATE INDEX "topic_sources_rss_source_id_idx" ON "topic_sources" USING btree ("rss_source_id");--> statement-breakpoint
CREATE INDEX "topics_workspace_active_idx" ON "topics" USING btree ("workspace_id","is_active");--> statement-breakpoint
INSERT INTO "workspaces" ("id", "name", "slug")
VALUES ('default', 'Story Radar', 'default')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "topics" ("workspace_id", "name", "slug", "description")
VALUES ('default', 'Tech', 'tech', 'Technology and AI news')
ON CONFLICT ("workspace_id", "slug") DO NOTHING;--> statement-breakpoint
INSERT INTO "rss_sources" (
  "workspace_id",
  "slug",
  "name",
  "url",
  "language",
  "region",
  "content_mode",
  "poll_every_minutes"
)
VALUES
  ('default', 'openai-news', 'OpenAI News', 'https://openai.com/news/rss.xml', 'en', 'global', 'auto', 30),
  ('default', 'google-ai', 'Google AI', 'https://blog.google/innovation-and-ai/technology/ai/rss/', 'en', 'global', 'excerpt', 30),
  ('default', 'microsoft-ai', 'Microsoft — AI', 'https://news.microsoft.com/source/tag/ai/feed/', 'en', 'global', 'excerpt', 30),
  ('default', 'nvidia-ai', 'NVIDIA — AI', 'https://blogs.nvidia.com/blog/category/generative-ai/feed/', 'en', 'global', 'full', 30),
  ('default', 'google-deepmind', 'Google DeepMind', 'https://deepmind.google/blog/rss.xml', 'en', 'global', 'excerpt', 60),
  ('default', 'cloudflare-ai', 'Cloudflare — AI', 'https://blog.cloudflare.com/tag/ai/rss/', 'en', 'global', 'full', 30),
  ('default', 'github-copilot', 'GitHub Copilot Changelog', 'https://github.blog/changelog/label/copilot/feed/', 'en', 'global', 'full', 30),
  ('default', 'mozilla-ai', 'Mozilla.ai', 'https://blog.mozilla.ai/rss/', 'en', 'global', 'full', 60),
  ('default', 'zapier-blog', 'Zapier Blog', 'https://zapier.com/blog/feeds/latest/', 'en', 'global', 'auto', 60),
  ('default', 'techcrunch-ai', 'TechCrunch — Artificial Intelligence', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'en', 'global', 'auto', 30),
  ('default', 'venturebeat-ai', 'VentureBeat — AI', 'https://venturebeat.com/category/ai/feed/', 'en', 'global', 'full', 30)
ON CONFLICT DO NOTHING;--> statement-breakpoint
WITH seed (slug, enabled, tags, priority) AS (
  VALUES
    ('openai-news', true, ARRAY['ai', 'products', 'business', 'automation']::text[], 0),
    ('google-ai', true, ARRAY['ai', 'products', 'productivity', 'research']::text[], 0),
    ('microsoft-ai', true, ARRAY['ai', 'copilot', 'products', 'business']::text[], 0),
    ('nvidia-ai', true, ARRAY['ai', 'models', 'hardware', 'robotics', 'open-source']::text[], 0),
    ('google-deepmind', true, ARRAY['ai', 'research', 'models', 'science', 'safety']::text[], 0),
    ('cloudflare-ai', true, ARRAY['ai', 'agents', 'security', 'infrastructure', 'developers']::text[], 0),
    ('github-copilot', true, ARRAY['ai', 'coding', 'developers', 'agents', 'products']::text[], 0),
    ('mozilla-ai', true, ARRAY['ai', 'open-source', 'privacy', 'developers', 'agents']::text[], 0),
    ('zapier-blog', true, ARRAY['automation', 'ai', 'productivity', 'small-business']::text[], 0),
    ('techcrunch-ai', true, ARRAY['ai', 'news', 'startups', 'business']::text[], 0),
    ('venturebeat-ai', true, ARRAY['ai', 'enterprise', 'business', 'technology']::text[], 0)
)
INSERT INTO "topic_sources" (
  "workspace_id",
  "topic_id",
  "rss_source_id",
  "enabled",
  "tags",
  "priority"
)
SELECT
  'default',
  topic.id,
  source.id,
  seed.enabled,
  seed.tags,
  seed.priority
FROM seed
JOIN "topics" AS topic
  ON topic.workspace_id = 'default' AND topic.slug = 'tech'
JOIN "rss_sources" AS source
  ON source.workspace_id = 'default' AND source.slug = seed.slug
ON CONFLICT ("topic_id", "rss_source_id") DO NOTHING;
