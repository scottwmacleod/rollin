import { totalDetail } from "./breakdown";
import type { Die, Node, Roll } from "./types";

type Dice = Extract<Node, { type: "dice" }>;

/** One row of the die tree: die · rolled · step · counts. */
export interface TreeRow {
  /** 1-based position in the term's dice, matching "extra die from 2". */
  die: number;
  rolled: string;
  step: string;
  counts: string;
}

export interface TreeSection {
  term: string;
  rows: TreeRow[];
}

export interface Tree {
  sections: TreeSection[];
  /** `reroll (r1) → explode (!) → keep/drop (dl1)`; empty without modifiers. */
  order: string;
  total: string;
}

function dice(node: Node, out: Dice[]): Dice[] {
  switch (node.type) {
    case "dice":
      out.push(node);
      break;
    case "neg":
      dice(node.operand, out);
      break;
    case "group":
      dice(node.inner, out);
      break;
    case "chain":
      dice(node.first, out);
      for (const l of node.rest) dice(l.node, out);
      break;
  }
  return out;
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/** Why a die is what it is, in words, from the `reason` the library records. */
export function stepText(die: Die, all: Die[]): string {
  const r = die.reason;
  const from = r?.from === undefined ? "" : String(r.from + 1);
  if (r) {
    const c = r.clause;
    let m: RegExpMatchArray | null;
    if (die.status === "dropped") {
      if (c === "adv") return "dropped, lower of two (adv)";
      if (c === "dis") return "dropped, higher of two (dis)";
      if ((m = c.match(/^(dl|dh)(\d*)$/))) {
        const which = m[1] === "dl" ? "lowest" : "highest";
        return `dropped, ${which}${m[2] && m[2] !== "1" ? ` ${m[2]}` : ""} of pool (${c})`;
      }
      if ((m = c.match(/^(kl|kh)(\d*)$/))) {
        const which = m[1] === "kl" ? "lowest" : "highest";
        return `dropped, not among the ${which}${m[2] && m[2] !== "1" ? ` ${m[2]}` : ""} (${c})`;
      }
      return `dropped (${c})`;
    }
    let text: string;
    if (die.status === "rerolled") {
      text = c.startsWith("rr") ? `rerolled (${c})` : `rerolled once (${c})`;
    } else if (/^r/.test(c)) {
      text = from ? `replaced die ${from} (${c})` : `reroll replacement (${c})`;
    } else if (c === "!!") {
      text = `compounded: ${(die.parts ?? [die.value]).join(" + ")} (!!)`;
    } else if (c === "!p") {
      text = `penetrating extra die${from ? ` from ${from}` : ""} (!p)`;
    } else if (c === "!") {
      text = `extra die${from ? ` from ${from}` : ""} (!)`;
    } else {
      text = `${die.status} (${c})`;
    }
    if (r.also === "!!") text += `, compounded: ${(die.parts ?? [die.value]).join(" + ")} (!!)`;
    else if (r.also) text += `, also ${r.also}`;
    return text;
  }
  if (die.outcome) return die.outcome;
  if (die.status === "kept") return "kept";
  // Never silent: a status this build does not know is shown as received.
  void all;
  return die.status;
}

function countsText(die: Die): string {
  if (die.outcome) return die.outcome;
  if (die.status === "dropped" || die.status === "rerolled") return "—";
  return `+${die.value}`;
}

const FAMILIES: [RegExp, string][] = [
  [/^rr?\d|^rr?[<>=]/, "reroll"],
  [/^!/, "explode"],
  [/^(dl|dh|kl|kh|adv|dis)/, "keep/drop"],
  [/^[<>=]/, "success counting"],
];

function family(clause: string): string {
  return FAMILIES.find(([re]) => re.test(clause))?.[1] ?? "modifier";
}

export function dieTree(roll: Roll): Tree {
  const nodes = dice(roll.expr, []);
  const sections = nodes.map((n) => ({
    term: n.term,
    rows: n.dice.map((d, i) => ({
      die: i + 1,
      rolled: d.parts && d.parts.length > 1 ? `${d.value} (${d.parts.join("+")})` : String(d.value),
      step: stepText(d, n.dice),
      counts: countsText(d),
    })),
  }));
  const mods = nodes.flatMap((n) => n.modifiers ?? []);
  const order = mods.map((c) => `${family(c)} (${c})`).join(" → ");
  return { sections, order, total: totalDetail(roll) };
}
