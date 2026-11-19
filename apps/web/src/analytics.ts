import type { Node, Roll } from "@rollin/engine";
import { useSyncExternalStore } from "react";
import { capture, flag, onFlags } from "../../../vendor/sm-core/tooling/analytics/sm-posthog.js";

/**
 * The visitor's variant for an experiment flag: a variant name, true or false,
 * or undefined until PostHog has answered (render the control until then).
 * Reading it records the exposure once per page, which experiment results need.
 */
export function useFlag(key: string): string | boolean | undefined {
  return useSyncExternalStore(onFlags, () => flag(key));
}

/** Where a roll came from: the formula box or keypad, a saved preset, or a formula recalled from the log. */
export type RollSource = "input" | "preset" | "history";

function collect(node: Node, found: { count: number; sides: Set<number> }): void {
  switch (node.type) {
    case "dice":
      found.count += node.dice.length;
      found.sides.add(node.sides);
      return;
    case "neg":
      collect(node.operand, found);
      return;
    case "group":
      collect(node.inner, found);
      return;
    case "chain":
      collect(node.first, found);
      for (const link of node.rest) collect(link.node, found);
      return;
    case "number":
      return;
  }
}

/** How many dice a report rolled, and which distinct die sizes, smallest first. Never the formula (#216). */
export function diceStats(rolls: Roll[]): { dice: number; sides: number[] } {
  const found = { count: 0, sides: new Set<number>() };
  for (const roll of rolls) collect(roll.expr, found);
  return { dice: found.count, sides: [...found.sides].sort((a, b) => a - b) };
}

/** The one event that marks real use, so an experiment can take it as its goal. Counts only; no formula, names or results. */
export function captureRoll(rolls: Roll[], from: RollSource): void {
  capture("dice_rolled", { ...diceStats(rolls), from });
}
