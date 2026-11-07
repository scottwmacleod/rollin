// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mountSlideOverDismiss } from "./dismiss";

function setup() {
  window.matchMedia = (() => ({ matches: true, addEventListener() {} })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = `<div id="app" class="sidebar-open"><aside class="sidebar"></aside></div>`;
  const app = document.getElementById("app")!;
  mountSlideOverDismiss(app, app.querySelector(".sidebar")!);
  return app;
}

describe("slide-over dismiss", () => {
  it("closes on Escape", () => {
    const app = setup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(app.classList.contains("sidebar-open")).toBe(false);
  });

  it("closes on a click outside the sidebar, not inside it", () => {
    const app = setup();
    app.querySelector(".sidebar")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(app.classList.contains("sidebar-open")).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(app.classList.contains("sidebar-open")).toBe(false);
  });
});
