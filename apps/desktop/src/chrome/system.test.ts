import { describe, expect, it } from "vitest";
import { systemLabel } from "./system";

describe("game system in force", () => {
  it("shows the system the library says rolls run under", () => {
    expect(systemLabel({ effective_system: "dnd5e" })).toBe("D&D 5e");
  });

  it("is none when the library says there is none", () => {
    expect(systemLabel({ effective_system: null })).toBe("no system");
  });
});
