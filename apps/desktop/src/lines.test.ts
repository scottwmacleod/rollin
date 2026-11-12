import { afterEach, describe, expect, it, vi } from "vitest";
import type { Execution, SessionState } from "./api/generated";
import { mountChrome } from "./chrome";
import { mountPalette } from "./chrome/palette";
import { createLines } from "./lines";
import { mountSidebar } from "./sidebar";
import { createStore } from "./store";

/** A Session whose saved data a line can change, and that counts its reads. */
function fakeSession() {
  const st: SessionState = {
    active_character: "aria",
    characters: ["aria"],
    vars: [["str", 3]],
    presets: [],
    global_presets: [],
    system: null,
    default_system: null,
    effective_system: null,
    systems: [],
    seed: null,
    history: [],
  };
  const reads = vi.fn(async () => structuredClone(st));
  const execute = vi.fn(async (line: string): Promise<Execution> => {
    const set = /^set (\w+) (\d+)$/.exec(line);
    if (set) st.vars = [[set[1], Number(set[2])]];
    return { status: "empty" };
  });
  return { st, reads, execute };
}

describe("lines", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads the state once per line and shows the result in the sidebar, the top bar and the palette", async () => {
    const session = fakeSession();
    const store = createStore(session.reads);
    const lines = createLines({ execute: session.execute, store });
    document.body.innerHTML = `<div id="app"><header class="toolbar"></header><aside class="sidebar"></aside><footer class="status-bar"></footer></div>`;
    const sidebar = mountSidebar(document.querySelector(".sidebar")!, { edit: vi.fn(), store, run: (l) => void lines.run(l) });
    const chrome = mountChrome(document.querySelector(".toolbar")!, document.querySelector(".status-bar")!, {
      edit: vi.fn(),
      store,
      setSystem: vi.fn(),
      check: vi.fn(),
      sample: vi.fn(),
      about: async () => ({ name: "Rollin", app_version: "1", library_version: "1", license: "MIT", repository: "" }),
      run: (l) => void lines.run(l),
      toggleSidebar: sidebar.toggle,
    });
    lines.onRecord((_line, execution) => chrome.note(execution));
    const palette = mountPalette({ store, perform: vi.fn(), edit: vi.fn() });
    await store.refresh();
    palette.open("@");
    session.reads.mockClear();

    await lines.run("set str 18");

    expect(session.reads).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".sidebar")!.textContent).toContain("str");
    expect(document.querySelector(".sidebar")!.textContent).toContain("18");
    expect(document.querySelector(".status-bar")!.textContent).toContain("1 var");
    palette.close();
    chrome.dispose();
  });

  it("records a line the formula box already ran with one read, and tells the log first", async () => {
    const session = fakeSession();
    const store = createStore(session.reads);
    const lines = createLines({ execute: session.execute, store });
    const order: string[] = [];
    lines.onRecord((line) => order.push(`heard ${line}`));
    store.subscribe(() => order.push("refreshed"));

    await lines.record("d20", { status: "empty" });

    expect(session.execute).not.toHaveBeenCalled();
    expect(session.reads).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["heard d20", "refreshed"]);
  });

  it("records a line the Session could not run as a rejection", async () => {
    const session = fakeSession();
    session.execute.mockRejectedValueOnce({ message: "the Session is gone" });
    const store = createStore(session.reads);
    const lines = createLines({ execute: session.execute, store });
    const heard = vi.fn();
    lines.onRecord(heard);

    await lines.run("d20");

    expect(heard).toHaveBeenCalledWith("d20", { status: "rejected", message: "the Session is gone" });
    expect(session.reads).toHaveBeenCalledTimes(1);
  });
});
