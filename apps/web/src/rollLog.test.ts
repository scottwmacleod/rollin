import { describe, expect, it } from "vitest";
import type { Entry } from "./Result";
import { loadLog, MAX_ENTRIES, nextEntryId, saveLog } from "./rollLog";
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
