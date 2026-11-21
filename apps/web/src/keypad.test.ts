import { describe, expect, it } from "vitest";
import { type Key, press } from "./keypad.ts";

const run = (keys: Key[]) => keys.reduce((formula, key) => press(formula, key), "");
const die = (sides: number): Key => ({ kind: "die", sides });
const digit = (d: string): Key => ({ kind: "digit", digit: d });

describe("keypad", () => {
  it("joins a count and a die", () => {
    expect(run([digit("2"), die(6)])).toBe("2d6");
  });
  it("starts a term with a bare die", () => {
    expect(run([die(20)])).toBe("d20");
  });
  it("separates a die that follows another die", () => {
    expect(run([die(6), die(8)])).toBe("d6+d8");
  });
  it("builds a whole formula", () => {
    expect(run([digit("2"), die(6), { kind: "op", op: "+" }, digit("3")])).toBe("2d6+3");
  });
  it("never starts with, or doubles, an operator", () => {
    expect(run([{ kind: "op", op: "-" }])).toBe("");
    expect(run([digit("1"), { kind: "op", op: "+" }, { kind: "op", op: "-" }])).toBe("1+");
  });
  it("backspaces and clears", () => {
    expect(run([die(6), { kind: "back" }])).toBe("d");
    expect(run([die(6), { kind: "clear" }])).toBe("");
  });
  it("starts a new formula after a roll when a digit or die comes first", () => {
    expect(press("8d6", digit("1"), true)).toBe("1");
    expect(press("8d6", die(20), true)).toBe("d20");
  });
  it("carries on from the rolled formula after a roll when an operator comes first", () => {
    expect(press("8d6", { kind: "op", op: "+" }, true)).toBe("8d6+");
  });
  it("edits the rolled formula with backspace and clears it with C", () => {
    expect(press("8d6", { kind: "back" }, true)).toBe("8d");
    expect(press("8d6", { kind: "clear" }, true)).toBe("");
  });
});
