import assert from "node:assert/strict";
import test from "node:test";
import { sameSpineSubject, spineImageProblems, spineSeries } from "./draft2-spine-checks";
import { spineRecurring } from "./draft2-focus.types";
import { avoidTerms, forbiddenElement, mentionsTerm, wordsAskedOfImage } from "./draft2-image-rules";
import type { Draft2SpinePosition } from "./draft2-focus.types";

const beat = (slide: Draft2SpinePosition, image: string, subject?: string) => ({ slide, image, ...(subject ? { subject } : {}) });

test("the spine's image lines are checked where the images would pay: a term the brand avoids, words or numbers asked of the image, the same subject twice in a row", () => {
  const avoid = avoidTerms({ avoid: [{ items: ["Iconos genéricos", "Polaroid", "lens flare", "ok"] }] });
  assert.deepEqual(avoid, ["iconos genéricos", "polaroid", "lens flare"], "short phrases of four letters or more, in lower case");
  const beats = [
    beat("cover", "Un grano de maíz grande con un candado dibujado y la llama mirando.", "un grano de maíz"),
    beat("slide2", "Dos granos lado a lado, uno con puntos dentro y otro con los puntos saliendo.", "dos granos de maíz"),
    beat("middle", "Cuatro tarjetas numeradas con iconos genéricos de microbios: olla, reloj, escurrido.", "four cards"),
    beat("middle", "Una tortilla enrollada entera, con una esquina libre para el logo que se añade después.", "a rolled tortilla"),
    beat("last", "Ceniza y cal frente a frente con el grano en medio.", "ash and lime"),
  ];
  const problems = spineImageProblems(beats, { avoid });
  assert.deepEqual(problems.map((problem) => [problem.code, problem.beat]), [["SPINE_SAME_SUBJECT", 2], ["SPINE_AVOID_TERM", 3], ["SPINE_IMAGE_WORDS", 3]]);
  assert.match(problems[0].detail, /Beats 1 and 2 \(cover, slide2\) show the same dominant subject \("dos granos de maíz"\)/);
  assert.match(problems[1].detail, /asks the image for "iconos genéricos", which the brand's identity avoids/);
  assert.match(problems[2].detail, /asks the image for "numeradas": the image model letters only the slide's words/);
  assert.deepEqual(spineImageProblems(beats.slice(3), { avoid }), [], "a corner kept free for the logo added afterwards asks for nothing");
  assert.deepEqual(spineImageProblems([beat("cover", "A kernel."), beat("slide2", "A kernel.")]), [], "spines written before subjects are not compared");
});

test("words asked of the image, in the publications' languages; a negation asks for nothing", () => {
  assert.equal(wordsAskedOfImage("Four numbered cards with icons"), "numbered");
  assert.equal(wordsAskedOfImage("Deux cartes numérotées"), "numérotées");
  assert.equal(wordsAskedOfImage("Tarjetas con números grandes"), "con números");
  assert.equal(wordsAskedOfImage("Tarjetas sin números ni texto, solo objetos"), undefined);
  assert.equal(wordsAskedOfImage("A bowl of lime water on teal"), undefined);
  // A figure for its own sake: the spaghetti story's climax asked for one, and the check missed it.
  assert.equal(wordsAskedOfImage("Dos mitades limpias frente a frente, con una cifra grande en ocre como único acento"), "cifra");
  assert.equal(wordsAskedOfImage("Un plato con un porcentaje enorme encima"), "porcentaje");
  assert.equal(wordsAskedOfImage("A jar beside a big number in ochre"), "big number");
  assert.equal(wordsAskedOfImage("Un bol y, encima, números grandes flotando"), "números grandes");
  assert.equal(wordsAskedOfImage("Un grand chiffre au-dessus du bol"), "chiffre");
  assert.equal(wordsAskedOfImage("Un gran número de granos sobre la mesa"), undefined, "a quantity of things is not a figure");
  assert.equal(wordsAskedOfImage("La máquina de pinzas, sin cifra ni rótulo"), undefined, "a figure ruled out asks for nothing");
  assert.equal(forbiddenElement("A plain card, the logo added afterwards"), undefined);
  assert.equal(forbiddenElement("A card with the logo in the corner"), "logo");
  assert.equal(mentionsTerm("iconos genericos de microbios", "iconos genericos"), true);
  assert.equal(mentionsTerm("un icono generico", "iconos genericos"), false, "whole words only");
  assert.equal(sameSpineSubject("a corn kernel", "two corn kernels"), true, "a plural is the same subject");
  assert.equal(sameSpineSubject("un grano de maíz", "dos granos de maíz"), true, "the real run's slide 2 and s1");
  assert.equal(sameSpineSubject("the rolled tortilla", "The rolled tortilla, whole"), true);
  assert.equal(sameSpineSubject("four step cards", "a rolled tortilla"), false);
});

test("a series, not a sequence: one subject on more than two thirds of the beats, a form's anchor not counted", () => {
  // The spaghetti story's spine as Claude wrote it: the noodle on all seven slides, each in another state.
  const series = [
    "un espagueti doblado con fragmentos", "espagueti con grieta en el centro", "espagueti retorcido en espiral", "espagueti destorciéndose con partículas",
    "dos ondas en un espagueti", "dos mitades limpias de espagueti", "Chispa con espagueti entero y partido",
  ].map((subject, index) => beat(index === 0 ? "cover" : index === 1 ? "slide2" : index === 5 ? "penultimate" : index === 6 ? "last" : "middle", "Una imagen plana.", subject));
  assert.deepEqual(spineSeries(series), { word: "espagueti", beats: [1, 2, 3, 4, 5, 6, 7], total: 7 });
  const problem = spineImageProblems(series).find((entry) => entry.code === "SPINE_SERIES");
  assert.equal(problem?.beat, 7, "named on the last beat it holds");
  assert.match(problem!.detail, /"espagueti" is the dominant subject of 7 of 7 beats \(1, 2, 3, 4, 5, 6, 7\); keep it on at most 4/);
  // The editor's version: the kitchen table and the waves along the rod beside the noodle; four of six, two thirds, is a sequence.
  const sequence = [
    "un espagueti doblado con fragmentos", "una mesa de cocina llena de trozos", "espagueti retorcido en espiral", "dos ondas que recorren la varilla",
    "la máquina de pinzas con el espagueti partido", "espagueti torcido junto a una linguini",
  ].map((subject, index) => beat(index === 0 ? "cover" : index === 1 ? "slide2" : index === 4 ? "penultimate" : index === 5 ? "last" : "middle", "Una imagen plana.", subject));
  assert.equal(spineSeries(sequence), undefined);
  // Words that name no subject never make a series: "with" on five of five English subjects.
  assert.equal(spineSeries(["a kernel with dots", "hands with a tortilla", "a pot with lime", "ash with lime water", "a plate with beans"].map((subject) => beat("middle", "x", subject))), undefined);
  // A traveling object or a guide recurs by design: its anchor is not counted, and a classic telling has none.
  const travels = ["the coffee cup on a desk", "the coffee cup in a car", "the coffee cup at a market", "the coffee cup in the rain"].map((subject) => beat("middle", "x", subject));
  assert.equal(spineSeries(travels)?.word, "coffee");
  assert.equal(spineSeries(travels, { recurring: spineRecurring({ form: "traveling-object", anchor: "The coffee cup" }) }), undefined);
  assert.equal(spineRecurring({ form: "classic", anchor: "" }), "");
  assert.equal(spineSeries(series.slice(0, 3)), undefined, "fewer than four subjects are not counted");
});

test("a panorama keeps one view and one scale: a cut-away, a close-up, a magnified view or panels is a problem only there", () => {
  // The coffee ring's first panorama spine (2026-10-17), as Claude wrote it.
  const first = [
    beat("cover", "Sección izquierda de un mesón largo: un aro seco de café, grande y de contorno grueso, con una línea de vapor curva que cruza el borde derecho."),
    beat("slide2", "Corte de la gota con flechas curvas a mano del centro hacia el borde; la línea de vapor de la portada entra por la izquierda."),
    beat("middle", "Ampliación del borde de la gota apoyado en una línea irregular, con más vapor saliendo del borde que del centro."),
    beat("middle", "Vista desde arriba: una cubierta en forma de anillo sobre el borde de la gota y una mancha oscura y redonda en el centro."),
    beat("penultimate", "Vista ampliada en dos paneles: a la izquierda partículas redondas; a la derecha alargadas que se reparten parejas."),
    beat("last", "Extremo derecho del mesón: una mancha de whisky seca de color parejo, sin aro."),
  ];
  const problems = spineImageProblems(first, { panorama: true }).filter((problem) => problem.code === "SPINE_PANORAMA_VIEW");
  assert.deepEqual(problems.map((problem) => problem.beat), [2, 3, 5], "the cut, the magnified edge and the panels; one view from above is the scene's own");
  assert.match(problems[0].detail, /asks for "Corte de la": a panorama is one scene in one view and one scale/);
  assert.deepEqual(spineImageProblems(first).filter((problem) => problem.code === "SPINE_PANORAMA_VIEW"), [], "one image per slide may cut, magnify or split");
  // The editor's version: one counter seen from above, each step the next drop along it.
  const edited = [
    beat("cover", "Vista desde arriba del extremo izquierdo de un mesón de madera clara, a la escala de las gotas: un aro de café seco en la mitad inferior; un rastro de gotas sigue hacia la derecha."),
    beat("slide2", "El mismo mesón, misma vista y escala: una gota de café aún húmeda, con flechas curvas a mano del centro hacia el borde."),
    beat("middle", "Misma vista y escala: una gota a medio secar con el borde prendido a la veta rugosa de la madera."),
    beat("last", "Extremo derecho del mesón, misma vista y escala: una mancha de whisky ámbar, pareja y sin aro, junto a la base de un vaso."),
  ];
  assert.deepEqual(spineImageProblems(edited, { panorama: true }), []);
});
