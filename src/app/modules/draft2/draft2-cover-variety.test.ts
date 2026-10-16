import assert from "node:assert/strict";
import test from "node:test";
import { coverBackground, coverVarietyIssues, paletteBackgrounds, recentCovers, recentCoversForModels } from "./draft2-cover-variety";
import type { Draft2VisualCandidate, Draft2VisualSlide } from "./draft2-visual.types";

/** Fogón Lab's palette as the brand wrote it. */
const PALETTE = [
  { name: "Papel cálido", usage: "fondo crema: páginas neutras y tarjetas" },
  { name: "Chile tostado", usage: "fondo terracota de portada y cierre, títulos de marca" },
  { name: "Ocre tostado", usage: "acentos: palabras clave y cifras; nunca de fondo" },
  { name: "Teal científico", usage: "fondo verde azulado de mecanismos y datos" },
  { name: "Tinta pizarra", usage: "solo texto y contornos; nunca de fondo" },
];
const ROSTER = [{ id: "char-chispa", name: "Chispa" }];
const slide = (position: string, direction: string, characterIds: string[] = [], subject = "a subject"): Draft2VisualSlide => ({
  slide: position, beat: "b", subject, discovery: "d", recurring: "none", shot: "wide", headlineLink: "", direction, need: characterIds.length ? "character-reference" : "generic-illustration", characterIds, references: [],
});
const script = (id: string, cover: Draft2VisualSlide): Draft2VisualCandidate => ({ id, angle: "a", concept: "c", protagonist: "", motif: "", cast: "c", characterPlan: { use: false, characterIds: [], role: "" }, slides: [cover, slide("last", "Fondo crema, cierre.")] });
const row = (storyId: string, createdAt: string, cover: Draft2VisualSlide) => ({ storyId, createdAt, visual: { winnerId: "c1", rounds: [{ round: 1, candidates: [script("c1", cover)], mechanical: [], at: "t" }] } });

test("the palette's backgrounds and what a direction calls them: a color kept off backgrounds is none", () => {
  const backgrounds = paletteBackgrounds(PALETTE);
  assert.deepEqual(backgrounds.map((color) => [color.name, color.labels]), [
    ["Papel cálido", ["papel calido", "crema"]], ["Chile tostado", ["chile tostado", "terracota"]], ["Teal científico", ["teal cientifico", "verde azulado"]],
  ]);
  assert.equal(coverBackground("Fondo terracota plano, titular crema arriba; abajo un grano de maíz.", backgrounds), "Chile tostado", "the color named after «fondo» wins over the title's");
  assert.equal(coverBackground("Sobre verde azulado, un vaso de leche fría con condensación.", backgrounds), "Teal científico", "the only background named");
  assert.equal(coverBackground("Un vaso de leche sobre una mesa.", backgrounds), undefined);
});

test("the last covers, one per story and newest first, with their background, the brand's character and the subject", () => {
  const rows = [
    row("s1", "2026-10-14T10:00:00Z", slide("cover", "Fondo terracota, Chispa sorprendida.", ["char-chispa"], "an onion")),
    row("s2", "2026-10-15T10:00:00Z", slide("cover", "Fondo crema con un aguacate.", [], "an avocado")),
    row("s2", "2026-10-15T09:00:00Z", slide("cover", "Fondo terracota.", ["char-chispa"], "an older avocado")),
    row("s3", "2026-10-16T10:00:00Z", { ...slide("cover", "Fondo verde azulado, un chile."), characterIds: ["char-gone"] }),
  ];
  const covers = recentCovers(rows, { palette: PALETTE, roster: ROSTER });
  assert.deepEqual(covers.map((cover) => [cover.subject, cover.background, cover.characters]), [["a subject", "Teal científico", ["char-gone"]], ["an avocado", "Papel cálido", []], ["an onion", "Chile tostado", ["Chispa"]]], "the newest session of each story; a character the roster lost keeps its id");
  assert.deepEqual(recentCoversForModels(covers.slice(1)), [{ background: "Papel cálido", character: "none", subject: "an avocado" }, { background: "Chile tostado", character: "Chispa", subject: "an onion" }]);
});

test("variety on the cover: the brand's character never on two covers in a row, and never the last cover's background when the palette offers another", () => {
  const last = [{ at: "t", subject: "an onion", characters: ["Chispa"], background: "Chile tostado" }];
  const same = script("c1", slide("cover", "Fondo terracota, un chile y Chispa llorando.", ["char-chispa"]));
  assert.deepEqual(coverVarietyIssues([same], { recent: last, palette: PALETTE }).map((issue) => issue.code), ["COVER_CHARACTER_STREAK", "COVER_BACKGROUND_REPEAT"]);
  assert.match(coverVarietyIssues([same], { recent: last, palette: PALETTE })[1].detail, /another of the identity's backgrounds \(Papel cálido, Teal científico\)/);
  const varied = script("c2", slide("cover", "Fondo crema, un vaso de leche fría con condensación."));
  assert.deepEqual(coverVarietyIssues([varied], { recent: last, palette: PALETTE }), []);
  assert.deepEqual(coverVarietyIssues([same], { recent: last, palette: PALETTE, characterAnchor: "char-chispa" }).map((issue) => issue.code), ["COVER_BACKGROUND_REPEAT"], "a guide who is on every slide by design");
  assert.deepEqual(coverVarietyIssues([same], { recent: [], palette: PALETTE }), [], "a publication's first carousel");
  assert.deepEqual(coverVarietyIssues([same], { recent: [{ ...last[0], background: undefined, characters: [] }], palette: PALETTE }), [], "an unclear last background asks for nothing");
});
