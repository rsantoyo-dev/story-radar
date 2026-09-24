// One-off dev utility: inserts a test story for a road closure that is in
// the MTMD feed *tonight*, so the verified-map path can be exercised in the
// UI before a real press release's closure dates arrive in the feed (the
// feed lists closures night by night; a release issued days ahead finds no
// row until then). The text is composed only from the official record's
// fields — route, direction, localisation, dates, works, closure wording and
// detour — never invented, and the source is the ministry's Québec 511 host.
//
// Usage: node scripts/seed-test-road-story.mjs <topicSlugOrIdOrName> [wfsRowId]
//        node scripts/seed-test-road-story.mjs                      # lists topics
// Default row: 172662 (A-30 ouest, Brossard). Pick another active LineString
// row with `npx tsx scripts/road-map-check.mts --row <id>`.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
const sql = neon(databaseUrl);

const arg = process.argv[2]?.trim();
const rowId = process.argv[3]?.trim() || "172662";

if (!arg) {
  const topics = await sql.query("SELECT id, slug, name FROM topics WHERE is_active = true ORDER BY name");
  console.log("Usage: node scripts/seed-test-road-story.mjs <topicSlugOrIdOrName> [wfsRowId]\n\nYour active topics:");
  for (const topic of topics) console.log(`  ${topic.slug}  (${topic.id})  — ${topic.name}`);
  process.exit(topics.length === 0 ? 1 : 0);
}

const [topic] = await sql.query("SELECT id, name FROM topics WHERE id::text = $1 OR slug = $1 OR lower(name) = lower($1) LIMIT 1", [arg]);
if (!topic) throw new Error(`No topic found matching "${arg}"`);

const ROAD_DATA_URL = "https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:chantiers_mtmdet&srsname=EPSG:4326&outputformat=geojson";
const response = await fetch(ROAD_DATA_URL, { signal: AbortSignal.timeout(25_000) });
if (!response.ok) throw new Error(`WFS responded ${response.status}`);
const feed = await response.json();
const feature = feed.features.find((f) => f.properties.identifiant === rowId);
if (!feature) throw new Error(`Row ${rowId} is not in the active feed`);
if (feature.geometry?.type !== "LineString") throw new Error(`Row ${rowId} is a ${feature.geometry?.type}; the renderer needs a LineString`);
const p = feature.properties;

const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const parse = (value) => { const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/.exec(value); return { year: m[1], month: months[Number(m[2]) - 1], day: Number(m[3]), time: `${Number(m[4])} h${Number(m[5]) ? ` ${m[5]}` : ""}` }; };
const start = parse(p.debut), end = parse(p.fin), updated = parse(p.miseAJour);
const when = start.day === end.day && start.month === end.month
  ? `le ${start.day} ${start.month} ${start.year}, de ${start.time} à ${end.time}`
  : `dans la nuit du ${start.day}${start.month === end.month ? "" : ` ${start.month}`} au ${end.day} ${end.month} ${end.year}, de ${start.time} à ${end.time}`;
const direction = p.direction.toLowerCase();
const localisation = p.localisation.replace(/^À\s+/u, "à ").trim();
const closure = p.entrave.replace(/\s+/g, " ").trim();
const detour = (p.detoursEtItinerairesFacultatifs || "").replace(/\s+/g, " ").trim();

const title = `[TEST] ${closure} : autoroute ${p.routeAutoroute}, en direction ${direction}, ${localisation}, ${when.replace(/, de .*$/, "")}`;
const contentText = [
  `Le ministère des Transports et de la Mobilité durable signale une entrave sur l'autoroute ${p.routeAutoroute}, en direction ${direction}, ${localisation}, ${when}.`,
  `Nature des travaux : ${p.identificationDesTravaux || "non précisée"}. Entrave : ${closure}.`,
  detour ? `Détours et itinéraires facultatifs : ${detour}.` : "Aucun détour n'est indiqué dans l'avis.",
  `Source : registre ${p.identifiant} (chantier ${p.identifiantChantier}) du service Québec 511, mis à jour le ${updated.day} ${updated.month} ${updated.year} à ${updated.time}. Avis de test composé uniquement à partir de ce registre.`,
].join("\n\n");

const storyId = randomUUID();
const now = new Date();
// The host is what the road-map adapter checks; the path marks the seed as a test.
const canonicalUrl = `https://www.quebec511.info/?test-road-story=${storyId}&entrave=${p.identifiant}`;

await sql.query(
  `INSERT INTO stories (id, canonical_url, original_url, title, content_text, content_status, language, region, published_at, first_seen_at, last_seen_at)
   VALUES ($1, $2, $2, $3, $4, 'full', 'fr', 'Quebec', $5, $5, $5)`,
  [storyId, canonicalUrl, title, contentText, now],
);
await sql.query(
  `INSERT INTO topic_stories (topic_id, story_id, relevance_score, first_seen_at, last_seen_at) VALUES ($1, $2, 80, $3, $3)`,
  [topic.id, storyId, now],
);

console.log(`Seeded test story ${storyId} into topic "${topic.name}" from WFS row ${p.identifiant} (chantier ${p.identifiantChantier}).\n`);
console.log(title + "\n\n" + contentText + "\n");
console.log("Check the match now:  npx tsx --env-file=.env.local scripts/road-map-check.mts " + storyId);
console.log("Then in the UI: Story Review → Collected → select it → Open draft → brief + script → approve → Generate images. The map slide must ask for geography (visualNeed verified-map, or « carte » in its visual direction).");
