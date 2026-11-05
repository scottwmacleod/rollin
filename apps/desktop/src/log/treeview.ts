import { dieTree } from "./tree";
import type { Roll } from "./types";

function cell(tag: "th" | "td", text: string, className = ""): HTMLElement {
  const n = document.createElement(tag);
  n.textContent = text;
  if (className) n.className = className;
  if (tag === "th") n.scope = "col";
  return n;
}

/** The expanded die tree for one roll, on `sunken`. */
export function renderTree(roll: Roll): HTMLElement {
  const tree = dieTree(roll);
  const root = document.createElement("div");
  root.className = "die-tree";
  for (const section of tree.sections) {
    const table = document.createElement("table");
    table.className = "die-tree-table";
    const cap = document.createElement("caption");
    cap.textContent = section.term;
    table.append(cap);
    const head = table.createTHead().insertRow();
    for (const h of ["die", "rolled", "step", "counts"]) head.append(cell("th", h));
    const body = table.createTBody();
    for (const r of section.rows) {
      const tr = body.insertRow();
      tr.append(cell("td", String(r.die), "tree-die"));
      tr.append(cell("td", r.rolled, "tree-rolled"));
      tr.append(cell("td", r.step, "tree-step"));
      tr.append(cell("td", r.counts, "tree-counts"));
    }
    root.append(table);
  }
  const foot = document.createElement("p");
  foot.className = "die-tree-foot";
  const order = document.createElement("span");
  order.className = "tree-order";
  order.textContent = tree.order || "no modifiers";
  const label = document.createElement("span");
  label.textContent = "total";
  const total = document.createElement("span");
  total.className = "tree-total";
  total.textContent = tree.total;
  foot.append(order, label, total);
  root.append(foot);
  return root;
}
