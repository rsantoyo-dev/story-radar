"use client";

import { useState, type ReactNode } from "react";

import type { CreativeBrandPaletteColor, CreativeFormat } from "./modules/stories/creative-content.types";
import {
  CREATIVE_IDENTITY_LIMITS,
  EMPTY_CREATIVE_IDENTITY,
  type CreativeIdentity,
  type CreativeIdentityAvoidGroup,
  type CreativeIdentityField,
} from "./modules/stories/creative-identity";

import styles from "./creative-draft-workspace.generated.module.css";

type Suggestion = { identity: CreativeIdentity; palette?: { palette: CreativeBrandPaletteColor[] } };

const FORMAT_OPTIONS: { value: CreativeFormat | ""; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "carousel", label: "Carousel" },
  { value: "sequence", label: "Ordered sequence" },
  { value: "meme", label: "Single image" },
];

type TextField = "style" | "photography" | "composition" | "variation" | "typography" | "fallback";
const TEXT_FIELDS: { field: TextField; title: string; placeholder: string; rows: number; hint?: string }[] = [
  { field: "style", title: "Style", rows: 5, placeholder: "Rendering technique, materials and texture, mood, recurring motifs" },
  { field: "photography", title: "Photography", rows: 4, placeholder: "Light, colour treatment, processing, framing, the kind of moments to show" },
  { field: "composition", title: "Composition", rows: 4, placeholder: "Focal point, reading hierarchy, alignment, negative space, when panels are allowed" },
  { field: "variation", title: "Variation across slides", rows: 3, placeholder: "Composition families to alternate; opening, middle and closing roles; what must not repeat" },
  { field: "typography", title: "Typography", rows: 3, placeholder: "Bold geometric sans headlines, clean sans supporting text, short line breaks", hint: "Describe traits; image models do not reliably follow font names. Colours are set in the palette." },
  { field: "fallback", title: "When no verified image exists", rows: 3, placeholder: "Typography-led or date-led layout, an information card, or the brand character on a plain background" },
];

/**
 * The Visual campaign guide organized into the optional branches the image
 * model reads, in a fixed order. Organize it all with AI, rewrite one branch
 * with its own instruction, or edit by hand. Every proposal fills the unsaved
 * profile; nothing is stored until the profile is saved.
 */
export function CreativeIdentityEditor({
  topicId,
  secret,
  disabled,
  guide,
  identity,
  palette,
  onIdentity,
  onPalette,
}: {
  topicId: string;
  secret: string;
  disabled: boolean;
  guide: string;
  identity: CreativeIdentity | null;
  palette: CreativeBrandPaletteColor[];
  onIdentity: (identity: CreativeIdentity | null) => void;
  onPalette: (palette: CreativeBrandPaletteColor[]) => void;
}) {
  const current = { ...EMPTY_CREATIVE_IDENTITY, ...identity };
  const [instruction, setInstruction] = useState("");
  const [fieldInstructions, setFieldInstructions] = useState<Partial<Record<CreativeIdentityField, string>>>({});
  const [busy, setBusy] = useState<"all" | CreativeIdentityField>();
  const [error, setError] = useState<string>();
  const [undo, setUndo] = useState<{ identity: CreativeIdentity | null; palette: CreativeBrandPaletteColor[] }>();

  const update = (values: Partial<CreativeIdentity>) => onIdentity({ ...current, ...values });
  const locked = disabled || Boolean(busy);

  async function organize(fields?: CreativeIdentityField[]) {
    const scope = fields?.length === 1 ? fields[0] : "all";
    setBusy(scope);
    setError(undefined);
    try {
      const response = await fetch(`/api/radar/creative-profile/identity-suggestion?topicId=${encodeURIComponent(topicId)}`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.trim()}` },
        body: JSON.stringify({
          guide,
          instruction: (scope === "all" ? instruction : fieldInstructions[scope]) || undefined,
          ...(fields ? { fields } : {}),
          current,
        }),
      });
      const payload = (await response.json().catch(() => undefined)) as (Partial<Suggestion> & { error?: string }) | undefined;
      if (!response.ok || !payload?.identity) throw new Error(payload?.error ?? `Request failed (${response.status})`);
      setUndo({ identity, palette });
      onIdentity(payload.identity);
      if (scope === "all" && payload.palette?.palette?.length) onPalette(payload.palette.palette);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The identity could not be organized");
    } finally {
      setBusy(undefined);
    }
  }

  function revert() {
    if (!undo) return;
    onIdentity(undo.identity);
    onPalette(undo.palette);
    setUndo(undefined);
  }

  // Folded under its own branch, so it reads as "AI for this field" and stays out of the way.
  const fieldAssistant = (field: CreativeIdentityField, label: string) => (
    <details className={styles.identityFieldAssistant}>
      <summary>✨ Rewrite {label} with AI…</summary>
      <input
        type="text"
        id={`identity-ai-${field}`}
        aria-label={`Instruction for rewriting ${label} with AI`}
        placeholder="Optional: how should AI rewrite this field?"
        value={fieldInstructions[field] ?? ""}
        maxLength={600}
        disabled={locked}
        onChange={(event) => setFieldInstructions((values) => ({ ...values, [field]: event.target.value }))}
      />
      <button type="button" className={styles.paletteAdd} disabled={locked || !guide.trim()} onClick={() => void organize([field])}>
        {busy === field ? "Rewriting…" : `Rewrite ${label} from the guide`}
      </button>
    </details>
  );

  const branch = (field: CreativeIdentityField, title: string, children: ReactNode, wide = false) => (
    <fieldset className={`${styles.identityField} ${wide ? styles.identityFieldWide : ""}`} key={field}>
      <legend>{title}</legend>
      {children}
      {fieldAssistant(field, title.toLowerCase())}
    </fieldset>
  );

  return (
    <section className={styles.paletteAssistant} aria-labelledby="creative-identity-title">
      <header className={styles.brandOverlayHeader}>
        <div>
          <strong id="creative-identity-title">Creative identity</strong>
          <p>
            Write or paste your full guide in <b>Visual campaign guide</b> above, then organize it here into the
            branches every image is built from. Every branch is optional; empty ones are left out. Once any branch is
            filled, images read these branches (plus the brand palette) instead of the long free-text guide. AI
            proposes; you review and save the profile to keep it.
          </p>
        </div>
      </header>

      <form className={styles.paletteAssistantForm} onSubmit={(event) => { event.preventDefault(); void organize(); }}>
        <label className={styles.field}>
          <span>Optional short instruction for AI (how to organize the guide, not the guide itself)</span>
          <input type="text" id="identity-ai-all" value={instruction} maxLength={600} disabled={locked}
            placeholder="For example: keep it minimal, favour real photography over illustration"
            onChange={(event) => setInstruction(event.target.value)} />
        </label>
        <div className={styles.paletteAssistantActions}>
          <button type="submit" className={styles.secondaryButton} disabled={locked || !guide.trim()}>
            {busy === "all" ? "Organizing the guide…" : "Organize the guide above with AI"}
          </button>
          {undo && !busy ? <button type="button" className={styles.paletteAdd} onClick={revert}>Undo AI changes</button> : null}
        </div>
      </form>
      {error ? <p className={styles.warning} role="alert">{error}</p> : null}

      <div className={styles.identityFields}>
        {branch("priority", "Priority", (
          <input type="text" id="identity-priority" aria-label="Priority" maxLength={CREATIVE_IDENTITY_LIMITS.priority} disabled={locked}
            value={current.priority} placeholder="Visual truth > editorial clarity > brand expression"
            onChange={(event) => update({ priority: event.target.value })} />
        ), true)}

        {branch("format", "Format", <>
          <label className={styles.field}>
            <span>Default piece</span>
            <select id="identity-format-default" value={current.format.default ?? ""} disabled={locked}
              onChange={(event) => update({ format: { ...current.format, default: (event.target.value || null) as CreativeFormat | null } })}>
              {FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Rules for every piece</span>
            <textarea id="identity-format-rules" rows={3} maxLength={CREATIVE_IDENTITY_LIMITS.rules} disabled={locked} value={current.format.rules}
              placeholder="4:5, one strong headline on the cover, text in the top third"
              onChange={(event) => update({ format: { ...current.format, rules: event.target.value } })} />
          </label>
        </>)}

        {TEXT_FIELDS.map(({ field, title, placeholder, rows, hint }) => branch(field, title, <>
          <textarea id={`identity-${field}`} aria-label={title} rows={rows} maxLength={CREATIVE_IDENTITY_LIMITS[field]}
            disabled={locked} value={current[field]} placeholder={placeholder}
            onChange={(event) => update({ [field]: event.target.value } as Partial<CreativeIdentity>)} />
          {hint ? <small>{hint}</small> : null}
        </>))}

        {branch("avoid", "Avoid", (
          <AvoidGroups groups={current.avoid} disabled={locked} onChange={(avoid) => update({ avoid })} />
        ), true)}

        {branch("allowed", "Allowed exceptions", <>
          <small>Kept even when they look like something in Avoid, because they carry information.</small>
          <ChipList id="identity-allowed" items={current.allowed} disabled={locked} placeholder="Simple weather symbols"
            maxItems={CREATIVE_IDENTITY_LIMITS.listItems} maxLength={CREATIVE_IDENTITY_LIMITS.listItem}
            onChange={(allowed) => update({ allowed })} />
        </>)}

        {branch("acceptance", "Acceptance criteria", <>
          <small>Used by the reviewer before approving an image; never sent to the image model.</small>
          <ChipList id="identity-acceptance" items={current.acceptance} disabled={locked} placeholder="Is every real place grounded in a verified reference?"
            maxItems={CREATIVE_IDENTITY_LIMITS.listItems} maxLength={CREATIVE_IDENTITY_LIMITS.listItem}
            onChange={(acceptance) => update({ acceptance })} />
        </>)}
      </div>
    </section>
  );
}

/** Removable chips plus an add box; Enter adds. */
function ChipList({ id, items, disabled, placeholder, maxItems, maxLength, onChange }: {
  id: string; items: string[]; disabled: boolean; placeholder: string; maxItems: number; maxLength: number; onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim().slice(0, maxLength);
    if (!value || items.includes(value) || items.length >= maxItems) return;
    onChange([...items, value]);
    setDraft("");
  };
  return <>
    {items.length ? <ul className={styles.identityAvoidList}>
      {items.map((entry) => <li key={entry}>
        <span>{entry}</span>
        <button type="button" aria-label={`Remove ${entry}`} disabled={disabled} onClick={() => onChange(items.filter((item) => item !== entry))}>×</button>
      </li>)}
    </ul> : null}
    <div className={styles.identityAvoidAdd}>
      <input type="text" id={id} aria-label={`Add an item to ${id.replace("identity-", "")}`} placeholder={`${placeholder}, then Enter`} value={draft}
        maxLength={maxLength} disabled={disabled || items.length >= maxItems}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <button type="button" className={styles.paletteAdd} disabled={disabled || !draft.trim()} onClick={add}>Add</button>
    </div>
  </>;
}

/** Avoid, organized by category: each group has an editable name and its own chips. */
function AvoidGroups({ groups, disabled, onChange }: { groups: CreativeIdentityAvoidGroup[]; disabled: boolean; onChange: (groups: CreativeIdentityAvoidGroup[]) => void }) {
  const limits = CREATIVE_IDENTITY_LIMITS;
  const setGroup = (index: number, group: CreativeIdentityAvoidGroup | undefined) =>
    onChange(group ? groups.map((entry, position) => position === index ? group : entry) : groups.filter((_, position) => position !== index));
  return <div className={styles.identityAvoidGroups}>
    {groups.length === 0 ? <small>Nothing to avoid yet. Group short, concrete items by category (Light and effects, Decorative marks…).</small> : null}
    {groups.map((group, index) => <div className={styles.identityAvoidGroup} key={index}>
      <div className={styles.identityAvoidGroupHeader}>
        <input type="text" id={`identity-avoid-category-${index}`} aria-label="Category name" value={group.category} maxLength={limits.avoidCategory} disabled={disabled}
          onChange={(event) => setGroup(index, { ...group, category: event.target.value })} />
        <button type="button" className={styles.paletteAdd} disabled={disabled} onClick={() => setGroup(index, undefined)}>Remove group</button>
      </div>
      <ChipList id={`identity-avoid-${index}`} items={group.items} disabled={disabled} placeholder="Lens flares"
        maxItems={limits.avoidItems} maxLength={limits.avoidItem} onChange={(items) => setGroup(index, { ...group, items })} />
    </div>)}
    {groups.length < limits.avoidGroups ? <button type="button" className={styles.paletteAdd} disabled={disabled}
      onClick={() => onChange([...groups, { category: "New category", items: [] }])}>Add a category</button> : null}
  </div>;
}
