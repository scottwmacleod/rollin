import { afterEach, describe, expect, it, vi } from "vitest";
import { mountAbout } from "../about";
import { bindAboutToUpdater } from "./about";
import { mountUpdateBanner } from "./banner";
import { createUpdater, statusText, type PendingUpdate, type UpdateState } from "./index";

function pending(version = "0.2.0", install: () => Promise<void> = () => Promise.resolve()): PendingUpdate {
  return { version, downloadAndInstall: vi.fn(install) };
}

function setup(check: () => Promise<PendingUpdate | null>, relaunch = () => Promise.resolve()) {
  const relaunchFn = vi.fn(relaunch);
  const updater = createUpdater({ check: vi.fn(check), relaunch: relaunchFn });
  return { updater, relaunch: relaunchFn };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("updater", () => {
  it("reports up to date when there is no newer release", async () => {
    const { updater } = setup(() => Promise.resolve(null));
    await updater.check();
    expect(updater.state()).toEqual({ kind: "current" });
  });

  it("reports the available version", async () => {
    const { updater } = setup(() => Promise.resolve(pending("0.2.0")));
    await updater.check();
    expect(updater.state()).toEqual({ kind: "available", version: "0.2.0" });
  });

  it("turns a failed check into state and never throws", async () => {
    const { updater } = setup(() => Promise.reject(new Error("offline")));
    await expect(updater.check()).resolves.toBeUndefined();
    expect(updater.state()).toEqual({ kind: "failed", message: "offline" });
    expect(statusText(updater.state())).toBe("Could not check for updates: offline");
  });

  it("installs, then restarts", async () => {
    const update = pending();
    const { updater, relaunch } = setup(() => Promise.resolve(update));
    await updater.check();
    await updater.install();
    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it("does not restart when the install fails, e.g. a bad signature", async () => {
    const update = pending("0.2.0", () => Promise.reject(new Error("signature mismatch")));
    const { updater, relaunch } = setup(() => Promise.resolve(update));
    await updater.check();
    await updater.install();
    expect(relaunch).not.toHaveBeenCalled();
    expect(updater.state()).toEqual({ kind: "failed", message: "signature mismatch", version: "0.2.0" });
    expect(statusText(updater.state())).toContain("This version still works");
  });

  it("lets a failed install be retried", async () => {
    let attempts = 0;
    const update = pending("0.2.0", () => (attempts++ === 0 ? Promise.reject(new Error("network")) : Promise.resolve()));
    const { updater, relaunch } = setup(() => Promise.resolve(update));
    await updater.check();
    await updater.install();
    await updater.install();
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it("says so when the app cannot restart itself", async () => {
    const { updater } = setup(
      () => Promise.resolve(pending()),
      () => Promise.reject(new Error("no")),
    );
    await updater.check();
    await updater.install();
    const state = updater.state();
    expect(state.kind).toBe("failed");
    expect(statusText(state)).toContain("Quit and reopen Rollin");
  });

  it("ignores install with nothing pending and overlapping checks", async () => {
    const { updater, relaunch } = setup(() => Promise.resolve(null));
    await updater.install();
    expect(relaunch).not.toHaveBeenCalled();
    await Promise.all([updater.check(), updater.check()]);
  });

  it("tells subscribers now and on change, until they leave", async () => {
    const { updater } = setup(() => Promise.resolve(null));
    const seen: UpdateState["kind"][] = [];
    const off = updater.subscribe((s) => seen.push(s.kind));
    await updater.check();
    off();
    await updater.check();
    expect(seen).toEqual(["idle", "checking", "current"]);
  });
});

describe("update banner", () => {
  it("offers Update and restart when an update exists, and hides on Later", async () => {
    const update = pending();
    const { updater, relaunch } = setup(() => Promise.resolve(update));
    mountUpdateBanner(updater);
    expect(document.querySelector(".update-banner")).toBeNull();
    await updater.check();
    const banner = document.querySelector(".update-banner")!;
    expect(banner.textContent).toContain("0.2.0");
    const buttons = [...banner.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Update and restart", "Later"]);
    buttons[1].click();
    expect(document.querySelector(".update-banner")).toBeNull();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("installs and restarts from the button", async () => {
    const { updater, relaunch } = setup(() => Promise.resolve(pending()));
    mountUpdateBanner(updater);
    await updater.check();
    document.querySelector<HTMLButtonElement>(".update-banner-go")!.click();
    await vi.waitFor(() => expect(relaunch).toHaveBeenCalledOnce());
  });

  it("stays out of the way when up to date or offline", async () => {
    const { updater } = setup(() => Promise.reject(new Error("offline")));
    mountUpdateBanner(updater);
    await updater.check();
    expect(document.querySelector(".update-banner")).toBeNull();
  });
});

describe("about dialog binding", () => {
  const about = () =>
    Promise.resolve({
      name: "Rollin",
      app_version: "0.1.0",
      library_version: "2.0.1",
      license: "MIT",
      repository: "https://github.com/scottwmacleod/rollin",
    });
  const slot = (name: string) => document.querySelector<HTMLElement>(`[data-slot=${name}]`)!;

  it("checks on demand and shows the result", async () => {
    const { updater } = setup(() => Promise.resolve(null));
    const view = mountAbout({ about, openUrl: vi.fn() });
    bindAboutToUpdater(view, updater);
    await view.open();
    expect(slot("update-action").textContent).toBe("Check for updates");
    slot("update-action").click();
    await vi.waitFor(() => expect(slot("update-status").textContent).toBe("Up to date"));
  });

  it("offers Update and restart for an available update", async () => {
    const { updater, relaunch } = setup(() => Promise.resolve(pending("0.2.0")));
    const view = mountAbout({ about, openUrl: vi.fn() });
    bindAboutToUpdater(view, updater);
    await updater.check();
    await view.open();
    expect(slot("update-status").textContent).toBe("Version 0.2.0 is available");
    expect(slot("update-action").textContent).toBe("Update and restart");
    slot("update-action").click();
    await vi.waitFor(() => expect(relaunch).toHaveBeenCalledOnce());
  });

  it("hides the button while busy and shows a failure with a retry", async () => {
    const update = pending("0.2.0", () => Promise.reject(new Error("bad signature")));
    const { updater } = setup(() => Promise.resolve(update));
    const view = mountAbout({ about, openUrl: vi.fn() });
    bindAboutToUpdater(view, updater);
    await view.open();
    const checking = updater.check();
    expect(slot("update-action").hidden).toBe(true);
    await checking;
    await updater.install();
    expect(slot("update-status").textContent).toContain("bad signature");
    expect(slot("update-action").textContent).toBe("Try again");
  });
});
