import { ROOMY, TOUCH, useMedia } from "./useMedia";

/** Whether this device's modifier key is ⌘. */
export function isApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.platform || nav.userAgentData?.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** How a shortcut reads on this device: ⌘K on Apple platforms, Ctrl+K elsewhere. */
export function shortcutText(key: string, apple: boolean): string {
  return apple ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

/** The hint to show beside a shortcut's button, or `null` on a touch screen (no keyboard to hint at) or a window too narrow to fit it. */
export function useShortcutHint(key: string): string | null {
  const touch = useMedia(TOUCH);
  const roomy = useMedia(ROOMY);
  return touch || !roomy ? null : shortcutText(key, isApple());
}
