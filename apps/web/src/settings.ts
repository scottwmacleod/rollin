import type { Storage } from "./storage";

export const SETTINGS_KEY = "settings";
export type KeypadSetting = "auto" | "on" | "off";
export const KEYPAD_SETTINGS: readonly KeypadSetting[] = ["auto", "on", "off"];

export interface Settings {
  keypad: KeypadSetting;
}

export const DEFAULT_SETTINGS: Settings = { keypad: "auto" };

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

const OLD_THEME_KEY = "rollin-theme";

export function forgetOldTheme(): void {
  try {
    localStorage.removeItem(OLD_THEME_KEY);
  } catch {}
}
