import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings } from "./settings";
import { memoryStorage } from "./storage";

describe("parseSettings", () => {
  it("accepts each keypad setting and falls back to auto for anything else", () => {
    for (const keypad of ["auto", "on", "off"] as const) {
      expect(parseSettings({ keypad })).toEqual({ keypad });
    }
    for (const keypad of ["", "yes", 1, null, true]) {
      expect(parseSettings({ keypad }).keypad).toBe("auto");
    }
  });

  it("drops a theme saved before light and dark followed the OS", () => {
    expect(parseSettings({ theme: "light", keypad: "on" })).toEqual({ keypad: "on" });
    expect(parseSettings({ theme: "dark" })).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to the defaults for anything else", () => {
    for (const bad of [undefined, null, 3, "dark", {}, { keypad: "sepia" }]) {
      expect(parseSettings(bad)).toEqual(DEFAULT_SETTINGS);
    }
  });
});

describe("saved settings", () => {
  it("round-trip through storage", async () => {
    const storage = memoryStorage();
    expect(await loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    await saveSettings(storage, { keypad: "on" });
    expect(await loadSettings(storage)).toEqual({ keypad: "on" });
  });
});
