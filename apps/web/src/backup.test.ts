import { describe, expect, it } from "vitest";
import {
  addToSaved,
  answerClash,
  applyAdd,
  applyBackup,
  type BackupData,
  buildBackup,
  buildPartial,
  type Choices,
  CURRENT_VERSION,
  characterFilename,
  describeAdd,
  describePartialSummary,
  describeSkipped,
  describeSummary,
  fingerprint,
  firstUndecided,
  incomingOf,
  listClashes,
  parseBackup,
  REMIND_AFTER_MS,
  reminderDue,
  type Saved,
  SNOOZE_MS,
  summarise,
  trackState,
} from "./backup";
import { memoryStorage } from "./storage";

const sample: BackupData = {
  characters: {
    active: "mira",
    characters: [{ name: "mira", vars: { str: 3 }, presets: { attack: "1d20+str" } }],
  },
  globalPresets: { fireball: "8d6" },
  settings: { keypad: "auto" },
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

  it("drops roll log entries with no report on import", () => {
    const good = { id: 2, input: "d6", report: { error: { message: "x" } } };
    const parsed = parseBackup(
      JSON.stringify({
        format: "rollin-backup",
        version: CURRENT_VERSION,
        kind: "full",
        exportedAt: "",
        data: { ...sample, rollLog: [{ id: 1, input: "d20" }, good] },
      }),
    );
    if (!parsed.ok || parsed.backup.kind !== "full") return expect.fail("expected a full backup");
    expect(parsed.backup.data.rollLog).toEqual([good]);
  });

  it("carries the roll log when asked", async () => {
    const storage = memoryStorage();
    await storage.set("rollLog", [{ id: 1, input: "d6", report: { error: { message: "x" } } }]);
    const backup = await buildBackup(storage, { rollLog: true });
    const parsed = parseBackup(JSON.stringify(backup));
    if (!parsed.ok || parsed.backup.kind !== "full") return expect.fail("expected a full backup");
    expect(parsed.backup.data.rollLog).toHaveLength(1);
  });

  it("walks the upgrade steps from an older version, using a made-up format", () => {
    const old = JSON.stringify({
      format: "rollin-backup",
      version: 1,
      characters: [{ name: "mira", vars: { str: 3 }, presets: { attack: "1d20" } }],
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
    expect(parsed.backup.data.characters.active).toBe("mira");
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
      data: { ...sample, rollLog: [{ id: 1, input: "d6", report: { error: { message: "x" } } }] },
    });
    const parsed = parseBackup(v1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.backup.kind !== "full") return expect.fail("expected a full backup");
    expect(parsed.backup).toMatchObject({ version: 2, exportedAt: "2026-01-02T00:00:00.000Z" });
    expect(parsed.backup.data).toMatchObject(sample);
    expect(parsed.backup.data.rollLog).toHaveLength(1);
  });

  it("imports a version 1 backup with no keypad setting as Auto, dropping its theme", () => {
    const v1 = JSON.stringify({
      format: "rollin-backup",
      version: 1,
      exportedAt: "2026-01-02T00:00:00.000Z",
      data: { ...sample, settings: { theme: "dark" } },
    });
    const parsed = parseBackup(v1);
    if (!parsed.ok || parsed.backup.kind !== "full") return expect.fail("expected a full backup");
    expect(parsed.backup.data.settings).toEqual({ keypad: "auto" });
  });

  it("reads a partial file: characters and global presets, no active character", () => {
    const text = JSON.stringify({
      format: "rollin-backup",
      version: 2,
      kind: "partial",
      data: {
        characters: {
          active: "mira",
          characters: [
            { name: "mira", vars: { str: 3, bad: "x" }, presets: { attack: "1d20" } },
            { name: "mira", vars: {}, presets: {} },
            { nope: true },
          ],
        },
        globalPresets: { fireball: "8d6", broken: 4 },
        settings: { theme: "dark" },
        rollLog: [{ id: 1, input: "d6", report: { error: { message: "x" } } }],
      },
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.backup.kind !== "partial") return expect.fail("expected partial");
    expect(parsed.backup.data).toEqual({
      characters: [{ name: "mira", vars: { str: 3 }, presets: { attack: "1d20" } }],
      globalPresets: { fireball: "8d6" },
    });
    expect(describePartialSummary(parsed.backup.data)).toBe(
      "1 character, 1 variable, 1 character preset, 1 global preset",
    );
  });

  it("writes a partial file that parses back unchanged", () => {
    const data = {
      characters: [{ name: "mira", vars: { str: 3 }, presets: { attack: "1d20" } }],
      globalPresets: { fireball: "8d6" },
    };
    const file = buildPartial(data, new Date("2026-11-15T08:00:00.000Z"));
    expect(file).toMatchObject({
      version: 2,
      kind: "partial",
      exportedAt: "2026-11-15T08:00:00.000Z",
    });
    expect(file.data.characters).toEqual({ characters: data.characters });
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok && parsed.backup.kind).toBe("partial");
    expect(parsed.ok && parsed.backup.data).toEqual(data);
    expect(() => buildPartial({})).toThrow();
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

  it("lowercases names and drops ones the app can't create, counting them", () => {
    const file = {
      format: "rollin-backup",
      version: 2,
      kind: "full",
      data: {
        characters: {
          active: "Grog",
          characters: [
            {
              name: "Grog",
              vars: { STR: 3, "bad name": 1 },
              presets: { Smash: "1d8", "my preset": "1d4" },
            },
            { name: "grog", vars: {}, presets: {} },
            { name: "my char", vars: {}, presets: {} },
            { name: "Zed", vars: {}, presets: {} },
          ],
        },
        globalPresets: { Fireball: "8d6", "bad one": "1d4", fireball: "9d6" },
      },
    };
    const parsed = parseBackup(JSON.stringify(file));
    if (!parsed.ok || parsed.backup.kind !== "full") throw new Error("expected a full backup");
    const { data, skipped } = parsed.backup;
    expect(data.characters.characters.map((c) => c.name)).toEqual(["grog", "zed"]);
    expect(data.characters.active).toBe("grog");
    expect(data.characters.characters[0]).toMatchObject({
      vars: { str: 3 },
      presets: { smash: "1d8" },
    });
    expect(data.globalPresets).toEqual({ fireball: "8d6" });
    expect(skipped).toBe(4);
    expect(describeSkipped(4)).toBe(" 4 names rollin can't use were skipped.");
    expect(describeSkipped(0)).toBe("");
  });

  it("falls back to the default character when every name is dropped", () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: "rollin-backup",
        version: 2,
        kind: "full",
        data: {
          characters: { active: "x y", characters: [{ name: "x y", vars: {}, presets: {} }] },
        },
      }),
    );
    if (!parsed.ok || parsed.backup.kind !== "full") throw new Error("expected a full backup");
    expect(parsed.backup.data.characters.characters).toHaveLength(1);
    expect(parsed.backup.skipped).toBe(1);
  });

  it("loads saved capitalised names in lowercase so Add finds no clash-free duplicate", async () => {
    const storage = memoryStorage();
    await storage.set("characters", {
      active: "Grog",
      characters: [{ name: "Grog", vars: {}, presets: {} }],
    });
    const saved = await buildBackup(storage, { rollLog: false });
    expect(saved.data.characters.characters.map((c) => c.name)).toEqual(["grog"]);
    expect(saved.data.characters.active).toBe("grog");
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
      settings: { keypad: "auto" },
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

describe("Add", () => {
  const ch = (name: string, vars: Record<string, number> = {}, presets = {}) => ({
    name,
    vars,
    presets,
  });
  const saved: Saved = {
    roster: {
      active: "grog",
      characters: [ch("grog", { str: 5, dex: 2 }, { atk: "d20" }), ch("mira")],
    },
    globalPresets: { house: "d6", fire: "8d6" },
  };
  const none: Choices = { characters: {}, presets: {} };
  const all = (character: Choices["characters"][string], preset = character): Choices => ({
    characters: { grog: character },
    presets: { house: preset },
  });
  const incoming = {
    characters: [ch("grog", { str: 9 }), ch("borin", { str: 4 })],
    globalPresets: { house: "d8", smite: "2d8" },
  };

  it("takes the characters and global presets from a full or a partial file", () => {
    const full = parseBackup(
      JSON.stringify({
        format: "rollin-backup",
        version: 2,
        kind: "full",
        data: { characters: { characters: [ch("a")] }, globalPresets: { x: "d4" } },
      }),
    );
    const partial = parseBackup(
      JSON.stringify({
        format: "rollin-backup",
        version: 2,
        kind: "partial",
        data: { globalPresets: { x: "d4" } },
      }),
    );
    if (!full.ok || !partial.ok) return expect.fail("expected both to parse");
    expect(incomingOf(full.backup)).toEqual({
      characters: [ch("a")],
      globalPresets: { x: "d4" },
      skipped: 0,
    });
    expect(incomingOf(partial.backup)).toEqual({
      characters: [],
      globalPresets: { x: "d4" },
      skipped: 0,
    });
  });

  it("lists a clash only for the same name with different content", () => {
    expect(listClashes(saved, incoming)).toEqual([
      { kind: "character", name: "grog" },
      { kind: "preset", name: "house" },
    ]);
  });

  it("does not list identical items, whatever the order of their maps", () => {
    const same = {
      characters: [ch("grog", { dex: 2, str: 5 }, { atk: "d20" })],
      globalPresets: { fire: "8d6" },
    };
    expect(listClashes(saved, same)).toEqual([]);
    const result = addToSaved(saved, same, none);
    expect(result.roster).toEqual(saved.roster);
    expect(result.globalPresets).toEqual(saved.globalPresets);
    expect(describeAdd(result.counts)).toBe(
      "Nothing to add. You already have everything in that file.",
    );
  });

  it("notices a different game system or crit range", () => {
    const other = { characters: [{ ...ch("mira"), system: "dnd5e" as const }], globalPresets: {} };
    expect(listClashes(saved, other)).toEqual([{ kind: "character", name: "mira" }]);
  });

  it("adds new names, leaves the active character alone, and keeps yours by default", () => {
    const { roster, globalPresets, counts } = addToSaved(saved, incoming, none);
    expect(roster.active).toBe("grog");
    expect(roster.characters.map((c) => c.name)).toEqual(["grog", "mira", "borin"]);
    expect(roster.characters[0]).toEqual(saved.roster.characters[0]);
    expect(globalPresets).toEqual({ house: "d6", fire: "8d6", smite: "2d8" });
    expect(describeAdd(counts)).toBe("Added 1 character and 1 global preset; kept 2 of yours.");
  });

  it("keep mine changes nothing for the clash", () => {
    const { roster, globalPresets } = addToSaved(saved, incoming, all("keep-mine"));
    expect(roster.characters[0]).toEqual(saved.roster.characters[0]);
    expect(globalPresets.house).toBe("d6");
  });

  it("take the file's replaces in place, whole, without mixing variables", () => {
    const { roster, globalPresets, counts } = addToSaved(saved, incoming, all("take-theirs"));
    expect(roster.characters[0]).toEqual(ch("grog", { str: 9 }));
    expect(roster.active).toBe("grog");
    expect(globalPresets.house).toBe("d8");
    expect(describeAdd(counts)).toBe(
      "Added 1 character and 1 global preset; replaced 1 character and 1 global preset with the file's.",
    );
  });

  it("keep both adds the file's copy under the first free name", () => {
    const { roster, globalPresets, counts } = addToSaved(saved, incoming, all("keep-both"));
    expect(roster.characters[0]).toEqual(saved.roster.characters[0]);
    expect(roster.characters.find((c) => c.name === "grog-2")).toEqual(ch("grog-2", { str: 9 }));
    expect(globalPresets).toMatchObject({ house: "d6", "house-2": "d8" });
    expect(describeAdd(counts)).toBe(
      "Added 2 characters and 2 global presets (2 under a new name).",
    );
  });

  it("keep both skips taken names, including ones in the file", () => {
    const crowded: Saved = {
      roster: { active: "grog", characters: [ch("grog"), ch("grog-2"), ch("grog-3")] },
      globalPresets: { house: "d6", "house-2": "d4" },
    };
    const file = {
      characters: [ch("grog", { str: 1 }), ch("grog-4")],
      globalPresets: { house: "d8" },
    };
    const { roster, globalPresets } = addToSaved(crowded, file, all("keep-both"));
    expect(roster.characters.map((c) => c.name)).toEqual([
      "grog",
      "grog-2",
      "grog-3",
      "grog-5",
      "grog-4",
    ]);
    expect(globalPresets["house-3"]).toBe("d8");
  });

  it("keep both finds a valid name when name-N would not pass the rules", () => {
    const odd: Saved = {
      roster: { active: "a", characters: [ch("a"), ch("Sir Bors")] },
      globalPresets: {},
    };
    const file = { characters: [ch("Sir Bors", { str: 1 })], globalPresets: {} };
    const { roster } = addToSaved(odd, file, {
      characters: { "Sir Bors": "keep-both" },
      presets: {},
    });
    expect(roster.characters.map((c) => c.name)).toEqual(["a", "Sir Bors", "sir-bors-2"]);
    const long = "a".repeat(200);
    const big = addToSaved(
      { roster: { active: long, characters: [ch(long)] }, globalPresets: {} },
      { characters: [ch(long, { str: 1 })], globalPresets: {} },
      { characters: { [long]: "keep-both" }, presets: {} },
    );
    const added = big.roster.characters[1]?.name ?? "";
    expect(added).toMatch(/-2$/);
    expect(added).toBe(`${long}-2`);
  });

  it("treats characters and global presets separately", () => {
    const { roster, globalPresets } = addToSaved(saved, incoming, {
      characters: { grog: "take-theirs" },
      presets: { house: "keep-mine" },
    });
    expect(roster.characters[0]?.vars).toEqual({ str: 9 });
    expect(globalPresets.house).toBe("d6");
  });

  it("same for all leaves earlier answers alone", () => {
    const clashes = [
      { kind: "character" as const, name: "a" },
      { kind: "character" as const, name: "b" },
      { kind: "character" as const, name: "c" },
      { kind: "preset" as const, name: "p" },
    ];
    let choices = answerClash(clashes, none, clashes[0] as never, "keep-mine", false);
    choices = answerClash(clashes, choices, clashes[1] as never, "take-theirs", true);
    expect(choices).toEqual({
      characters: { a: "keep-mine", b: "take-theirs", c: "take-theirs" },
      presets: {},
    });
    expect(firstUndecided(clashes, choices)).toBe(3);
  });

  it("a clash named like an object property still counts as undecided", () => {
    const clashes = [
      { kind: "character" as const, name: "constructor" },
      { kind: "preset" as const, name: "valueof" },
    ];
    expect(firstUndecided(clashes, none)).toBe(0);
    const choices = answerClash(clashes, none, clashes[0] as never, "keep-both", false);
    expect(firstUndecided(clashes, choices)).toBe(1);
    const file = { characters: [ch("constructor", { str: 1 })], globalPresets: {} };
    const base: Saved = {
      roster: { active: "constructor", characters: [ch("constructor")] },
      globalPresets: {},
    };
    expect(addToSaved(base, file, none).counts.charactersKept).toBe(1);
    expect(addToSaved(base, file, choices).roster.characters.map((c) => c.name)).toEqual([
      "constructor",
      "constructor-2",
    ]);
  });

  it("uses the lowercase form of names, so Grog is grog, and skips names rollin can't use", () => {
    const file = parseBackup(
      JSON.stringify({
        format: "rollin-backup",
        version: 2,
        kind: "partial",
        data: {
          characters: {
            characters: [
              { name: "Grog", vars: { str: 1 }, presets: {} },
              { name: "grog", vars: { str: 2 }, presets: {} },
              { name: "my char", vars: {}, presets: {} },
              { name: "Borin", vars: {}, presets: {} },
            ],
          },
          globalPresets: { House: "d8", "bad name": "d4", fire: "8d6" },
        },
      }),
    );
    if (!file.ok) return expect.fail("expected it to parse");
    const incoming = incomingOf(file.backup);
    expect(incoming.characters.map((c) => c.name)).toEqual(["grog", "borin"]);
    expect(incoming.characters[0]?.vars).toEqual({ str: 1 });
    expect(Object.keys(incoming.globalPresets)).toEqual(["house", "fire"]);
    expect(listClashes(saved, incoming)).toEqual([
      { kind: "character", name: "grog" },
      { kind: "preset", name: "house" },
    ]);
    const { roster, counts } = addToSaved(saved, incoming, none);
    expect(roster.characters.map((c) => c.name)).toEqual(["grog", "mira", "borin"]);
    expect(describeAdd(counts)).toBe(
      "Added 1 character; kept 2 of yours; skipped 2 with names rollin can't use.",
    );
  });

  it("applyAdd writes characters and presets, reading what is saved first", async () => {
    const storage = memoryStorage();
    await storage.set("characters", saved.roster);
    await storage.set("globalPresets", saved.globalPresets);
    await storage.set("settings", { theme: "dark" });
    const result = await applyAdd(storage, incoming, all("take-theirs"));
    expect(await storage.get("characters")).toEqual(result.roster);
    expect(await storage.get("globalPresets")).toEqual(result.globalPresets);
    expect(await storage.get("settings")).toEqual({ theme: "dark" });
    expect(await storage.get("rollLog")).toBeUndefined();
  });

  it("applyAdd leaves the roster alone when writing the presets fails", async () => {
    const storage = memoryStorage();
    await storage.set("characters", saved.roster);
    const failing = {
      ...storage,
      set: async (key: string, value: unknown) => {
        if (key === "globalPresets") throw new Error("full");
        return storage.set(key, value);
      },
    };
    await expect(applyAdd(failing as never, incoming, none)).rejects.toThrow();
    expect(await storage.get("characters")).toEqual(saved.roster);
  });

  it("applyAdd writes nothing when nothing changes", async () => {
    const storage = memoryStorage();
    await applyAdd(storage, { characters: [], globalPresets: {} }, none);
    expect(await storage.get("characters")).toBeUndefined();
  });
});

describe("single-character export", () => {
  const grog = {
    name: "grog",
    vars: { str: 5, dex: 2 },
    presets: { atk: "d20+@str", sneak: "d20+5, 2d6" },
    system: "dnd5e" as const,
    critRange: 19,
  };

  it("writes a partial file holding just that character, with no global presets or active character", () => {
    const file = buildPartial({ characters: [grog] }, new Date("2026-11-15T08:00:00.000Z"));
    expect(file.kind).toBe("partial");
    expect(file.data).toEqual({ characters: { characters: [grog] } });
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok && parsed.backup.kind).toBe("partial");
    expect(parsed.ok && parsed.backup.data).toEqual({ characters: [grog] });
  });

  it("adds into another roster unchanged", () => {
    const parsed = parseBackup(JSON.stringify(buildPartial({ characters: [grog] })));
    if (!parsed.ok) throw new Error(parsed.error);
    const saved: Saved = {
      roster: {
        active: "default",
        characters: [{ name: "default", vars: {}, presets: {} }],
      },
      globalPresets: { fireball: "8d6" },
    };
    const result = addToSaved(saved, incomingOf(parsed.backup), {
      characters: {},
      presets: {},
    });
    expect(result.roster.characters.find((c) => c.name === "grog")).toEqual(grog);
    expect(result.roster.active).toBe("default");
    expect(result.globalPresets).toEqual({ fireball: "8d6" });
    expect(describeAdd(result.counts)).toBe("Added 1 character.");
  });

  it("names the file after the character and the date, safe for file systems", () => {
    const now = new Date("2026-11-15T08:00:00.000Z");
    expect(characterFilename("grog", now)).toBe("rollin-character-grog-2026-11-15.json");
    expect(characterFilename("Grog the/Brave: 2?", now)).toBe(
      "rollin-character-grog-the-brave-2-2026-11-15.json",
    );
    expect(characterFilename("backup", now)).toBe("rollin-character-backup-2026-11-15.json");
    expect(characterFilename("///", now)).toBe("rollin-character-unnamed-2026-11-15.json");
  });
});
