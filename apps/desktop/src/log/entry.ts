import { breakdown, totalDetail, totalText, type Cell } from "./breakdown";
import { caretLines } from "./caret";
import type { LogEntry, Roll } from "./types";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(time: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(time.getHours())}:${p(time.getMinutes())}:${p(time.getSeconds())}`;
}

export function cellNode(cell: Cell): Node {
  if (cell.type === "text") return document.createTextNode(cell.text);
  const span = el("span", `die die-${cell.state}`, cell.text);
  // Spoken form, so a state is never conveyed by styling alone.
  if (cell.state !== "kept") span.append(el("span", "sr-only", ` ${cell.spoken}`));
  return span;
}

function rollRow(roll: Roll): HTMLElement {
  const row = el("div", "roll-row");
  row.append(el("span", "roll-iteration", roll.iteration === undefined ? "" : String(roll.iteration)));

  const formula = el("span", "roll-formula");
  formula.append(el("span", "roll-formula-text", roll.formula));
  if (roll.label) formula.append(el("span", "roll-label", `# ${roll.label}`));
  row.append(formula);

  const cells = breakdown(roll);
  const bd = el("span", "roll-breakdown");
  for (const cell of cells) bd.append(cellNode(cell));
  // The visible text truncates; the tooltip keeps the whole breakdown.
  bd.title = cells.map((c) => c.text).join("");
  row.append(bd);

  const text = totalText(roll);
  const total = el("span", "roll-total");
  // `2 successes`: the unit is quieter than the number.
  const unit = /^(-?\d+)( successes?)$/.exec(text);
  if (unit) total.append(unit[1], el("span", "roll-total-unit", unit[2]));
  else total.textContent = text;
  total.title = totalDetail(roll);
  row.append(total);
  return row;
}

function header(entry: LogEntry): HTMLElement {
  const head = el("div", "entry-head");
  head.append(el("time", "entry-time", formatTime(entry.time)));
  head.append(el("span", "entry-input", `› ${entry.input}`));
  if (entry.preset) {
    head.append(
      el("span", "entry-preset", `(preset '${entry.preset.name}': ${entry.preset.expansion})`),
    );
  }
  return head;
}

/** One submit as a log entry. `entering` fades it in. */
export function renderEntry(entry: LogEntry, entering = false): HTMLElement {
  const root = el("article", "log-entry");
  root.dataset.entryId = String(entry.id);
  if (entering) root.classList.add("entering");
  root.append(header(entry));

  const result = entry.result;
  if (result.ok && "notice" in result) {
    root.classList.add("entry-notice");
    // One <pre> keeps listings aligned and selectable.
    if (result.notice.lines.length > 0) root.append(el("pre", "notice-lines", result.notice.lines.join("\n")));
    for (const hint of result.notice.hints) root.append(el("p", "notice-hint", hint));
  } else if (result.ok) {
    root.classList.add("entry-rolls");
    for (const roll of result.doc.rolls) root.append(rollRow(roll));
  } else {
    root.classList.add("entry-error");
    const body = el("div", "error-body");
    body.append(el("p", "error-message", `error: ${result.message}`));
    if (result.source !== undefined && result.span) {
      const [line, carets] = caretLines(result.source, result.span);
      const pre = el("pre", "error-caret");
      pre.append(el("span", "error-source", line), `\n${carets}`);
      body.append(pre);
    }
    for (const hint of result.hints ?? []) body.append(el("p", "error-hint", hint));
    root.append(body);
  }
  return root;
}
