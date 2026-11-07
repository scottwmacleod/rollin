/**
 * Dismisses the narrow-window slide-over: Escape or a click outside closes it.
 * There is no toolbar button; ⌘B and the palette's "Toggle sidebar" open it.
 */
export function mountSlideOverDismiss(app: HTMLElement, sidebar: HTMLElement): void {
  const close = () => app.classList.remove("sidebar-open");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!sidebar.contains(e.target as Node)) close();
  });
  window.matchMedia("(max-width: 959px)").addEventListener("change", close);
}
