// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mountSidebarToggle } from "./toggle";

function setup(narrow: boolean) {
  window.matchMedia = (() => ({ matches: narrow, addEventListener() {} })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = `<div id="app"><header class="toolbar"></header><aside class="sidebar"></aside></div>`;
  const app = document.getElementById("app")!;
  const cls = narrow ? "sidebar-open" : "sidebar-collapsed";
  mountSidebarToggle(app, app.querySelector(".toolbar")!, app.querySelector(".sidebar")!, () =>
    app.classList.toggle(cls),
  );
  return { app, button: app.querySelector<HTMLButtonElement>(".sb-toggle")! };
}

describe("sidebar toggle button", () => {
  it("opens the slide-over when narrow and Escape closes it", () => {
    const { app, button } = setup(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.click();
    expect(app.classList.contains("sidebar-open")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(app.classList.contains("sidebar-open")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on a click outside the sidebar", () => {
    const { app, button } = setup(true);
    button.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(app.classList.contains("sidebar-open")).toBe(false);
  });

  it("collapses the column when wide", () => {
    const { app, button } = setup(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    button.click();
    expect(app.classList.contains("sidebar-collapsed")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
