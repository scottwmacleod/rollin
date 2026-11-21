import { ROOMY, TOUCH, useMedia } from "./useMedia";

export function isApple(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.platform || nav.userAgentData?.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function shortcutText(key: string, apple: boolean): string {
  return apple ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

export function useShortcutHint(key: string): string | null {
  const touch = useMedia(TOUCH);
  const roomy = useMedia(ROOMY);
  return touch || !roomy ? null : shortcutText(key, isApple());
}
