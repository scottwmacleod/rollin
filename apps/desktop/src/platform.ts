/** The "mod" key for app shortcuts: ⌘ on macOS, Ctrl everywhere else. */

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const uad = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /mac|iphone|ipad/i.test(uad?.platform || navigator.platform || "");
}

type ModEvent = Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey">;

/** True when the event carries the platform's mod key, and no other modifier
 * that would make it a different shortcut (Alt; the other of ⌘/Ctrl). */
export function hasMod(e: ModEvent): boolean {
  if (e.altKey) return false;
  return isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** A shortcut hint: `⌘K` on macOS, `Ctrl K` elsewhere. */
export function modHint(key: string): string {
  return isMac() ? `⌘${key}` : `Ctrl ${key}`;
}

/** The `aria-keyshortcuts` value for the same shortcut. */
export function modAria(key: string): string {
  return `${isMac() ? "Meta" : "Control"}+${key}`;
}
