import assert from "node:assert/strict";
import test from "node:test";
import { sameSpineSubject, spineImageProblems } from "./draft2-spine-checks";
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
  assert.equal(forbiddenElement("A plain card, the logo added afterwards"), undefined);
  assert.equal(forbiddenElement("A card with the logo in the corner"), "logo");
  assert.equal(mentionsTerm("iconos genericos de microbios", "iconos genericos"), true);
  assert.equal(mentionsTerm("un icono generico", "iconos genericos"), false, "whole words only");
  assert.equal(sameSpineSubject("a corn kernel", "two corn kernels"), true, "a plural is the same subject");
  assert.equal(sameSpineSubject("un grano de maíz", "dos granos de maíz"), true, "the real run's slide 2 and s1");
  assert.equal(sameSpineSubject("the rolled tortilla", "The rolled tortilla, whole"), true);
  assert.equal(sameSpineSubject("four step cards", "a rolled tortilla"), false);
});
