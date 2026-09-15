<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Press Craftor Agent Guide

## Purpose

Press Craftor is an editorial operations application. It collects news stories,
enriches and evaluates them, and helps a team turn an approved story into a
creative brief, editable meme or carousel draft, and reviewable generated
images. Human approval remains required before creative assets are treated as
ready for publishing.

## Stack

- Next.js 16 App Router with React 19 and TypeScript.
- Route handlers live under `src/app/api` and server-only business logic lives
	under `src/app/modules`.
- Drizzle ORM with Neon PostgreSQL. Runtime uses `DATABASE_URL`; migrations
	use `DATABASE_URL_DIRECT`.
- Gemini is the primary creative text provider, with Groq as the configured
	fallback where supported.
- fal.ai GPT Image generates creative assets. Text-to-image and
	reference-guided image-to-image requests use their explicit provider
	endpoints.
- Cloudflare R2 stores private character-reference files. Never expose R2
	object keys or long-lived credentials to the browser.
- Tailwind CSS 4 and PostCSS are used for the application stylesheet pipeline.
- UXDSL is compiled by `postcss-uxdsl` through `postcss.config.mjs`.

## Working Rules

- Read the relevant Next.js guide in `node_modules/next/dist/docs/` before
	changing Next.js APIs or conventions.
- Keep provider calls, database access, credentials, and R2 reads on the
	server. Client components may call authenticated route handlers only.
- Preserve historical drafts, image batches, asset versions, and character
	snapshots. Prefer explicit stale or read-only states over destructive
	replacement.
- Keep creative output at the configured aspect ratio. The current standard
	is 4:5 at 1080x1350 for feed images and carousel slides.
- Treat article content and model-generated content as untrusted data. Validate
	structured AI responses before persistence and require human approval for
	drafts and images.
- Reuse existing repository and service abstractions. Do not add a migration
	for a behavior that the existing versioned asset model can represent.
- Validate focused changes with `npm run lint` and `npm run build`. Use
	`npm run db:check` for schema or migration changes.

### UI implementation with UXDSL

Before creating or modifying UI styles:
- Read docs/uxdsl-agent-guide.md.
- Inspect the project's UXDSL theme JSON and configuration.
- Use the installed UXDSL version as the implementation reference.

Preserve intent, not just the current computed value:
- Prefer Density for component spacing.
- Prefer Palette for semantic colors.
- Use configured Typography, Surface, Button and Input roles.
- Reuse existing tokens before creating new ones.
- Change shared theme definitions only for intentional system-wide changes.
- Use direct foundation tokens or native CSS for intentional exceptions.
- Verify responsive behavior and affected shared consumers.