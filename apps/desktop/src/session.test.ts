import { describe, expect, it } from "vitest";
import { entryFor } from "./session";
import type { Execution, Output } from "./api/types";

const t = new Date(0);
const roll = { formula: "d20", total: 7, expr: { type: "number", value: 7 } } as const;
const rolls = (preset: [string, string] | null): Execution => ({
  status: "ok",
  output: { kind: "rolls", preset, rolls: [roll], lines: [], hints: [] } as Output,
});

describe("entryFor", () => {
  it("makes a roll entry with the preset expansion", () => {
    const e = entryFor("atk", rolls(["atk", "d20+5"]), t);
    expect(e?.preset).toEqual({ name: "atk", expansion: "d20+5" });
    expect(e?.result.ok && "doc" in e.result && e.result.doc.rolls).toHaveLength(1);
    expect(entryFor("d20", rolls(null), t)?.preset).toBeUndefined();
  });

  it("makes an error entry carrying the caret span", () => {
    const e = entryFor(
      "d20+",
      { status: "error", error: { kind: "parse", message: "bad", hints: [] }, span: { start: 4, end: 4 }, source: "d20+" },
      t,
    );
    expect(e?.result).toEqual({ ok: false, message: "bad", source: "d20+", span: [4, 4] });
  });

  it("logs a rejection and skips empty lines and quit", () => {
    expect(entryFor("x", { status: "rejected", message: "no" }, t)?.result).toEqual({ ok: false, message: "no" });
    expect(entryFor("", { status: "empty" }, t)).toBeNull();
    expect(entryFor("quit", { status: "quit" }, t)).toBeNull();
  });

  it("logs help text as a notice", () => {
    expect(entryFor("help", { status: "text", lines: ["h", "i"] }, t)?.result).toEqual({
      ok: true,
      notice: { lines: ["h", "i"], hints: [] },
    });
  });

  it("logs a command's library lines as a notice", () => {
    const saved: Execution = {
      status: "ok",
      output: { kind: "saved", name: "atk", formula: "d20+5", character: null, replaced: null, lines: ["saved 'atk': d20+5"], hints: [] },
    };
    expect(entryFor("save atk d20+5", saved, t)?.result).toEqual({
      ok: true,
      notice: { lines: ["saved 'atk': d20+5"], hints: [] },
    });
  });

  it("lays out listings from the typed data and words hints for the desktop", () => {
    const vars: Execution = { status: "ok", output: { kind: "vars", vars: [["str", 3], ["dex", 4]], lines: [], hints: [] } };
    expect(entryFor("vars", vars, t)?.result).toEqual({ ok: true, notice: { lines: ["str = 3", "dex = 4"], hints: [] } });

    const none: Execution = {
      status: "ok",
      output: { kind: "vars", vars: [], lines: ["No variables set."], hints: [{ kind: "add_variable" }] },
    };
    expect(entryFor("vars", none, t)?.result).toEqual({
      ok: true,
      notice: { lines: ["No variables set. Add one with: set <name> <integer>"], hints: [] },
    });

    const presets: Execution = {
      status: "ok",
      output: {
        kind: "presets",
        presets: [
          { name: "atk", formula: "d20+5", source: { kind: "character", name: "mira" }, shadow: { kind: "shadows" } },
          { name: "fireball", formula: "8d6", source: { kind: "global" }, shadow: { kind: "none" } },
        ],
        lines: [],
        hints: [],
      },
    };
    expect(entryFor("presets", presets, t)?.result).toEqual({
      ok: true,
      notice: { lines: ["atk       d20+5  [mira, shadows global]", "fireball  8d6    [global]"], hints: [] },
    });

    const chars: Execution = { status: "ok", output: { kind: "characters", names: ["default", "mira"], active: "mira", lines: [], hints: [] } };
    expect(entryFor("characters", chars, t)?.result).toEqual({ ok: true, notice: { lines: ["  default", "* mira"], hints: [] } });
  });
});
