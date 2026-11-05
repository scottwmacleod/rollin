import { afterEach, describe, expect, it, vi } from "vitest";
import type { About } from "../api/types";
import { mountAbout } from "./index";

const info: About = {
  name: "Rollin",
  app_version: "1.2.3",
  library_version: "2.0.1",
  license: "MIT",
  repository: "https://github.com/scottwmacleod/rollin",
};

function setup(about = () => Promise.resolve(info)) {
  const openUrl = vi.fn();
  const view = mountAbout({ about, openUrl });
  return { view, openUrl };
}

const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("about view", () => {
  it("shows the name, build versions, licence and repository", async () => {
    const { view } = setup();
    await view.open();
    const d = dialog()!;
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-labelledby")).toBe("about-title");
    expect(d.textContent).toContain("Rollin");
    expect(d.textContent).toContain("1.2.3");
    expect(d.textContent).toContain("2.0.1");
    expect(d.textContent).toContain("MIT");
    expect(d.querySelector("a")?.getAttribute("href")).toBe(info.repository);
  });

  it("moves focus in and closes on Escape, returning focus", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { view } = setup();
    await view.open();
    expect(document.activeElement?.textContent).toBe("Close");
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dialog()).toBeNull();
    expect(view.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps keys from reaching the app behind it", async () => {
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    const { view } = setup();
    await view.open();
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "1", metaKey: true, bubbles: true }));
    document.removeEventListener("keydown", seen);
    expect(seen).not.toHaveBeenCalled();
  });

  it("traps Tab between its controls", async () => {
    const { view } = setup();
    await view.open();
    const stops = [...dialog()!.querySelectorAll<HTMLElement>("button, a[href]")];
    stops[stops.length - 1].focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    dialog()!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops[0]);
  });

  it("opens the repository through the opener, not by navigating", async () => {
    const { view, openUrl } = setup();
    await view.open();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    dialog()!.querySelector("a")!.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(openUrl).toHaveBeenCalledWith(info.repository);
  });

  it("has an update status slot that is hidden until filled", async () => {
    const { view } = setup();
    await view.open();
    const slot = dialog()!.querySelector<HTMLElement>("[data-slot=update-status]")!;
    expect(slot.hidden).toBe(true);
    view.setUpdateStatus("Up to date");
    expect(slot.hidden).toBe(false);
    expect(slot.textContent).toBe("Up to date");
    view.close();
    await view.open(); // status survives reopening
    expect(dialog()!.querySelector("[data-slot=update-status]")!.textContent).toBe("Up to date");
  });

  it("opens once, and not at all when the data cannot be read", async () => {
    const { view } = setup();
    await Promise.all([view.open(), view.open()]);
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
    view.close();
    const failing = setup(() => Promise.reject(new Error("no")));
    await failing.view.open();
    expect(dialog()).toBeNull();
  });
});

describe("about update action", () => {
  it("is hidden until set, runs its handler, and survives reopening", async () => {
    const { view } = setup();
    await view.open();
    const button = () => dialog()!.querySelector<HTMLButtonElement>("[data-slot=update-action]")!;
    expect(button().hidden).toBe(true);
    const run = vi.fn();
    view.setUpdateAction({ label: "Check for updates", run });
    expect(button().hidden).toBe(false);
    expect(button().textContent).toBe("Check for updates");
    button().click();
    expect(run).toHaveBeenCalledOnce();
    view.close();
    await view.open();
    expect(button().textContent).toBe("Check for updates");
    view.setUpdateAction(null);
    expect(button().hidden).toBe(true);
  });
});
