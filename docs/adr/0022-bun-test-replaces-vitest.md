# bun test replaces Vitest

Decided on 2026-11-21, as part of Scott's CI speed brief. Supersedes the Vitest bullet in ADR-0012.

Unit tests run on `bun test --parallel`: one worker per core, each test file in a fresh global (`--parallel` implies `--isolate`), and tests in random order (`randomize = true` in `bunfig.toml`; the seed prints on every run). Vitest is gone from the dependencies.

**Test files keep their `vitest` imports.** Bun maps `vitest` to `bun:test` at run time. `test/vitest.d.ts` declares the module for the type checker, and `test/setup.ts`, preloaded for every file, adds what Bun's `vi` and `expect` lack and resets state after every test: `vi.stubGlobal`, `vi.unstubAllGlobals`, `vi.stubEnv`, `vi.unstubAllEnvs`, `vi.hoisted`, `vi.mocked`, `vi.waitFor` and `expect.fail`.

**Side by side before the switch** (Bun 1.4.5, 4 cores): both runners ran the same 535 tests in the same 21 files, compared by file and full name, and all passed. Locally Vitest took 2.9-3.4 s for both workspaces; `bun test --parallel` takes about 1.0 s.

**What Bun got wrong, and what we did:**

- Bun resolves `./keypad` to `keypad.tsx` when `Keypad.tsx` sits beside `keypad.ts`, then fails with ENOENT. Vite resolves it correctly. It happens in 1.4.5 and in canary 1.4.6-canary.1. The two such imports now name `keypad.ts` and `rollLog.ts`.
- Bun's `vi` has no `stubGlobal`, and its `expect` has no `fail`. Without the setup file, `indexeddb.test.ts` failed on the missing helper. `expect.fail` calls in `backup.test.ts` only run when a test is already failing, so they would have failed with a TypeError instead of the message.
- Bun's types are stricter than Vitest's: `toEqual` and `toBe` check the expected value against the actual type. Three assertions compare loosely typed fixtures and now name the type they compare (`toEqual<unknown>`, `toBe<string | false>`).
- `bun test` finds `*.spec.ts` too, so `bunfig.toml` ignores `apps/web/e2e` (Playwright's).
- Vite's `define` doesn't reach `bun test`, so `bunfig.toml` defines `__APP_VERSION__` as `"dev"`, as Vite does outside Vercel.
