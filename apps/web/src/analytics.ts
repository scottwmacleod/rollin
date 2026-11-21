import type { Node, Roll } from "@rollin/engine";
import { useSyncExternalStore } from "react";
import { capture, flag, onFlags } from "../../../vendor/sm-core/tooling/analytics/sm-posthog.js";

export function useFlag(key: string): string | boolean | undefined {
  return useSyncExternalStore(onFlags, () => flag(key));
}

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

export function diceStats(rolls: Roll[]): { dice: number; sides: number[] } {
  const found = { count: 0, sides: new Set<number>() };
  for (const roll of rolls) collect(roll.expr, found);
  return { dice: found.count, sides: [...found.sides].sort((a, b) => a - b) };
}

export function captureRoll(rolls: Roll[], from: RollSource): void {
  capture("dice_rolled", { ...diceStats(rolls), from });
}
