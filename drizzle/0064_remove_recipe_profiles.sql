-- RCP-02 (culinary profile) is dropped entirely — recipes stop being their
-- own product vertical and become a "sequence" post type built from Story
-- Review, same as any other draft.
DROP TABLE IF EXISTS "recipe_profiles";
DROP TYPE IF EXISTS "public"."recipe_difficulty";
