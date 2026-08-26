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

## UXDSL Design System

.uxdsl-card {
    @ds-surface (contained);
    width: xs(100%) md(400px);
    border-radius: radius(3);
    box-shadow: shadow(3);
    transition: all 0.2s;
    overflow: hidden;
  }

  .card-header {
    background: linear-gradient(135deg, palette(primary-main), palette(primary-dark));
    padding: density(6);
    display: grid;
    place-items: center;
  }

  .logo-circle {
    @ds-surface (contained light);
    width: density(10);
    height: density(10);
    border-radius: radius(full);
    display: grid;
    place-items: center;
    box-shadow: shadow(2);
  }

  .card-logo {
    width: 60%;
    height: auto;
  }

  .card-body {
    padding: density(5);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: density(3);
  }

  .card-title {
    @ds-typo (h5);
    color: palette(primary-main);
  }

  .card-desc {
    @ds-typo (body);
    color: palette(primary-main);
  }

  .card-actions {
    padding: density(4);
    border-top: border(1);
    display: flex;
    gap: density(2);
  }

  .btn-primary {
    @ds-button (contained primary);
    width: 100%;
    justify-content: center;
  }

  .btn-secondary {
    @ds-button (outlined neutral);
    width: 100%;
    justify-content: center;
  }

https://uxdsl.io/docs/breakpoints
#DemoBreakpointsCards {
display: flex;
flex-direction: xs(column) md(row);
gap: xs(space(2)) md(space(4));
padding: xs(space(3)) md(space(6));
}
https://uxdsl.io/docs/colors
https://uxdsl.io/docs/palette
.my-element
{
background:palette(primary-main);
color:palette(primary-contrast);
}
https://uxdsl.io/docs/spacing
.any-class {
  padding: space(15);
}
https://uxdsl.io/docs/densities
prioritaze densities over spacing
.any-class {
  padding: density(14);
}
https://uxdsl.io/docs/typography
.any-class
{
@ds-typo
(
h1
)
;
}
https://uxdsl.io/docs/borders
.element {
  border: border(1, palette(primary-main), solid);
  border-radius: radius(2);
  width: 200px;
  height: 200px;
}
https://uxdsl.io/docs/shadows
please pply to all components, and check also palette primary main, make every color using palette, same as typograpphy [https://uxdsl.io/docs/typography](https://uxdsl.io/docs/typography) [https://uxdsl.io/docs/colors](https://uxdsl.io/docs/colors)
https://uxdsl.io/docs/surfaces
.my-element {
  background-color: palette(primary-main);
  color: palette(primary-contrast);
  padding: density(2);
  border-radius: radius(2);
  border: none;
  box-shadow: shadow(1);
}
https://uxdsl.io/docs/buttons
.my-button {
  @ds-button(contained primary density(2) radius(2) shadow(1));
}
https://uxdsl.io/docs/inputs
.my-input {
  @ds-input(outlined neutral density(2) radius(2));
}


UXDSL is the source of truth for new design tokens and responsive CSS. Tokens
are defined in `uxdsl.config.js`; the compiler is configured in
`postcss.config.mjs`. Use the existing green Press Craftor palette rather than
introducing a purple default theme.

For new or touched styles, prefer UXDSL tokens over hard-coded values:

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

Use these primitives consistently:

- Responsive values: `xs(...)`, `sm(...)`, `md(...)`, `lg(...)`, `xl(...)`.
- Spacing: `space(n)` for scale values and `density(n)` for control/layout
	density.
- Colors: `color(family-shade)` or `palette(tone-main)`.
- Elevation and shape: `shadow(n)`, `border(n, color, style)`, and
	`radius(n)`.
- Typography: `@ds-typo(h1)`, `@ds-typo(body)`, and the documented variants.
- Controls: `@ds-button(variant tone density(n) radius(n) shadow(n))` and
	`@ds-input(variant tone density(n) radius(n) shadow(n))`.
- Surfaces: `@ds-surface(variant tone density(n) radius(n) shadow(n))`.

CSS Modules remain supported. Migrate touched surfaces incrementally, avoid
rewriting unrelated styles, and keep layout behavior stable at the configured
breakpoints: `xs: 0`, `sm: 640`, `md: 768`, `lg: 1024`, and `xl: 1280`.
