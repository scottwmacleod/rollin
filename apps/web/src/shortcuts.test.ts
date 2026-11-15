import { describe, expect, it } from "vitest";
import { shortcutText } from "./shortcuts";

describe("shortcutText", () => {
  it("uses ⌘ on Apple platforms", () => {
    expect(shortcutText("k", true)).toBe("⌘K");
    expect(shortcutText(",", true)).toBe("⌘,");
  });
  it("uses Ctrl elsewhere", () => {
    expect(shortcutText("k", false)).toBe("Ctrl+K");
    expect(shortcutText(",", false)).toBe("Ctrl+,");
  });
});
