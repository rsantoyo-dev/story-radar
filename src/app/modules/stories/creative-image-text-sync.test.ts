import assert from "node:assert/strict";
import test from "node:test";
import { canCarryImageUnits, imageTextNeedsUpdate, imageTextEditInstruction } from "./creative-image-text-sync";
import type { CreativeUnit } from "./creative-content.types";
const units: CreativeUnit[] = [1,2,3].map(order => ({ id: `unit-${order}`, order, type: "carousel-slide", role: "content", headline: `Title ${order}`, body: "Body", visualDirection: "photo", factIds: [], assetRequest: "generated-image", aspectRatio: "4:5" }));
test("a title edit affects only its slide; restoring text clears the difference", () => {
  const edited = units.map(u => u.order === 2 ? { ...u, headline: "Better title" } : u);
  assert.ok(canCarryImageUnits(units,edited));
  assert.deepEqual(edited.map((u,i) => imageTextNeedsUpdate(units[i],u)), [false,true,false]);
  assert.equal(imageTextNeedsUpdate(units[1],{...edited[1],headline:units[1].headline}),false);
  assert.match(imageTextEditInstruction(units[1],edited[1]),/Better title/);
  assert.match(imageTextEditInstruction(units[1],edited[1]),/Title 2/);
});
test("structural and visual changes do not silently reuse the wrong image", () => {
  assert.equal(canCarryImageUnits(units,[units[1],units[0],units[2]]),false);
  assert.equal(canCarryImageUnits(units,units.slice(1)),false);
  assert.equal(canCarryImageUnits(units,units.map(u => ({...u,characterIds:["new"]}))),false);
  assert.equal(canCarryImageUnits(units,units.map(u => ({...u,aspectRatio:"1:1"}))),false);
  assert.ok(canCarryImageUnits(units, units.map(u => ({...u,viewerQuestion:"new internal note"}))));
});
