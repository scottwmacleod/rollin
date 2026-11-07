import { getCurrentWindow } from "@tauri-apps/api/window";

/** Mirrors the window's full-screen state onto `data-fullscreen` so CSS can
 * drop the inset reserved for the macOS window buttons, which macOS hides in
 * full screen. Entering or leaving full screen resizes the window. */
export async function trackFullscreen(root: HTMLElement): Promise<void> {
  try {
    const win = getCurrentWindow();
    const sync = async () => root.toggleAttribute("data-fullscreen", await win.isFullscreen());
    await sync();
    await win.onResized(() => void sync());
  } catch {
    // Not running inside Tauri (plain browser, tests): keep the inset.
  }
}
