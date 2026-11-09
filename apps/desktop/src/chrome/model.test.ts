import { describe, expect, it } from "vitest";
import type { Execution, PresetEntry, SessionState } from "../api/types";
import { presetClash, presetSaveLines } from "./dialog";
import { eventFor, matchScore, paletteView, parseQuery, rollsIn } from "./model";

const ok = (output: object, lines: string[]): Execution =>
  ({ status: "ok", output: { ...output, lines, hints: [] } }) as unknown as Execution;

const preset = (name: string, formula: string, global = false, shadowedBy?: string): PresetEntry => ({
  name,
  formula,
  source: global ? { kind: "global" } : { kind: "character", name: "grog" },
  shadow: shadowedBy ? { kind: "shadowed_by", by: shadowedBy } : { kind: "none" },
});

const state = (over: Partial<SessionState> = {}): SessionState => ({
  active_character: "grog",
  characters: ["default", "grog", "mira"],
  vars: [["str", 4]],
  presets: [preset("attack", "d20+5"), preset("mace", "1d20+5")],
  global_presets: [preset("fireball", "8d6", true), preset("attack", "d20", true, "grog")],
  system: null,
  default_system: null,
  effective_system: null,
  systems: ["dnd5e"],  seed: null,
  history: ["d20", "attack", "d20", "vars"],
  ...over,
});

describe("eventFor", () => {
  it("uses the library's text with a glyph for what happened", () => {
    expect(eventFor(ok({ kind: "saved", replaced: null }, ["saved 'braceup': 2d6"]))).toEqual({
      glyph: "+",
      text: "saved 'braceup': 2d6",
    });
    expect(eventFor(ok({ kind: "saved", replaced: "d6" }, ["replaced 'x' (was d6): d8"]))?.glyph).toBe("~");
    expect(eventFor(ok({ kind: "deleted" }, ["deleted 'x'"]))?.glyph).toBe("−");
    expect(eventFor(ok({ kind: "char_renamed" }, ["renamed 'a' to 'b'"]))?.glyph).toBe("~");
  });

  it("has no event for rolls, listings, character switches and failures", () => {
    expect(eventFor(ok({ kind: "char_switched", name: "silas" }, ["active character: silas"]))).toBeNull();
    expect(eventFor(ok({ kind: "active_character", name: "silas" }, ["active character: silas"]))).toBeNull();
    expect(eventFor(ok({ kind: "rolls", rolls: [] }, []))).toBeNull();
    expect(eventFor(ok({ kind: "vars", vars: [] }, []))).toBeNull();
    expect(eventFor({ status: "rejected", message: "no" })).toBeNull();
  });
});

describe("rollsIn", () => {
  it("counts the rolls a result holds", () => {
    expect(rollsIn(ok({ kind: "rolls", rolls: [{}, {}, {}] }, []))).toBe(3);
    expect(rollsIn(ok({ kind: "vars" }, []))).toBe(0);
  });
});

describe("palette", () => {
  it("reads the scope prefix", () => {
    expect(parseQuery("@mi")).toEqual({ scope: "characters", term: "mi" });
    expect(parseQuery(">new")).toEqual({ scope: "commands", term: "new" });
    expect(parseQuery(" mace ")).toEqual({ scope: "all", term: "mace" });
  });

  it("ranks prefix before substring before scattered letters", () => {
    expect(matchScore("mace", "ma")).toBe(0);
    expect(matchScore("big mace", "ma")).toBe(1);
    expect(matchScore("normal", "ma")).toBe(2);
    expect(matchScore("mighty axe", "mae")).toBe(3);
    expect(matchScore("mace", "z")).toBeNull();
  });

  it("with nothing typed shows recents then the scope tips", () => {
    const v = paletteView(state(), "");
    expect(v.rows.map((r) => r.label)).toEqual(["vars", "d20", "attack", "@ to switch character", "> to run a command"]);
    expect(v.headings.get(0)).toBe("Recent");
    expect(v.headings.get(3)).toBe("Try typing");
  });

  it("plain typing searches presets and commands, not characters, and skips shadowed globals", () => {
    const labels = paletteView(state(), "a").rows.map((r) => `${r.kind}:${r.label}`);
    expect(labels).toContain("preset:attack");
    expect(labels.filter((l) => l === "preset:attack")).toHaveLength(1);
    expect(labels.some((l) => l.startsWith("character:"))).toBe(false);
  });

  it("@ searches characters and marks the current one", () => {
    const v = paletteView(state(), "@m");
    expect(v.rows.map((r) => r.label)).toEqual(["mira"]);
    const all = paletteView(state(), "@");
    expect(all.rows.find((r) => r.label === "grog")?.detail).toBe("current");
    expect(all.rows[0]?.action).toEqual({ type: "switch", name: "default" });
  });

  it("> searches commands only", () => {
    const rows = paletteView(state(), ">new").rows;
    expect(rows.map((r) => r.label)).toEqual(["New character…", "New preset…"]);
  });
});

describe("preset dialog logic", () => {
  const s = state();
  it("saves first, then deletes the old name after a rename or move", () => {
    const next = { name: "strike", formula: "d20", global: false };
    expect(presetSaveLines({ name: "attack", global: false }, next)).toEqual(["save strike d20", "delete attack"]);
    expect(presetSaveLines({ name: "attack", global: false }, { ...next, name: "attack", global: true })).toEqual([
      "save attack d20 --global",
      "delete attack",
    ]);
    expect(presetSaveLines({ name: "attack", global: false }, { ...next, name: "Attack" })).toEqual(["save Attack d20"]);
    expect(presetSaveLines(null, next)).toEqual(["save strike d20"]);
  });

  it("finds the preset a save would replace, but not the one being edited", () => {
    expect(presetClash(s, { name: "attack", global: false }, "mace", false)?.formula).toBe("1d20+5");
    expect(presetClash(s, { name: "attack", global: false }, "attack", false)).toBeNull();
    expect(presetClash(s, null, "attack", false)?.formula).toBe("d20+5");
    expect(presetClash(s, null, "new", false)).toBeNull();
  });
});
