# Press Craftor

Press Craftor is an editorial operations platform that turns news, research,
and owned materials into high-quality social content while preserving factual
rigor, brand identity, and human approval.

It starts by collecting signals from RSS feeds, uploaded documents such as
PDFs and reports, and AI-assisted research. The AI research source acts like
another feed provider: it finds recent stories according to a topic, region,
time window, and editorial criteria chosen by the team. The platform is also
evolving to accept directly submitted stories and source material, supporting
campaigns, brand announcements, internal research, and other owned content.

Collected stories are organized, deduplicated, filtered, and evaluated using
both local rules and AI. Press Craftor measures editorial priority—how reliable
and useful a story is for a channel—alongside growth potential: its ability to
bring in new audiences, create conversation, or become clear, shareable
content.

Once an editor selects a story, the creative workflow turns verified facts into
a brief and an editable script matched to the brand's audience, language,
format, and conversion goal. Structured validation and high-capacity AI review
check factual accuracy, editorial clarity, CTA quality, and storytelling before
anything is approved. Human approval remains required.

Each brand has a Creative Profile that defines personality, tone, visual
guidance, logo treatment, palette, and carousel numbering style. Those settings
guide the creation of memes, carousels, and companion Stories, including empty
zones for native Instagram polls, questions, quizzes, or sliders. Press Craftor
can recommend the best interaction for the image while keeping that sticker
outside the generated artwork.

The result is one editorial chain: discover, verify, prioritize, write, review,
design, and approve. Future work extends this foundation to video and
multi-format campaign production, using the same principle: AI-assisted
creativity directed by evidence, brand systems, and human judgment.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## UXDSL

UXDSL is the design-token and responsive CSS layer for this project. Tokens
are defined in [`uxdsl.config.js`](uxdsl.config.js) and compiled through
PostCSS. Use UXDSL functions in new global CSS or CSS Modules instead of
hard-coded spacing, colors, radii, shadows, or responsive values:

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

Use `@ds-button(...)` and `@ds-input(...)` for new controls, and use
`@ds-typo(...)` for shared typography variants. Keep existing CSS Modules
compatible while migrating touched surfaces incrementally.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
