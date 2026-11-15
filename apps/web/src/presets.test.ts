import { expect, test } from "vitest";
import { cleanPresets, loadPresets, PRESETS_KEY, sortedPresets, updatePresets } from "./presets";
import { memoryStorage } from "./storage";

test("cleanPresets keeps only text formulas", () => {
  expect(cleanPresets({ a: "d6", b: 3, c: null })).toEqual({ a: "d6" });
  expect(cleanPresets(["d6"])).toEqual({});
  expect(cleanPresets(undefined)).toEqual({});
});

test("presets list in name order", () => {
  expect(sortedPresets({ zap: "d4", attack: "d20", Bolt: "d8" }).map(([n]) => n)).toEqual([
    "Bolt",
    "attack",
    "zap",
  ]);
});

test("updatePresets builds on what is saved, so another tab's preset survives", async () => {
  const storage = memoryStorage();
  await storage.set(PRESETS_KEY, { attack: "d20+5" });
  const saved = await updatePresets(storage, (p) => ({ ...p, smite: "2d8" }));
  expect(saved).toEqual({ attack: "d20+5", smite: "2d8" });
  expect(await loadPresets(storage)).toEqual(saved);
});
