import type { Storage } from "./storage";

export const SETTINGS_KEY = "settings";
/** Whether the dice keypad shows: "auto" follows the device (on for touch screens). */
export type KeypadSetting = "auto" | "on" | "off";
export const KEYPAD_SETTINGS: readonly KeypadSetting[] = ["auto", "on", "off"];

/** Light and dark follow the OS only, so there is no theme setting. */
export interface Settings {
  keypad: KeypadSetting;
}

export const DEFAULT_SETTINGS: Settings = { keypad: "auto" };

/**
 * Anything saved by an older or newer build, or by hand, falls back to the defaults
 * field by field. A `theme` from before light and dark followed the OS is dropped.
 */
export function parseSettings(value: unknown): Settings {
  const saved = value as { keypad?: unknown } | null | undefined;
  const { keypad } = saved ?? {};
  return {
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

/** The key the old theme switch mirrored to; cleared so nothing stale is left behind. */
const OLD_THEME_KEY = "rollin-theme";

export function forgetOldTheme(): void {
  try {
    localStorage.removeItem(OLD_THEME_KEY);
  } catch {
    // Blocked storage holds nothing to clear.
  }
}
