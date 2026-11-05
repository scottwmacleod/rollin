import "./about.css";
import type { About } from "../api/types";

export interface AboutDeps {
  /** Reads the About data (`api.about`). */
  about(): Promise<About>;
  /** Opens a URL in the system browser. */
  openUrl(url: string): void | Promise<void>;
}

export interface AboutView {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
  /**
   * The slot the auto-update work fills ("Up to date", "Update available").
   * `null` hides the line.
   */
  setUpdateStatus(text: string | null): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

/** The About dialog: modal over the app, built from the design tokens. */
export function mountAbout(deps: AboutDeps): AboutView {
  let backdrop: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let statusText: string | null = null;
  let returnTo: HTMLElement | null = null;

  const applyStatus = () => {
    if (!status) return;
    status.textContent = statusText ?? "";
    status.hidden = statusText === null;
  };

  const close = () => {
    if (!backdrop) return;
    backdrop.remove();
    backdrop = null;
    status = null;
    if (returnTo?.isConnected) returnTo.focus();
    returnTo = null;
  };

  const open = async () => {
    if (backdrop) return;
    let info: About;
    try {
      info = await deps.about();
    } catch {
      return; // nothing trustworthy to show
    }
    if (backdrop) return;
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const root = el("div", "about-backdrop");
    const dialog = el("div", "about-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "about-title");

    const title = el("h2", "about-title", info.name);
    title.id = "about-title";

    const rows = el("dl", "about-facts");
    const fact = (label: string, value: Node | string) => {
      rows.append(el("dt", "about-label", label));
      const dd = el("dd", "about-value");
      dd.append(value);
      rows.append(dd);
    };
    fact("App version", info.app_version);
    fact("Library version", info.library_version);
    fact("Licence", info.license);

    const link = el("a", "about-link", info.repository.replace(/^https?:\/\//, ""));
    link.setAttribute("href", info.repository);
    link.setAttribute("aria-label", `Source repository, ${info.repository}`);
    link.addEventListener("click", (e) => {
      e.preventDefault();
      void deps.openUrl(info.repository);
    });
    fact("Source", link);

    status = el("p", "about-update");
    status.setAttribute("role", "status");
    status.setAttribute("data-slot", "update-status");

    const done = el("button", "about-close", "Close");
    done.setAttribute("type", "button");
    done.addEventListener("click", close);

    dialog.append(title, rows, status, done);
    root.append(dialog);
    root.addEventListener("mousedown", (e) => {
      if (e.target === root) close();
    });
    dialog.addEventListener("keydown", (e) => {
      // Nothing behind the dialog may react to keys while it is up.
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        const stops = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    backdrop = root;
    applyStatus();
    document.body.append(root);
    done.focus();
  };

  return {
    open,
    close,
    isOpen: () => backdrop !== null,
    setUpdateStatus(text) {
      statusText = text === null || text.trim() === "" ? null : text;
      applyStatus();
    },
  };
}
