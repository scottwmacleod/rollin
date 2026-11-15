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

Characters, variables, presets, settings and the roll log live in your browser's storage. Clearing site data erases them, so use **Export** to save a backup file, and **Import** to replace the data on another device or browser with it. The file format is documented in [docs/export-format.md](docs/export-format.md); old backups keep importing into newer versions.

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
