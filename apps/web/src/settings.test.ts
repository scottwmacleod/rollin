import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from "./settings";
import { memoryStorage } from "./storage";

describe("parseSettings", () => {
  it("accepts each theme", () => {
    for (const theme of ["system", "light", "dark"] as const) {
      expect(parseSettings({ theme })).toEqual({ theme, keypad: "auto" });
    }
  });

  it("accepts each keypad setting and falls back to auto for anything else", () => {
    for (const keypad of ["auto", "on", "off"] as const) {
      expect(parseSettings({ theme: "dark", keypad })).toEqual({ theme: "dark", keypad });
    }
    for (const keypad of ["", "yes", 1, null, true]) {
      expect(parseSettings({ theme: "light", keypad }).keypad).toBe("auto");
    }
    expect(parseSettings({ theme: "light" }).keypad).toBe("auto");
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
    await saveSettings(storage, { theme: "light", keypad: "on" });
    expect(await loadSettings(storage)).toEqual({ theme: "light", keypad: "on" });
  });
});
