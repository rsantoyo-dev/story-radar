// One-off dev utility: inserts a single test story with real step-by-step
// recipe text directly into the database, bypassing RSS collection, so it
// shows up in Story Review like any other story — purely to exercise the
// AI's "sequence" format recommendation without a real RSS feed.
//
// Usage: node scripts/seed-test-recipe-story.mjs [topicSlugOrId]
// With no argument, it lists your topics and exits.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
const sql = neon(databaseUrl);

const arg = process.argv[2]?.trim();

if (!arg) {
  const topics = await sql.query(
    "SELECT id, slug, name FROM topics WHERE is_active = true ORDER BY name",
  );
  console.log("Usage: node scripts/seed-test-recipe-story.mjs <topicSlugOrId>\n");
  console.log("Your active topics:");
  for (const topic of topics) {
    console.log(`  ${topic.slug}  (${topic.id})  — ${topic.name}`);
  }
  process.exit(topics.length === 0 ? 1 : 0);
}

const [topic] = await sql.query(
  "SELECT id, name FROM topics WHERE id::text = $1 OR slug = $1 LIMIT 1",
  [arg],
);
if (!topic) throw new Error(`No topic found matching "${arg}"`);

const storyId = randomUUID();
const now = new Date();
const canonicalUrl = `https://example.org/recipes/test-tourtiere-${storyId}`;

const title = "Tourtière du Lac-Saint-Jean, étape par étape";
const contentText = `Voici comment préparer une tourtière traditionnelle du Lac-Saint-Jean pour 8 personnes.

Ingrédients : 500 g de porc haché, 500 g de bœuf haché, 500 g de pommes de terre coupées en petits dés, 1 oignon haché, 2 feuilles de pâte brisée, sel, poivre et quatre-épices au goût.

Étape 1. Préchauffez le four à 180 °C (350 °F).

Étape 2. Dans un grand bol, mélangez le porc haché, le bœuf haché, l'oignon, le sel, le poivre et le quatre-épices jusqu'à ce que le mélange soit homogène.

Étape 3. Tapissez un plat à tarte profond avec la première feuille de pâte brisée.

Étape 4. Étalez la moitié du mélange de viande dans le fond, puis ajoutez une couche de pommes de terre en dés, puis le reste de la viande.

Étape 5. Versez environ 250 ml de bouillon de poulet chaud sur la préparation pour qu'elle reste humide pendant la longue cuisson.

Étape 6. Couvrez avec la seconde feuille de pâte, scellez les bords et pratiquez deux petites incisions sur le dessus pour laisser s'échapper la vapeur.

Étape 7. Faites cuire environ 3 heures, en couvrant la tourtière de papier d'aluminium après la première heure pour éviter que la croûte ne brûle.

Étape 8. Sortez la tourtière du four lorsque les pommes de terre sont tendres et laissez-la reposer 15 minutes avant de servir.`;

await sql.query(
  `INSERT INTO stories
     (id, canonical_url, original_url, title, content_text, content_status, language, region, first_seen_at, last_seen_at)
   VALUES ($1, $2, $2, $3, $4, 'full', 'fr', 'Canada', $5, $5)`,
  [storyId, canonicalUrl, title, contentText, now],
);
// relevance_score defaults to 0, which is below the ~25-point floor the
// editorial evaluator requires before it will even consider a story — set
// it high enough here to simulate an already-promising local score.
await sql.query(
  `INSERT INTO topic_stories (topic_id, story_id, relevance_score, first_seen_at, last_seen_at)
   VALUES ($1, $2, 80, $3, $3)`,
  [topic.id, storyId, now],
);

console.log(`Seeded story "${title}" (${storyId}) into topic "${topic.name}".`);
console.log("Find it in Story Review under 'Collected', check its box and approve/select it to move it to 'Selected', then use 'Open draft' → Generate new brief and carousel.");
