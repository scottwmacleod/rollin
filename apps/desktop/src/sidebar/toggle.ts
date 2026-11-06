import { hasMod, modHint } from "../platform";

/**
 * A toolbar button for the sidebar, so narrow windows have a visible way in
 * (⌘B alone is invisible). Escape or a click outside closes the slide-over.
 * `toggle` is the sidebar's own ⌘B action, so both routes stay in step.
 */
export function mountSidebarToggle(
  app: HTMLElement,
  toolbar: HTMLElement,
  sidebar: HTMLElement,
  toggle: () => void,
): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sb-toggle";
  button.textContent = "☰";
  button.title = `Toggle sidebar (${modHint("B")})`;
  button.setAttribute("aria-label", "Toggle sidebar");
  button.setAttribute("aria-controls", "sidebar");
  sidebar.id = "sidebar";
  toolbar.append(button);

  const shown = () => {
    const narrow = window.matchMedia("(max-width: 959px)").matches;
    return narrow ? app.classList.contains("sidebar-open") : !app.classList.contains("sidebar-collapsed");
  };
  const sync = () => button.setAttribute("aria-expanded", String(shown()));
  const closeSlideOver = () => {
    app.classList.remove("sidebar-open");
    sync();
  };

  button.addEventListener("click", () => {
    toggle();
    sync();
  });
  // Runs after the sidebar's own ⌘B handler, so the state is already flipped.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSlideOver();
    else if (hasMod(e) && e.key.toLowerCase() === "b") sync();
  });
  document.addEventListener("pointerdown", (e) => {
    const target = e.target as Node;
    if (!sidebar.contains(target) && !button.contains(target)) closeSlideOver();
  });
  sidebar.addEventListener("click", () => queueMicrotask(sync));
  window.matchMedia("(max-width: 959px)").addEventListener("change", () => {
    closeSlideOver();
  });
  sync();
}
