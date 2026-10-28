import assert from "node:assert/strict";
import { test } from "node:test";
import { TotemTrigger } from "./totem-trigger";
import { defaultDesign, designSchema } from "../../shared/domain";

test("a crossing at 140 triggers once; staying high or hovering at 139 does not repeat", () => {
  const gate = new TotemTrigger();
  assert.equal(gate.update(120, 0), false);
  assert.equal(gate.update(140, 100), true);
  assert.equal(gate.update(150, 1000), false);
  assert.equal(gate.update(139, 12000), false);
  assert.equal(gate.update(141, 13000), false);
  assert.equal(gate.update(135, 14000), false);
  assert.equal(gate.update(140, 15000), true);
});

test("startup and reconnection at high BPM do not play a historical alert", () => {
  const gate = new TotemTrigger();
  assert.equal(gate.update(150, 0), false);
  assert.equal(gate.update(null, 500), false);
  assert.equal(gate.update(155, 1000), false);
  assert.equal(gate.update(130, 2000), false);
  assert.equal(gate.update(141, 3000), true);
});

test("cooldown consumes rapid crossings instead of replaying them later", () => {
  const gate = new TotemTrigger();
  gate.update(100, 0);
  assert.equal(gate.update(140, 100), true);
  gate.update(130, 1000);
  assert.equal(gate.update(145, 2000), false);
  assert.equal(gate.update(145, 20000), false);
  gate.update(130, 21000);
  assert.equal(gate.update(145, 22000), true);
});

test("legacy clean designs migrate to Minecraft without losing custom ranges", () => {
  const oldDesign = { ...defaultDesign, theme: "clean", name: "Custom design" };
  const migrated = designSchema.parse(oldDesign);
  assert.equal(migrated.theme, "minecraft");
  assert.equal(migrated.name, "Custom design");
  assert.deepEqual(migrated.ranges, oldDesign.ranges);
  for (const theme of ["minecraft", "hardcore", "neon", "crystal"]) {
    assert.equal(designSchema.parse({ ...defaultDesign, theme }).theme, theme);
  }
});
