/**
 * One place for everything that depends on the creative profile's language.
 *
 * Production topics run in French while most language handling grew up as
 * "English by default with a Spanish branch", so English strings leaked into
 * French copy and English leaks into French copy were never flagged. Every
 * repair text lives in the table below; a language the table does not cover
 * gets `undefined`, so callers leave the finding for a human instead of
 * inventing English.
 */

export type ProfileLanguage = "en" | "es" | "fr" | "other";

const LANGUAGE_LABELS: Record<Exclude<ProfileLanguage, "other">, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
};

function foldLanguage(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

/** Accepts codes ("fr", "fr-CA"), names ("French", "Français") and loose labels ("Spanish (Latin America)"). */
export function resolveProfileLanguage(language?: string): ProfileLanguage {
  const value = foldLanguage(language);
  if (!value) return "other";
  if (/^(?:es|spa)(?:\b|[-_])/u.test(value) || /\b(?:spanish|espanol|castellano)\b/u.test(value)) return "es";
  if (/^(?:fr|fra)(?:\b|[-_])/u.test(value) || /\b(?:french|francais)\b/u.test(value)) return "fr";
  if (/^(?:en|eng)(?:\b|[-_])/u.test(value) || /\b(?:english|ingles|anglais)\b/u.test(value)) return "en";
  return "other";
}

export function profileLanguageLabel(language: Exclude<ProfileLanguage, "other">): string {
  return LANGUAGE_LABELS[language];
}

type LocalizedEntry = Record<Exclude<ProfileLanguage, "other">, string>;

const LOCALIZED_TEXT = {
  "closing.headline.takeaway": { en: "The takeaway", es: "Para cerrar", fr: "Pour conclure" },
  "closing.headline.debate": { en: "The debate", es: "El debate", fr: "Le débat" },
  "closing.question.debate": {
    en: "What stands out most to you?",
    es: "¿Qué te sorprendió más de esta información?",
    fr: "Qu’est-ce qui vous marque le plus ?",
  },
  "closing.narrowed.headline": { en: "One question before you go", es: "Una pregunta para cerrar", fr: "Une question avant de partir" },
  "closing.narrowed.question": { en: "What are you seeing in your field?", es: "¿Qué observas en tu sector?", fr: "Que voyez-vous dans votre secteur ?" },
  "closing.narrowed.visual": {
    en: "Typographic editorial closing without new numbers or comparisons.",
    es: "Cierre editorial tipográfico sin cifras ni comparaciones nuevas.",
    fr: "Clôture éditoriale typographique sans nouveaux chiffres ni comparaisons.",
  },
  "evidence.fallback": {
    en: "This is the key point established by the source.",
    es: "Este es el dato clave señalado por la fuente.",
    fr: "C’est le point clé établi par la source.",
  },
  "fallback.summary": {
    en: "A summary of information supported by the source.",
    es: "Resumen de la información respaldada por la fuente.",
    fr: "Résumé de l’information appuyée par la source.",
  },
  "fallback.altText": {
    en: "A carousel explaining information supported by the source.",
    es: "Carrusel que explica información respaldada por la fuente.",
    fr: "Carrousel expliquant une information appuyée par la source.",
  },
  "estimate.about": { en: "about", es: "aproximadamente", fr: "environ" },
  "estimate.nearly": { en: "nearly", es: "casi", fr: "près de" },
  "estimate.moreThan": { en: "more than", es: "más de", fr: "plus de" },
  "labor.contrast.question": {
    en: "Which indicator better reflects what you see: earnings or employment?",
    es: "¿Qué indicador refleja mejor lo que observas: ingresos o empleo?",
    fr: "Quel indicateur reflète le mieux ce que vous observez : revenus ou emploi ?",
  },
  "labor.contrast.visual": {
    en: "Editorial contrast between average earnings and payroll employment.",
    es: "Contraste editorial entre ingresos promedio y empleo de nómina.",
    fr: "Contraste éditorial entre le revenu moyen et l’emploi salarié.",
  },
  "visual.conceptualComparison": {
    en: "Show the comparison conceptually and non-proportionally, with no scale, axes, quantitative bars, or invented values.",
    es: "Representa la comparación de forma conceptual y no proporcional, sin escala, ejes, barras cuantitativas ni valores inventados.",
    fr: "Représentez la comparaison de façon conceptuelle et non proportionnelle, sans échelle, axes, barres quantitatives ni valeurs inventées.",
  },
} as const satisfies Record<string, LocalizedEntry>;

export type LocalizedTextKey = keyof typeof LOCALIZED_TEXT;

/** The repair text for the profile language, or `undefined` when the language is not covered. */
export function localizedText(language: string | undefined, key: LocalizedTextKey): string | undefined {
  const resolved = resolveProfileLanguage(language);
  return resolved === "other" ? undefined : LOCALIZED_TEXT[key][resolved];
}

/**
 * Same as localizedText, keeping the English text for an uncovered language.
 * Existing repair helpers return a string unconditionally; English there is
 * the status quo for unknown languages, not a regression.
 */
export function localizedTextOrDefault(language: string | undefined, key: LocalizedTextKey): string {
  return localizedText(language, key) ?? LOCALIZED_TEXT[key].en;
}

// Function words that rarely appear in the other two languages. `\b` is not
// Unicode-aware in JavaScript, so boundaries are expressed with letter
// lookarounds to keep accented words ("où", "más", "très") intact.
const MARKERS: Record<Exclude<ProfileLanguage, "other">, RegExp> = {
  en: /(?<!\p{L})(?:the|when|from|your|will|within|during|there|what|why|how|did|does|this|for|those|their|should|could|would|with|who|which|most|you|know|that|is|are|only|and|about|because|into|than)(?!\p{L})/giu,
  es: /(?<!\p{L})(?:los|las|del|para|con|una|es|son|por|como|más|pero|esta|este|hay|también|sus|desde|hasta|muy|cuando|donde|aquí|sin|entre|sobre|ya|sí)(?!\p{L})/giu,
  fr: /(?<!\p{L})(?:les|des|est|sont|pour|avec|une|dans|sur|pas|plus|aussi|cette|ces|leur|leurs|mais|très|quand|où|être|avoir|nous|vous|ils|elles|ainsi|aux|chez|donc|près)(?!\p{L})/giu,
};

function markerCount(language: Exclude<ProfileLanguage, "other">, value: string): number {
  return value.match(MARKERS[language])?.length ?? 0;
}

/**
 * The language of a full sentence written in a language other than the
 * profile's, or `undefined` when the copy reads as the profile language.
 * Three distinctive function words that outnumber the profile language's own
 * markers is the bar: a loanword, a brand or a quoted title does not trip it.
 */
export function foreignSentenceLanguage(profileLanguage: string | undefined, value?: string): Exclude<ProfileLanguage, "other"> | undefined {
  const own = resolveProfileLanguage(profileLanguage);
  if (own === "other" || !value?.trim()) return undefined;
  const ownCount = markerCount(own, value);
  for (const candidate of ["en", "es", "fr"] as const) {
    if (candidate === own) continue;
    const count = markerCount(candidate, value);
    if (count >= 3 && count > ownCount) return candidate;
  }
  return undefined;
}
