import { describe, expect, it, vi } from "vitest";
import type { SessionState } from "./api/generated";
import { createStore } from "./store";

const state = (name: string): SessionState => ({
  active_character: name,
  characters: [name],
  vars: [],
  presets: [],
  global_presets: [],
  system: null,
  default_system: null,
  effective_system: null,
  systems: [],
  seed: null,
  history: [],
});

describe("store", () => {
  it("holds nothing until the first read, then the state, and tells every subscriber once per read", async () => {
    const read = vi.fn(async () => state("aria"));
    const store = createStore(read);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    expect(store.state).toBeNull();
    await store.refresh();
    expect(read).toHaveBeenCalledTimes(1);
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
    expect(store.state?.active_character).toBe("aria");
  });

  it("drops the state and keeps the library's message when a read fails", async () => {
    const reads = [Promise.resolve(state("aria")), Promise.reject({ error: { message: "config is unreadable" } })];
    const store = createStore(() => reads.shift()!);
    await store.refresh();
    await store.refresh();
    expect(store.state).toBeNull();
    expect(store.error).toBe("config is unreadable");
  });

  it("lets a newer read win over an older one that finishes later", async () => {
    let finish: (s: SessionState) => void = () => undefined;
    const slow = new Promise<SessionState>((resolve) => (finish = resolve));
    const reads = [slow, Promise.resolve(state("mira"))];
    const store = createStore(() => reads.shift()!);
    const heard = vi.fn();
    store.subscribe(heard);
    const first = store.refresh();
    await store.refresh();
    finish(state("stale"));
    await first;
    expect(store.state?.active_character).toBe("mira");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("stops telling a subscriber that unsubscribed", async () => {
    const store = createStore(async () => state("aria"));
    const heard = vi.fn();
    store.subscribe(heard)();
    await store.refresh();
    expect(heard).not.toHaveBeenCalled();
  });
});
