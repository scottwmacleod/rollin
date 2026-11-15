import { describe, expect, it } from "vitest";
import type { Entry } from "./Result";
import { cleanLog, isEntry, loadLog, MAX_ENTRIES, nextEntryId, saveLog } from "./rollLog";
import { memoryStorage } from "./storage";

const entry = (id: number): Entry => ({
  id,
  input: "d6",
  report: { error: { message: "x" } } as Entry["report"],
});

describe("roll log persistence", () => {
  it("round-trips and starts empty", async () => {
    const storage = memoryStorage();
    expect(await loadLog(storage)).toEqual([]);
    await saveLog(storage, [entry(1), entry(2)]);
    expect((await loadLog(storage)).map((e) => e.id)).toEqual([1, 2]);
  });

  it("keeps only the newest 500", async () => {
    const storage = memoryStorage();
    await saveLog(
      storage,
      Array.from({ length: 520 }, (_, i) => entry(i + 1)),
    );
    const saved = await loadLog(storage);
    expect(saved).toHaveLength(MAX_ENTRIES);
    expect(saved[0]?.id).toBe(21);
    expect(saved.at(-1)?.id).toBe(520);
  });

  it("picks an id past the largest saved", () => {
    expect(nextEntryId([])).toBe(1);
    expect(nextEntryId([entry(4), entry(9)])).toBe(10);
  });
});

describe("roll log entry check", () => {
  const ok = { id: 2, input: "d20", report: { ok: { kind: "rolls", rolls: [] } } };

  it("accepts ok and error reports", () => {
    expect(isEntry(ok)).toBe(true);
    expect(isEntry(entry(1))).toBe(true);
  });

  it("rejects entries without a usable report, id or input", () => {
    for (const bad of [
      null,
      "d20",
      [],
      { id: 1, input: "d20" },
      { id: 1, input: "d20", report: null },
      { id: 1, input: "d20", report: {} },
      { id: 1, input: "d20", report: { ok: {} } },
      { id: 1, input: "d20", report: { error: {} } },
      { id: "1", input: "d20", report: ok.report },
      { id: 1, input: 20, report: ok.report },
    ]) {
      expect(isEntry(bad)).toBe(false);
    }
  });

  it("cleanLog keeps the valid entries and tolerates non-arrays", () => {
    expect(cleanLog([{ id: 1, input: "d20" }, ok, 7])).toEqual([ok]);
    expect(cleanLog(undefined)).toEqual([]);
  });

  it("loadLog drops a saved bad entry", async () => {
    const storage = memoryStorage();
    await storage.set("rollLog", [{ id: 1, input: "d20" }, ok, "junk"]);
    expect(await loadLog(storage)).toEqual([ok]);
  });
});
