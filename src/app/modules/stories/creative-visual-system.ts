import type { CreativeCharacterSnapshot } from "./creative-content.types";

type VisualStyleCharacter = Pick<
  CreativeCharacterSnapshot,
  "id" | "name" | "description"
>;

/**
 * Builds the compact, high-priority art direction shared by every slide.
 * Character descriptions often contain the most concrete brand medium and
 * palette. We reuse only those style clauses, never identity traits, so a
 * slide can match the campaign without accidentally depicting the character.
 */
export function buildCarouselVisualSystem(
  characters: readonly VisualStyleCharacter[],
): string {
  const styleAnchors = uniqueText(
    characters.flatMap((character) =>
      extractCharacterStyleAnchors(character.description),
    ),
  );

  return [
    "HARD CAROUSEL CONSISTENCY LOCK: render every slide as one art-directed visual sequence, not as unrelated standalone graphics.",
    "Keep the same illustration medium, color palette, lighting, texture, typography language, icon treatment, shape language, contrast, margins, and overall finish across the complete carousel. Vary only the scene, metaphor, data, and composition needed by each slide.",
    ...(styleAnchors.length > 0
      ? [
          `Shared campaign art direction: ${styleAnchors.join(" ")}`,
          "This shared art direction applies even when the recurring character is not selected for this slide. It is a style reference only and must not cause an unselected character, face, body, or lookalike to appear.",
        ]
      : characters.length > 0
        ? [
            "Shared campaign art direction: use premium editorial realism with restrained infographic overlays, consistent lighting, and the same material finish on every slide. Character-free slides must use realistic objects or environments in that same medium, never switch to flat cartoon illustration.",
            "The shared medium applies even when the recurring character is not selected. It must not cause an unselected character, face, body, silhouette, or lookalike to appear.",
          ]
        : []),
    "The slide-specific visual direction controls subject matter and composition. If it requests a conflicting medium, palette, aesthetic, or rendering style, preserve its idea but restyle it to this shared carousel system.",
  ].join("\n");
}

export function extractCharacterStyleAnchors(description: string): string[] {
  const sentences = description
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const anchors: string[] = [];

  for (const sentence of sentences) {
    const medium = sentence.match(
      /\b(?:high-end\s+)?(?:semi-realistic\s+)?(?:2D|3D)?\s*editorial illustration\b/iu,
    )?.[0];
    if (medium) {
      const supportingTraits = [
        /\bsoft dimensional lighting\b/iu,
        /\borganic shapes\b/iu,
        /\bsophisticated [^.]*? editorial aesthetic\b/iu,
      ]
        .flatMap((pattern) => sentence.match(pattern)?.[0] ?? [])
        .join(", ");
      anchors.push(
        `Use a ${medium}${supportingTraits ? ` with ${supportingTraits}` : ""}.`,
      );
    }

    if (/#[0-9a-f]{3,8}\b/iu.test(sentence) || /\bcolor palette\b/iu.test(sentence)) {
      anchors.push(sentence);
    }

    if (/\b(?:incorporate|use)\b[^.]*\b(?:graphic motifs?|shape language|icon treatment|texture)\b/iu.test(sentence)) {
      anchors.push(sentence);
    }
  }

  return uniqueText(anchors);
}

function uniqueText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}
