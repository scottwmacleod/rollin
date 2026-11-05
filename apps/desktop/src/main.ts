import "./generated/tokens.css";
import "./fonts.css";
import "./app.css";
import { initTheme } from "./theme";

initTheme();

import { execute, state } from "./api";
import { mountSidebar } from "./sidebar";

// The formula box (#83) listens for `rollin:submit` and runs the line exactly
// as if it had been typed, so a preset click and typing its name give the
// same log entry.
const sidebarEl = document.querySelector<HTMLElement>(".sidebar");
if (sidebarEl) {
  mountSidebar(sidebarEl, {
    execute,
    state,
    run: (line) => window.dispatchEvent(new CustomEvent("rollin:submit", { detail: line })),
  });
}
