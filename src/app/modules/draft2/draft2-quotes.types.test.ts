import assert from "node:assert/strict";
import test from "node:test";
import { quoteFinding, quotesIn, quotesNotInFacts } from "./draft2-quotes.types";

test("a quotation of four words or more must be one fact's words; a term in quotes is not a quote; two sentences joined are (2026-10-24, ART[O])", () => {
  const facts = [
    { claim: "L'artiste imaginait des «émerveilleurs» nés des déchets.", evidence: "des « émerveilleurs » nés des déchets, qui nous regardent du coin de l'œil" },
    { claim: "Selon lui, nos déchets oubliés restent dans nos eaux et sous terre.", evidence: "nos déchets oubliés sont toujours là, dans nos eaux, sous terre" },
  ];
  assert.deepEqual(quotesIn("Des «émerveilleurs» qui «nous regardent du coin de l'œil»."), ["nous regardent du coin de l'œil"], "a one-word term in quotes is not a quote");
  assert.deepEqual(quotesNotInFacts("Des «émerveilleurs» qui «nous regardent du coin de l'œil».", facts), []);
  assert.deepEqual(quotesNotInFacts("Il dit: « nos déchets oubliés nous regardent du coin de l'œil ».", facts), ["nos déchets oubliés nous regardent du coin de l'œil"], "two sentences joined in one quote");
  assert.deepEqual(quotesNotInFacts('He said "awards took less than a week in several cases".', [{ claim: "Awards took less than a week in several instances, a DOD official says.", evidence: "awards took less than a week in several instances" }]), ["awards took less than a week in several cases"]);
  assert.deepEqual(quotesNotInFacts("“Nos déchets oubliés sont toujours là, dans nos eaux, sous terre.”", facts), [], "curly quotes, the final period ignored");
  assert.match(quoteFinding(["a b c d"]), /^"a b c d" is in quotation marks, and no fact gives it word for word/);
});
