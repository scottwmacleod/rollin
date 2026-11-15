import type { Storage } from "./storage";

export const SETTINGS_KEY = "settings";
/** Mirrors the theme where the page can read it before storage opens, so the first paint is right. */
export const THEME_MIRROR_KEY = "rollin-theme";

export type Theme = "system" | "light" | "dark";
export const THEMES: readonly Theme[] = ["system", "light", "dark"];

/** Whether the dice keypad shows: "auto" follows the device (on for touch screens). */
export type KeypadSetting = "auto" | "on" | "off";
export const KEYPAD_SETTINGS: readonly KeypadSetting[] = ["auto", "on", "off"];

export interface Settings {
  theme: Theme;
  keypad: KeypadSetting;
}

export const DEFAULT_SETTINGS: Settings = { theme: "system", keypad: "auto" };

/** Anything saved by an older or newer build, or by hand, falls back to the defaults field by field. */
export function parseSettings(value: unknown): Settings {
  const saved = value as { theme?: unknown; keypad?: unknown } | null | undefined;
  const { theme, keypad } = saved ?? {};
  return {
    theme: THEMES.includes(theme as Theme) ? (theme as Theme) : DEFAULT_SETTINGS.theme,
    keypad: KEYPAD_SETTINGS.includes(keypad as KeypadSetting)
      ? (keypad as KeypadSetting)
      : DEFAULT_SETTINGS.keypad,
  };
}

export async function loadSettings(storage: Storage): Promise<Settings> {
  return parseSettings(await storage.get<unknown>(SETTINGS_KEY));
}

export function saveSettings(storage: Storage, settings: Settings): Promise<void> {
  return storage.set(SETTINGS_KEY, settings);
}

/**
 * Force light or dark with `data-theme` on `<html>`; "system" removes it so the
 * tokens follow the OS. The choice is mirrored to localStorage for the inline
 * script in index.html, which runs before any of this app does.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem(THEME_MIRROR_KEY);
    else localStorage.setItem(THEME_MIRROR_KEY, theme);
  } catch {
    // Blocked: the theme still applies, it just flashes on the next load.
  }
}
