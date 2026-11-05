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
    expect(e?.result.ok && e.result.doc.rolls).toHaveLength(1);
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

  it("logs a rejection and skips non-roll results", () => {
    expect(entryFor("x", { status: "rejected", message: "no" }, t)?.result).toEqual({ ok: false, message: "no" });
    expect(entryFor("", { status: "empty" }, t)).toBeNull();
    expect(entryFor("help", { status: "text", lines: ["h"] }, t)).toBeNull();
  });
});
