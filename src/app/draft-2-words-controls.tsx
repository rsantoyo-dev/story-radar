"use client";
import { FormField, IconButton } from "@/app/ui/primitives";
import { WORDS_ALIGNS, WORDS_BACKGROUNDS, WORDS_TRACKING, type Draft2WordsLayout, type Draft2WordsPlace, type Draft2WordsRole } from "@/app/modules/draft2/draft2-images.types";
import { BRAND_FONTS, FONT_WEIGHT_NAME, brandFontById } from "@/app/modules/stories/brand-fonts";
import styles from "./draft-2-canvas.generated.module.css";

/** One of the brand's colours, by its name in the creative profile. */
export type BrandSwatch = { name: string; color: string };

const WORDS_ALIGN_LABEL: Record<Draft2WordsLayout["align"], string> = { left: "Left", center: "Centre", right: "Right" };
const WORDS_BACKGROUND_LABEL: Record<Draft2WordsLayout["background"]["kind"], string> = { none: "None: on the image", card: "A card behind the words", band: "A band across the slide" };
const FONT_CATEGORY_NAME: Record<string, string> = { "display serif": "Display serif", serif: "Serif", slab: "Slab serif", sans: "Sans", "display sans": "Display sans", condensed: "Condensed", handwritten: "Handwritten" };

/**
 * A colour for the words or what is behind them (2026-10-18, the editor: "our
 * brand's colours quick to pick at first"): the brand's colours as swatches,
 * then any other in the browser's picker; with an opacity, its slider.
 */
export function ColorField({ label, value, palette, disabled, onChange, opacity }: {
  label: string;
  value: string;
  palette: readonly BrandSwatch[];
  disabled: boolean;
  onChange: (color: string) => void;
  opacity?: { value: number; onChange: (opacity: number) => void };
}) {
  const current = value.toLowerCase();
  return <div className={styles.colorField} role="group" aria-label={label}>
    <span className={styles.colorLabel}>{label}</span>
    <div className={styles.swatches}>
      {palette.map((entry) => <IconButton key={`${entry.name}${entry.color}`} size="compact" variant="secondary" className={styles.swatch} style={{ backgroundColor: entry.color }} title={`${entry.name} ${entry.color}`} aria-label={`${entry.name}, ${entry.color}`} aria-pressed={entry.color.toLowerCase() === current} disabled={disabled} onClick={() => onChange(entry.color)} />)}
      <input type="color" value={value} aria-label={`${label}: any colour`} title="Any colour" disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
    {opacity ? <label className={styles.factMeta}>
      Opacity {Math.round(opacity.value * 100)} %
      <input type="range" min={0} max={100} step={5} value={Math.round(opacity.value * 100)} disabled={disabled} onChange={(event) => opacity.onChange(Number(event.target.value) / 100)} />
    </label> : null}
  </div>;
}

/** Where a part of the words sits beyond its box: its alignment, and what is behind it with its colour and opacity. */
export function PlaceControls({ label, place, palette, disabled, onChange }: { label: string; place: Draft2WordsPlace; palette: readonly BrandSwatch[]; disabled: boolean; onChange: (place: Draft2WordsPlace) => void }) {
  return <>
    <FormField label={`${label}: alignment`}>
      <select value={place.align} disabled={disabled} onChange={(event) => onChange({ ...place, align: event.target.value as Draft2WordsPlace["align"] })}>
        {WORDS_ALIGNS.map((align) => <option key={align} value={align}>{WORDS_ALIGN_LABEL[align]}</option>)}
      </select>
    </FormField>
    <FormField label={`${label}: behind it`}>
      <select value={place.background.kind} disabled={disabled} onChange={(event) => onChange({ ...place, background: { ...place.background, kind: event.target.value as Draft2WordsPlace["background"]["kind"] } })}>
        {WORDS_BACKGROUNDS.map((kind) => <option key={kind} value={kind}>{WORDS_BACKGROUND_LABEL[kind]}</option>)}
      </select>
    </FormField>
    {place.background.kind !== "none" ? <ColorField label={`${label}: background`} value={place.background.color} palette={palette} disabled={disabled}
      onChange={(color) => onChange({ ...place, background: { ...place.background, color } })}
      opacity={{ value: place.background.opacity, onChange: (opacity) => onChange({ ...place, background: { ...place.background, opacity } }) }} /> : null}
  </>;
}

/** One role's controls: its font (the bundled catalog), weight, size in slide pixels and colour, how its marked words stand out, its spacing and capitals. */
export function WordsRoleControls({ label, role, range, palette, disabled, onChange }: { label: string; role: Draft2WordsRole; range: readonly [number, number]; palette: readonly BrandSwatch[]; disabled: boolean; onChange: (role: Draft2WordsRole) => void }) {
  const font = brandFontById(role.font);
  // The marked words' style as the renderer reads it: the editor's, else the font's heaviest weight in the role's colour.
  const mark = role.mark ?? { weight: font ? Math.max(...font.weights) : role.weight, color: role.color };
  const categories = [...new Set(BRAND_FONTS.map((entry) => entry.category))];
  return <>
    <FormField label={`${label}: font`}>
      <select value={role.font} disabled={disabled} onChange={(event) => { const next = brandFontById(event.target.value); onChange({ ...role, font: event.target.value, weight: next?.weights.includes(role.weight) ? role.weight : next?.weights[next.weights.length - 1] ?? role.weight, ...(role.mark ? { mark: { ...role.mark, weight: next?.weights.includes(role.mark.weight) ? role.mark.weight : next?.weights[next.weights.length - 1] ?? role.mark.weight } } : {}) }); }}>
        {categories.map((category) => <optgroup key={category} label={FONT_CATEGORY_NAME[category] ?? category}>
          {BRAND_FONTS.filter((entry) => entry.category === category).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </optgroup>)}
      </select>
    </FormField>
    <FormField label={`${label}: weight`}>
      <select value={role.weight} disabled={disabled} onChange={(event) => onChange({ ...role, weight: Number(event.target.value) })}>
        {(font?.weights ?? [role.weight]).map((weight) => <option key={weight} value={weight}>{FONT_WEIGHT_NAME[weight] ?? weight}</option>)}
      </select>
    </FormField>
    <FormField label={`${label}: size`} description={`${range[0]} to ${range[1]} px on a 1080 px slide`}>
      <div className={styles.sizeRow}>
        <input type="range" min={range[0]} max={range[1]} step={2} value={role.size} aria-label={`${label}: size`} disabled={disabled} onChange={(event) => onChange({ ...role, size: Number(event.target.value) })} />
        <input type="number" min={range[0]} max={range[1]} step={2} value={role.size} aria-label={`${label}: size in pixels`} disabled={disabled} onChange={(event) => { const size = Number(event.target.value); if (Number.isFinite(size)) onChange({ ...role, size: Math.min(range[1], Math.max(range[0], Math.round(size))) }); }} />
      </div>
    </FormField>
    <ColorField label={`${label}: colour`} value={role.color} palette={palette} disabled={disabled} onChange={(color) => onChange({ ...role, color })} />
    <FormField label={`${label}: marked words' weight`} description={mark.weight === role.weight && mark.color === role.color ? "The same as the rest: give them a weight or a colour to stand out." : undefined}>
      <select value={mark.weight} disabled={disabled} onChange={(event) => onChange({ ...role, mark: { ...mark, weight: Number(event.target.value) } })}>
        {(font?.weights ?? [mark.weight]).map((weight) => <option key={weight} value={weight}>{FONT_WEIGHT_NAME[weight] ?? weight}</option>)}
      </select>
    </FormField>
    <ColorField label={`${label}: marked words' colour`} value={mark.color} palette={palette} disabled={disabled} onChange={(color) => onChange({ ...role, mark: { ...mark, color } })} />
    <FormField label={`${label}: letter spacing`} description={`${WORDS_TRACKING[0]} to ${WORDS_TRACKING[1]}, in thousandths of the size`}>
      <input type="number" min={WORDS_TRACKING[0]} max={WORDS_TRACKING[1]} step={10} value={role.tracking ?? 0} disabled={disabled} onChange={(event) => { const tracking = Number(event.target.value); if (Number.isFinite(tracking)) { const { tracking: _old, ...rest } = role; void _old; const next = Math.min(WORDS_TRACKING[1], Math.max(WORDS_TRACKING[0], Math.round(tracking))); onChange(next ? { ...rest, tracking: next } : rest); } }} />
    </FormField>
    <label className={styles.factMeta}><input type="checkbox" checked={Boolean(role.upper)} disabled={disabled} onChange={(event) => { const { upper: _old, ...rest } = role; void _old; onChange(event.target.checked ? { ...rest, upper: true } : rest); }} /> {label} in capitals</label>
  </>;
}
