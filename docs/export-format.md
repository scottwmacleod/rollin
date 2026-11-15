# Export file format

The web app's **Export** produces one JSON file, and **Import** reads it back. This page describes version 1, so a person, or an AI, can write one by hand (for example to bring over data from the old command-line or desktop app, see the README). The code is `apps/web/src/backup.ts`.

## Shape

```json
{
  "format": "rollin-backup",
  "version": 1,
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
| `format` | Always `"rollin-backup"`. A file without it is refused. |
| `version` | A whole number, 1 or more. A file newer than the app is refused; an older one is upgraded on import. |
| `exportedAt` | An ISO timestamp. Optional in practice. |
| `data.characters.active` | The name of the active character. Falls back to the first character if it names none. |
| `data.characters.characters` | Every character. At least one is needed; a `default` character is conventional. Duplicate names are dropped. |
| `characters[].name` | The character's name. |
| `characters[].vars` | Variable name to whole number. Use lowercase names matching `[a-z][a-z0-9_]*`, as the app does. |
| `characters[].presets` | Preset name to formula. Use lowercase names matching `[a-z][a-z0-9_-]*`, as the app does. |
| `characters[].system` | Optional. `"dnd5e"` is the only game system. |
| `characters[].critRange` | Optional. 2 to 20; the lowest kept d20 that is a critical hit. Left out for the default, 20. |
| `data.globalPresets` | Preset name to formula, available to every character. |
| `data.settings.theme` | `"system"`, `"light"` or `"dark"`. |
| `data.rollLog` | Optional. Leave it out to keep the roll log already in the browser; an empty list clears it. |

Anything invalid is cleaned on import (a variable that isn't a whole number, a preset whose formula isn't text, an unknown `system` or `theme`) rather than failing the whole file, except a missing `format`, `version` or `data.characters`, which are refused with a message.

Import replaces the characters, global presets and settings already saved in the browser. The app shows a summary and asks first.
