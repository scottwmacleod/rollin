import type { LogEntry } from "./types";

/** What a keystroke does while the log has focus. `null` = not ours: the key
 * returns focus to the formula box and is typed there. */
export type LogKey = "next" | "prev" | "toggle" | "reroll" | "copy" | "blur";

export function classify(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): LogKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case "j":
    case "J":
      return "next";
    case "k":
    case "K":
      return "prev";
    case "r":
    case "R":
      return "reroll";
    case "c":
    case "C":
      return "copy";
    case "Enter":
      return "toggle";
    case "Escape":
      return "blur";
    default:
      return null;
  }
}

/** A printable key: one character, not a control or navigation key. */
export function isPrintable(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/** An entry as plain text: the input, then one line per roll. */
export function entryText(entry: LogEntry, breakdownOf: (i: number) => string): string {
  const lines = [`› ${entry.input}`];
  if (!entry.result.ok) {
    lines.push(`error: ${entry.result.message}`);
  } else {
    entry.result.doc.rolls.forEach((roll, i) => {
      const bd = breakdownOf(i);
      lines.push(`${roll.formula}${bd ? `  ${bd}` : ""}  = ${roll.total}`);
    });
  }
  return lines.join("\n");
}
