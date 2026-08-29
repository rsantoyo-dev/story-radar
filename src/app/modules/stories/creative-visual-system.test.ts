import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCarouselVisualSystem,
  extractCharacterStyleAnchors,
} from "./creative-visual-system";

const ferDescription =
  "Fer is a recurring Latina visual narrator. She has long dark hair and purple glasses. Render her as a high-end semi-realistic 2D editorial illustration with recognizable human likeness, soft dimensional lighting, organic shapes, and a sophisticated parenting editorial aesthetic. Use a warm cream #FAF5E6 background with coral #EF644B, mustard #F4AF36, teal #2F777B, and dark teal #173F43 accents. Incorporate soft organic graphic motifs such as baby footprints and hearts.";

test("extracts art direction without copying character identity traits", () => {
  const anchors = extractCharacterStyleAnchors(ferDescription).join(" ");

  assert.match(anchors, /semi-realistic 2D editorial illustration/iu);
  assert.match(anchors, /#FAF5E6/iu);
  assert.match(anchors, /baby footprints/iu);
  assert.doesNotMatch(anchors, /long dark hair|purple glasses|Latina/iu);
});

test("applies recurring-character style to slides without requiring the character", () => {
  const system = buildCarouselVisualSystem([
    {
      id: "fer",
      name: "Fer",
      description: ferDescription,
    },
  ]);

  assert.match(system, /HARD CAROUSEL CONSISTENCY LOCK/iu);
  assert.match(system, /#EF644B/iu);
  assert.match(system, /even when the recurring character is not selected/iu);
  assert.match(system, /must not cause an unselected character/iu);
});
