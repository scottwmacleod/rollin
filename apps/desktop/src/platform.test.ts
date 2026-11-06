import { afterEach, describe, expect, it, vi } from "vitest";
import { hasMod, modAria, modHint } from "./platform";

export const asPlatform = (p: string) => vi.spyOn(navigator, "platform", "get").mockReturnValue(p);
afterEach(() => vi.restoreAllMocks());

const k = (init: Partial<KeyboardEvent>) => ({ ctrlKey: false, metaKey: false, altKey: false, ...init });

describe("platform mod key", () => {
  it("is ⌘ on macOS", () => {
    asPlatform("MacIntel");
    expect(hasMod(k({ metaKey: true }))).toBe(true);
    expect(hasMod(k({ ctrlKey: true }))).toBe(false);
    expect(hasMod(k({ metaKey: true, altKey: true }))).toBe(false);
    expect(modHint("K")).toBe("⌘K");
    expect(modAria("K")).toBe("Meta+K");
  });

  it("is Ctrl on Windows and Linux", () => {
    for (const p of ["Win32", "Linux x86_64"]) {
      asPlatform(p);
      expect(hasMod(k({ ctrlKey: true }))).toBe(true);
      expect(hasMod(k({ metaKey: true }))).toBe(false);
      expect(hasMod(k({ ctrlKey: true, altKey: true }))).toBe(false);
      expect(modHint("K")).toBe("Ctrl K");
      expect(modAria("K")).toBe("Control+K");
    }
  });
});
