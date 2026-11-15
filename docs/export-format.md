# Export file format

The web app's **Export** produces one JSON file, and **Import** reads it back. This page describes version 2, so a person, or an AI, can write one by hand. The code is `apps/web/src/backup.ts`. Terms are in `GLOSSARY.md`.

Every file has the same envelope:

| Field | Meaning |
| --- | --- |
| `format` | Always `"rollin-backup"`. A file without it is refused. |
| `version` | A whole number, 1 or more. A file newer than the app is refused. An older one is upgraded on import. |
| `kind` | `"full"` or `"partial"`. Required from version 2. |
| `exportedAt` | An ISO timestamp. Optional in practice. |
| `data` | What the file holds. Its shape depends on `kind`. |

## Full backup

A **backup** with `"kind": "full"` holds everything. It is what Export writes, and the only kind that **Replace** accepts.

```json
{
  "format": "rollin-backup",
  "version": 2,
  "kind": "full",
  "exportedAt": "2026-11-15T08:00:00.000Z",
  "data": {
    "characters": {
      "active": "grog",
      "characters": [
        {
          "name": "default",
          "vars": {},
          "presets": {}
        },
        {
          "name": "grog",
          "vars": { "str": 5, "dex": 2 },
          "presets": { "atk": "d20+@str", "sneak": "d20+5, 2d6" },
          "system": "dnd5e",
          "critRange": 19
        }
      ]
    },
    "globalPresets": { "house": "d6" },
    "settings": { "theme": "system" },
    "rollLog": []
  }
}
```

| Field | Meaning |
| --- | --- |
| `data.characters.active` | The name of the active character. Falls back to the first character if it names none. |
| `data.characters.characters` | Every character. At least one is needed; a `default` character is conventional. Duplicate names are dropped. |
| `data.globalPresets` | Preset name to formula, available to every character. |
| `data.settings.theme` | `"system"`, `"light"` or `"dark"`. |
| `data.rollLog` | Optional. Leave it out to keep the roll log already in the browser. An empty list clears it. |

Each character has these fields:

| Field | Meaning |
| --- | --- |
| `name` | The character's name. |
| `vars` | Variable name to whole number. Use lowercase names matching `[a-z][a-z0-9_]*`, as the app does. |
| `presets` | Preset name to formula. Use lowercase names matching `[a-z][a-z0-9_-]*`, as the app does. |
| `system` | Optional. `"dnd5e"` is the only game system. |
| `critRange` | Optional. 2 to 20; the lowest kept d20 that is a critical hit. Left out for the default, 20. |

Replace swaps out the characters, global presets and settings already saved in the browser. The app shows a summary and asks first.

## Partial file

A **partial file** has `"kind": "partial"`. It holds only some characters and global presets, so it can be shared or kept on its own. Every section is optional, but the file must hold at least one character or one global preset, otherwise it is refused as empty.

```json
{
  "format": "rollin-backup",
  "version": 2,
  "kind": "partial",
  "exportedAt": "2026-11-15T08:00:00.000Z",
  "data": {
    "characters": {
      "characters": [
        {
          "name": "borin",
          "vars": { "str": 4 },
          "presets": { "smite": "2d8" }
        }
      ]
    },
    "globalPresets": { "house": "d6" }
  }
}
```

- `data.characters.characters` and `data.globalPresets` follow the same rules as in a full backup.
- A partial file has no active character. Any `active` in it is ignored.
- `data.settings` and `data.rollLog` only mean something in a full backup. They are ignored in a partial file.
- The app can read a partial file and show what it holds, but it can't replace your data with one. Replace needs a full backup.

## Older versions

Version 1 files have no `kind`. They were always full backups, and the shape of `data` is the same as in version 2. Import upgrades them to version 2 full backups with the data unchanged. A version 1 file still works with Replace.

## Cleaning and refusals

Anything invalid inside the data is cleaned on import, not fatal: a variable that isn't a whole number, a preset whose formula isn't text, a character with no name, an unknown `system` or `theme`.

These are refused with a message:

- a missing or wrong `format`, or a missing or unusable `version`;
- a `version` newer than the app reads;
- a `kind` that isn't `"full"` or `"partial"` (version 2 and up);
- a full backup with no `data.characters`;
- a partial file with no characters and no global presets.
