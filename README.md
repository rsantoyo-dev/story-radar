# Press Craftor

Press Craftor is an editorial operations platform that turns news, research,
and owned materials into high-quality social content while preserving factual
rigor, brand identity, and human approval.

It collects signals from RSS feeds, uploaded documents, owned content, and
AI-assisted research. Stories are organized, deduplicated, filtered, and
evaluated for editorial priority and growth potential. Once an editor selects
a story, the creative workflow turns verified facts into an editable brief,
script, and visual package matched to the brand's audience, language, format,
and conversion goal.

Each brand has a Creative Profile that defines personality, tone, visual
guidance, logo treatment, palette, and carousel numbering. Structured
validation and AI review check factual accuracy, clarity, CTA quality, and
storytelling before approval. Human approval remains required before creative
assets become publishable.

## Technical requirements

- Node.js and npm.
- A Neon PostgreSQL database.
- Provider credentials only for the workflows that will be used. See
  [`.env.example`](.env.example) for every supported integration.

The application uses the Next.js 16 App Router. UI and route handlers live in
`src/app`, server-only domain logic in `src/app/modules`, the Drizzle schema in
`src/db/schema`, and SQL migrations in `drizzle`.

## Local setup

Install the exact dependency versions from the lockfile:

```bash
npm ci
```

Create the local environment file:

```bash
cp .env.example .env.local
```

For the application shell, database-backed screens, and RSS collection, set at
least:

```dotenv
DATABASE_URL="postgresql://...-pooler.neon.tech/..."
DATABASE_URL_DIRECT="postgresql://...neon.tech/..."
RADAR_COLLECTOR_SECRET="a-long-random-secret"
```

`DATABASE_URL` is the pooled runtime connection. `DATABASE_URL_DIRECT` is used
by Drizzle CLI operations. Keep both server-only and never prefix them with
`NEXT_PUBLIC_`.

Apply the existing migrations before using the application:

```bash
npm run db:migrate
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Enter the value configured
as `RADAR_COLLECTOR_SECRET` when the dashboard requests administrative access.
The main UI entry point is `src/app/page.tsx`.

Use the HTTPS development command when testing an integration whose callback
requires HTTPS, such as Instagram OAuth:

```bash
npm run dev:https
```

## Provider configuration

The complete configuration and defaults are documented inline in
`.env.example`. Configure only the capabilities needed by the environment:

| Capability | Main configuration |
| --- | --- |
| Editorial and creative text | Gemini; optional Groq and Cloudflare fallbacks |
| AI research and high-quality review | OpenAI |
| Creative image generation | fal.ai |
| Private image and reference storage | Cloudflare R2 |
| Instagram connection and publishing | Meta app, encryption, public app URL, and worker secrets |
| Place imagery preview | Google Maps, optionally enabled |
| Geographic documentary assets | OpenAI, Wikimedia contact, and optional source adapters |

Missing optional credentials disable or limit their corresponding workflow;
they are not needed merely to compile the project. Runtime database operations
still require `DATABASE_URL`.

## Process flow

1. Collect stories from RSS, documents, owned content, or AI research.
2. Normalize, deduplicate, filter, and score candidates.
3. Select a story and produce an evidence-bound creative brief and draft.
4. Review and edit the copy, visual direction, and generated assets.
5. Approve an immutable publication package.
6. Publish through the independent Instagram worker when that integration is
   configured and explicitly authorized.

## Database changes

After changing files under `src/db/schema`, generate and inspect a migration:

```bash
npm run db:generate
npm run db:check
```

Apply approved migrations with `npm run db:migrate`. `db:check` validates the
migration history; it does not prove that a remote database has applied every
migration.

## Instagram publication worker

Publishing orders are persistent and are resumed by a separate process. Once
the Meta, R2, delivery URL, and worker settings in `.env.local` are configured,
run this alongside the application:

```bash
npm run worker:instagram
```

For a single scheduler-friendly pass:

```bash
npm run worker:instagram -- --once
```

The worker may publish previously authorized pending jobs. Use a test database
and test account for QA. Full local setup, recovery behavior, and ngrok steps
are documented in
[`docs/features/instagram-publishing-worker.md`](docs/features/instagram-publishing-worker.md).

## Validation

Run the focused checks expected for repository changes:

```bash
npm test
npm run lint
npm run build
```

For schema or migration changes, also run:

```bash
npm run db:check
```

The unit and database tests use mocks and in-memory PostgreSQL where
appropriate. They do not publish to Instagram or connect to the configured
production database. Provider and end-to-end publication flows still require
manual QA with dedicated test credentials.

## UXDSL

UXDSL is the design-token and responsive CSS layer for this project. Tokens
are defined in `uxdsl.config.js` and compiled through PostCSS. Use UXDSL
functions in new global CSS or CSS Modules instead of hard-coded spacing,
colors, radii, shadows, or responsive values:

```css
.stress-grid {
  display: grid;
  grid-template-columns: xs(1fr) md(repeat(auto-fill, minmax(120px, 1fr)));
  gap: density(2);
}

.stress-card {
  @ds-surface(flat primary radius(3));
  padding: space(4);
  box-shadow: shadow(2);
}
```

Use `@ds-button(...)` and `@ds-input(...)` for controls, `@ds-typo(...)` for
shared typography, and the existing Press Craftor palette instead of adding a
default theme. CSS Modules remain supported and should be migrated
incrementally when touched.

## Deployment notes

The Next.js application can run on a compatible Node.js hosting platform. A
complete production environment must provide the runtime variables used by its
enabled workflows, an applied Neon schema, and durable R2 storage for private
creative assets.

Instagram publication additionally needs:

- a stable public HTTPS `RADAR_APP_URL` for OAuth callbacks and delivery files;
- a continuously supervised `worker:instagram` process, or an external
  scheduler calling the internal resume endpoint;
- matching `INSTAGRAM_PUBLISH_WORKER_SECRET` values in the app and worker.

The repository does not currently provision hosting, a worker supervisor, or a
scheduler automatically.
