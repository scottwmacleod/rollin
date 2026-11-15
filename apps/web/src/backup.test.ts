import { describe, expect, it } from "vitest";
import {
  applyBackup,
  type BackupData,
  buildBackup,
  CURRENT_VERSION,
  describePartialSummary,
  describeSummary,
  fingerprint,
  parseBackup,
  REMIND_AFTER_MS,
  reminderDue,
  SNOOZE_MS,
  summarise,
  trackState,
} from "./backup";
import { memoryStorage } from "./storage";

const sample: BackupData = {
  characters: {
    active: "Mira",
    characters: [{ name: "Mira", vars: { str: 3 }, presets: { attack: "1d20+str" } }],
  },
  globalPresets: { fireball: "8d6" },
  settings: { theme: "light" },
};

describe("parseBackup", () => {
  it("round-trips through storage, leaving the roll log out unless asked", async () => {
    const source = memoryStorage();
    await applyBackup(source, {
      format: "rollin-backup",
      version: CURRENT_VERSION,
      kind: "full",
      exportedAt: "",
      data: sample,
    });
    const withoutLog = await buildBackup(source, { rollLog: false });
    expect(withoutLog.data.rollLog).toBeUndefined();
    const parsed = parseBackup(JSON.stringify(withoutLog));
    expect(parsed.ok && parsed.backup.data).toEqual(sample);
    const target = memoryStorage();
    if (parsed.ok && parsed.backup.kind === "full") await applyBackup(target, parsed.backup);
    expect(await buildBackup(target, { rollLog: false })).toMatchObject({ data: sample });
  });

  it("carries the roll log when asked", async () => {
    const storage = memoryStorage();
    await storage.set("rollLog", [{ id: 1, input: "d6", report: {} }]);
    const backup = await buildBackup(storage, { rollLog: true });
    const parsed = parseBackup(JSON.stringify(backup));
    if (!parsed.ok || parsed.backup.kind !== "full") return expect.fail("expected a full backup");
    expect(parsed.backup.data.rollLog).toHaveLength(1);
  });

  it("walks the upgrade steps from an older version, using a made-up format", () => {
    // A pretend version 1 kept presets under `presets` and had no `data` envelope.
    const old = JSON.stringify({
      format: "rollin-backup",
      version: 1,
      characters: [{ name: "Mira", vars: { str: 3 }, presets: { attack: "1d20" } }],
      presets: { fireball: "8d6" },
    });
    const upgrades = {
      1: (file: Record<string, unknown>) => ({
        ...file,
        version: 2,
        kind: "full",
        data: { characters: { characters: file.characters }, globalPresets: file.presets },
      }),
    };
    const parsed = parseBackup(old, 2, upgrades);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.backup.kind !== "full") return expect.fail("expected a full backup");
    expect(parsed.backup.version).toBe(2);
    expect(parsed.backup.data.globalPresets).toEqual({ fireball: "8d6" });
    expect(parsed.backup.data.characters.active).toBe("Mira");
    expect(summarise(parsed.backup.data)).toMatchObject({
      variables: 1,
      presets: 1,
      rollLog: null,
    });
  });

  it("writes a version 2 full backup", async () => {
    const backup = await buildBackup(memoryStorage(), { rollLog: false });
    expect(backup).toMatchObject({ format: "rollin-backup", version: 2, kind: "full" });
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok && parsed.backup.kind).toBe("full");
  });

  it("upgrades a version 1 backup to a version 2 full backup, data unchanged", () => {
    const v1 = JSON.stringify({
      format: "rollin-backup",
      version: 1,
      exportedAt: "2026-01-02T00:00:00.000Z",
      data: { ...sample, rollLog: [{ id: 1, input: "d6", report: {} }] },
    });
    const parsed = parseBackup(v1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.backup.kind !== "full") return expect.fail("expected a full backup");
    expect(parsed.backup).toMatchObject({ version: 2, exportedAt: "2026-01-02T00:00:00.000Z" });
    expect(parsed.backup.data).toMatchObject(sample);
    expect(parsed.backup.data.rollLog).toHaveLength(1);
  });

  it("reads a partial file: characters and global presets, no active character", () => {
    const text = JSON.stringify({
      format: "rollin-backup",
      version: 2,
      kind: "partial",
      data: {
        characters: {
          active: "Mira",
          characters: [
            { name: "Mira", vars: { str: 3, bad: "x" }, presets: { attack: "1d20" } },
            { name: "Mira", vars: {}, presets: {} },
            { nope: true },
          ],
        },
        globalPresets: { fireball: "8d6", broken: 4 },
        settings: { theme: "dark" },
        rollLog: [{ id: 1, input: "d6", report: {} }],
      },
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.backup.kind !== "partial") return expect.fail("expected partial");
    expect(parsed.backup.data).toEqual({
      characters: [{ name: "Mira", vars: { str: 3 }, presets: { attack: "1d20" } }],
      globalPresets: { fireball: "8d6" },
    });
    expect(describePartialSummary(parsed.backup.data)).toBe(
      "1 character, 1 variable, 1 character preset, 1 global preset",
    );
  });

  it("reads a partial file with only global presets", () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: "rollin-backup",
        version: 2,
        kind: "partial",
        data: { globalPresets: { fireball: "8d6" } },
      }),
    );
    expect(parsed.ok && parsed.backup.kind).toBe("partial");
    expect(parsed.ok && parsed.backup.data).toEqual({ globalPresets: { fireball: "8d6" } });
  });

  it.each([
    ["no data", {}],
    ["empty sections", { characters: { characters: [] }, globalPresets: {} }],
    [
      "only invalid entries",
      { characters: { characters: [{ nope: 1 }] }, globalPresets: { a: 1 } },
    ],
  ])("refuses an empty partial file: %s", (_name, data) => {
    const parsed = parseBackup(
      JSON.stringify({ format: "rollin-backup", version: 2, kind: "partial", data }),
    );
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toContain("nothing");
  });

  it("refuses a version 2 file with no usable kind", () => {
    expect(
      parseBackup(JSON.stringify({ format: "rollin-backup", version: 2, data: sample })).ok,
    ).toBe(false);
    expect(
      parseBackup(
        JSON.stringify({ format: "rollin-backup", version: 2, kind: "half", data: sample }),
      ).ok,
    ).toBe(false);
  });

  it("refuses a full backup with no characters", () => {
    expect(
      parseBackup(JSON.stringify({ format: "rollin-backup", version: 2, kind: "full", data: {} }))
        .ok,
    ).toBe(false);
  });

  it("refuses an older version with no upgrade step", () => {
    expect(parseBackup(JSON.stringify({ format: "rollin-backup", version: 1 }), 3, {}).ok).toBe(
      false,
    );
  });

  it.each([
    ["not json", "{nope"],
    ["not a backup", JSON.stringify({ hello: 1 })],
    ["no version", JSON.stringify({ format: "rollin-backup" })],
    ["version 0", JSON.stringify({ format: "rollin-backup", version: 0 })],
  ])("refuses %s", (_name, text) => {
    expect(parseBackup(text).ok).toBe(false);
  });

  it("refuses a newer version and says so", () => {
    const parsed = parseBackup(
      JSON.stringify({ format: "rollin-backup", version: CURRENT_VERSION + 1 }),
    );
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toContain("newer");
  });

  it("describes what a backup holds", () => {
    expect(describeSummary(summarise(sample))).toBe(
      "1 character, 1 variable, 1 character preset, 1 global preset",
    );
  });
});

describe("backup reminder", () => {
  const day = 86_400_000;
  it("starts the clock on unsaved content and stops it when saved", () => {
    expect(trackState({}, sample, 1000)).toEqual({ unsavedSince: 1000 });
    expect(trackState({ unsavedSince: 1000 }, sample, 5000)).toEqual({ unsavedSince: 1000 });
    expect(trackState({ unsavedSince: 1000, exported: fingerprint(sample) }, sample, 5000)).toEqual(
      {
        exported: fingerprint(sample),
        unsavedSince: undefined,
      },
    );
  });

  it("ignores a fresh, empty roster", () => {
    const empty: BackupData = {
      characters: { active: "You", characters: [{ name: "You", vars: {}, presets: {} }] },
      globalPresets: {},
      settings: { theme: "system" },
    };
    expect(trackState({}, empty, 1000)).toEqual({});
  });

  it("waits, then nudges, and stays away after a dismissal", () => {
    const state = { unsavedSince: 0 };
    expect(reminderDue(state, REMIND_AFTER_MS - 1)).toBe(false);
    expect(reminderDue(state, REMIND_AFTER_MS)).toBe(true);
    const dismissed = { ...state, dismissedAt: 5 * day };
    expect(reminderDue(dismissed, 5 * day + SNOOZE_MS - 1)).toBe(false);
    expect(reminderDue(dismissed, 5 * day + SNOOZE_MS)).toBe(true);
    expect(reminderDue({}, 100 * day)).toBe(false);
  });
});
