// The tokens follow the OS theme by default. Setting data-theme on <html>
// forces "light" or "dark"; clearing it returns to the OS theme.
export type Theme = "light" | "dark";

const KEY = "rollin-theme";

export function setTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme) root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  try {
    if (theme) localStorage.setItem(KEY, theme);
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the override just does not persist
  }
}

export function initTheme(): void {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch {
    // follow the OS theme
  }
}
