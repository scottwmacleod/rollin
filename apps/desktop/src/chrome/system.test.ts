import { describe, expect, it } from "vitest";
import { effectiveSystem, systemLabel } from "./system";

describe("game system in force", () => {
  it("prefers the character's own over the default", () => {
    expect(effectiveSystem({ system: "dnd5e", default_system: null })).toBe("dnd5e");
    expect(effectiveSystem({ system: null, default_system: "dnd5e" })).toBe("dnd5e");
  });

  it("is none when neither is set", () => {
    expect(effectiveSystem({ system: null, default_system: null })).toBeNull();
    expect(systemLabel({ system: null, default_system: null })).toBe("no system");
  });
});
