import "./banner.css";
import { statusText, type UpdateState, type Updater } from "./index";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * The launch offer: a banner that appears when an update is available and
 * offers "Update and restart". "Later" hides it until the next launch; the
 * About dialog still offers the update.
 */
export function mountUpdateBanner(updater: Updater): void {
  let dismissed = false;
  let banner: HTMLElement | null = null;

  const render = (state: UpdateState) => {
    const show = !dismissed && (state.kind === "available" || state.kind === "installing");
    if (!show) {
      banner?.remove();
      banner = null;
      return;
    }
    if (!banner) {
      banner = el("div", "update-banner");
      banner.setAttribute("role", "region");
      banner.setAttribute("aria-label", "Update");
      document.body.append(banner);
    }
    const text = el("span", "update-banner-text", statusText(state) ?? "");
    banner.replaceChildren(text);
    if (state.kind === "available") {
      const go = el("button", "update-banner-go", "Update and restart");
      go.setAttribute("type", "button");
      go.addEventListener("click", () => void updater.install());
      const later = el("button", "update-banner-later", "Later");
      later.setAttribute("type", "button");
      later.addEventListener("click", () => {
        dismissed = true;
        render(updater.state());
      });
      banner.append(go, later);
    }
  };

  updater.subscribe(render);
}
