import { notFound } from "next/navigation";

import { topicThemeStyle, TOPIC_THEMES } from "@/design/topic-themes";
import { ActionRow, Button, EmptyState, FormField, IconButton, InlineNotice, LoadingState, SectionHeader, StatusBadge, Surface, Tabs } from "@/app/ui/primitives";
import styles from "@/app/ui/primitives.generated.module.css";
import { ModalFixture } from "./modal-fixture";
import { UX_FIXTURES } from "./fixtures";

export default function UiShowcasePage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <main>
    <h1 className={styles.showcaseTitle}>Shared UI showcase</h1>
    <div className={styles.showcaseGrid}>
    {TOPIC_THEMES.filter((theme) => theme.key === "press-green" || theme.key === "signal-blue").map((theme) => <section key={theme.key} className={styles.showcase} style={topicThemeStyle(theme.key)}>
      <SectionHeader eyebrow="UX-01 · safe fixtures" title={theme.label} description="Use the controls with mouse and keyboard. Resize to 390 and 1440 px." />
      <Surface id={`${theme.key}-actions`} className={styles.showcaseStack}>
        <SectionHeader title="Actions" level={3} description="Desktop controls are 40 or 36 px; touch targets are at least 44 px." />
        <ActionRow><Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="quiet">Quiet</Button><Button variant="destructive">Delete</Button></ActionRow>
        <ActionRow><Button size="compact" variant="primary">Compact</Button><Button size="compact">Hover me</Button><Button size="compact" variant="quiet">Tab to focus</Button><IconButton size="compact" aria-label="More options">⋯</IconButton></ActionRow>
        <ActionRow><Button disabled>Disabled</Button><Button busy>Saving…</Button><Button variant="primary">A much longer action label that should wrap safely</Button></ActionRow>
      </Surface>
      <Surface id={`${theme.key}-fields`} className={styles.showcaseStack}>
        <SectionHeader title="Fields and status" level={3} />
        <FormField label="Publication title" description="Visible label and persistent guidance"><input defaultValue="A sample story" /></FormField>
        <FormField label="Destination" required error="Choose a destination before continuing."><select defaultValue=""><option value="">Choose an account</option></select></FormField>
        <ActionRow><StatusBadge>Pending</StatusBadge><StatusBadge tone="success">Ready</StatusBadge><StatusBadge tone="warning">Needs review</StatusBadge><StatusBadge tone="error">Blocked</StatusBadge><StatusBadge tone="info">Queued</StatusBadge></ActionRow>
        <InlineNotice tone="warning" title="Review needed">Confirm the selected account before publication.</InlineNotice>
        <InlineNotice tone="error" title="Could not save">Check the title and try again.</InlineNotice>
      </Surface>
      <Surface id={`${theme.key}-states`} className={styles.showcaseStack}>
        <SectionHeader title="States and navigation" level={3} />
        <Tabs label="Sample sections" items={[{ label: "Actions", href: `#${theme.key}-actions` }, { label: "Fields", href: `#${theme.key}-fields` }, { label: "States", href: `#${theme.key}-states`, current: true }]} />
        <EmptyState title="No stories selected">Choose a Story from Discover to begin production.</EmptyState>
        <LoadingState>Loading stories…</LoadingState>
        <ModalFixture />
      </Surface>
    </section>)}
    </div>
    <section className={styles.showcaseStates} aria-labelledby="ux-fixture-title">
      <h2 id="ux-fixture-title">Safe editorial state fixtures</h2>
      <p>These examples contain no account, provider, or publication data.</p>
      <div className={styles.showcaseFixtureGrid}>
        {UX_FIXTURES.map((fixture) => <article key={fixture.id}>
          <StatusBadge tone={fixture.state === "blocked" ? "error" : fixture.state === "review" ? "warning" : fixture.state === "ready" ? "success" : "neutral"}>{fixture.state}</StatusBadge>
          <h3>{fixture.title}</h3><p>{fixture.detail}</p>
        </article>)}
      </div>
    </section>
  </main>;
}
