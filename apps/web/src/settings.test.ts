import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from "./settings";
import { memoryStorage } from "./storage";

describe("parseSettings", () => {
  it("accepts each theme", () => {
    for (const theme of ["system", "light", "dark"] as const) {
      expect(parseSettings({ theme })).toEqual({ theme });
    }
  });

  it("falls back to the defaults for anything else", () => {
    for (const bad of [undefined, null, 3, "dark", {}, { theme: "sepia" }, { theme: 1 }]) {
      expect(parseSettings(bad)).toEqual(DEFAULT_SETTINGS);
    }
  });
});

describe("saved settings", () => {
  it("round-trip through storage", async () => {
    const storage = memoryStorage();
    expect(await loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    await saveSettings(storage, { theme: "light" });
    expect(await loadSettings(storage)).toEqual({ theme: "light" });
  });
});
