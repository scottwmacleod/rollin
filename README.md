# rollin

A dice roller for tabletop RPGs, at [rollin.scottmacleod.co](https://rollin.scottmacleod.co). Type a dice formula, see how each die contributed to the result, and keep characters, variables and presets in your browser. It installs to a phone or desktop home screen and works offline.

Everything runs in your browser. There is no account and no server holding your data; the only thing that leaves your device is Vercel's cookieless page counts.

## Using it

```
4d6dl1               roll four d6, drop the lowest
d20+8, d10+5         one line per roll
6x 4d6dl1            repeat: six numbered stat rolls
d20+8 # attack       a label
d20+@str             a variable from the active character
```

Dropped dice do not count toward the total. Formulas are case-insensitive. The full syntax, with exploding dice, rerolls, success counts, advantage, presets, characters and the D&D 5e crit rules, is in [docs/formulas.md](docs/formulas.md).

Press ⌘K (Ctrl+K on Windows and Linux) for the command palette.

## Your data and backups

Characters, variables, presets, settings and the roll log live in your browser's storage. Clearing site data erases them, so use **Export** to save a backup file, and **Import** to restore it on another device or browser. The file format is documented in [docs/export-format.md](docs/export-format.md); old backups keep importing into newer versions.

### Bringing over data from the old command-line or desktop app

rollin used to be a Rust command-line tool and a desktop app that kept data as TOML files under `~/.config/rollin`. Both are gone, and the web app has no TOML importer. To bring your data across, give an AI assistant your files and this prompt:

> I have rollin data as TOML files: `presets.toml` (global presets, a `[presets]` table), `state.toml` (`active = "<character>"`), `settings.toml` (an optional `system = "dnd5e"`), and `characters/<name>.toml` (a `[vars]` table of integers, a `[presets]` table of formulas, and optional top-level `system` and `crit_range`). The character's name is the file name without `.toml`.
>
> Convert them into one JSON file in the rollin export format described at https://github.com/scottwmacleod/rollin/blob/main/docs/export-format.md (format `rollin-backup`, version 1). Always include a character called `default` (empty if I had no file for it). Take `active` from `state.toml`, falling back to `default`. Copy `[vars]` into `vars` and `[presets]` into `presets`, lower-casing names. Put `presets.toml` into `globalPresets`. Rename `crit_range` to `critRange` and leave it out when it is 20. The web app has no default game system, so where `settings.toml` names a `system` and a character names none, copy the system onto that character. Use `{ "theme": "system" }` for settings and leave `rollLog` out. Give me only the JSON, and tell me about anything you couldn't convert.

Then use **Import** in the app and pick the file. The app shows a summary and asks before it replaces anything.

## Development

rollin is a TypeScript monorepo (npm workspaces, Node 22): the dice engine in `packages/engine` (no UI, no browser APIs) and a React, Vite and Tailwind web app in `apps/web`. Design decisions are in [docs/adr](docs/adr) and domain terms in [GLOSSARY.md](GLOSSARY.md). The design tokens in `ui/tokens.json` generate `ui/tokens.css`.

```sh
npm ci
just web-dev    # run the app locally
just check      # the gates CI runs: token drift, typecheck, Biome, Vitest, Playwright with axe
```

The engine takes its dice from an injected source, so tests script exact rolls. `packages/engine/fixtures/parity` holds frozen cases, recorded from the Rust engine this project used to have, that the engine must keep matching. See [CONTRIBUTING.md](CONTRIBUTING.md) before sending a change.

## License

MIT. See [LICENSE](LICENSE).
