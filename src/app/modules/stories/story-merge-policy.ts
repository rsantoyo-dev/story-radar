/**
 * How a new source contribution may change the shared `stories` row when its
 * canonical URL already exists (AGENTS.md §5).
 *
 * `stories` is global: every Topic that collected the URL reads the same row.
 * A later contribution therefore never replaces values an earlier one already
 * established; it may only fill a value that is missing or a known
 * placeholder. Every contribution keeps its own URL, source name and
 * acquisition time in `story_sources`, so nothing it carried is lost.
 *
 * - original URL: the first contribution's URL stays the Story's reference.
 * - title: kept, unless it is blank or the hostname fallback that manually
 *   added URLs use when the page has no title.
 * - language: kept, unless it is blank, `unknown` or `und`.
 * - region: kept, unless it is blank, `global` or `unknown` and the incoming
 *   region is specific.
 *
 * Content text keeps its existing rule in the repository: the same article
 * (same canonical URL) may be replaced only by a more complete extraction.
 *
 * These are SQL expressions for `INSERT ... ON CONFLICT (canonical_url) DO
 * UPDATE SET`, where `"stories"` is the existing row and `excluded` the
 * incoming one. They are plain strings so the repository and the database
 * test execute exactly the same SQL.
 */
const LANGUAGE_PLACEHOLDERS = `('', 'unknown', 'und')`;
const REGION_PLACEHOLDERS = `('', 'global', 'unknown')`;

const normalized = (column: string) => `lower(btrim(coalesce(${column}, '')))`;

/** Hostname of the stored original URL, i.e. the manual-URL title fallback. */
const ORIGINAL_URL_HOST = `lower(split_part(split_part("stories"."original_url", '://', 2), '/', 1))`;

export const STORY_CONFLICT_SQL = {
  originalUrl: `"stories"."original_url"`,
  title: `CASE
    WHEN btrim(coalesce("stories"."title", '')) = ''
      OR ${normalized(`"stories"."title"`)} = ${ORIGINAL_URL_HOST}
    THEN excluded."title"
    ELSE "stories"."title"
  END`,
  language: `CASE
    WHEN ${normalized(`"stories"."language"`)} IN ${LANGUAGE_PLACEHOLDERS}
    THEN excluded."language"
    ELSE "stories"."language"
  END`,
  region: `CASE
    WHEN ${normalized(`"stories"."region"`)} IN ${REGION_PLACEHOLDERS}
      AND ${normalized(`excluded."region"`)} NOT IN ${REGION_PLACEHOLDERS}
    THEN excluded."region"
    ELSE "stories"."region"
  END`,
} as const;
