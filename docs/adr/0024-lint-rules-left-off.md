# Lint with bun lint, format with bun fmt, keep Biome for what bun lint can't check

Copied from sm-core's ADR-0010 on 2026-11-28, when sm-core was retired (Scott). `vendor/sm-core` is now `vendor/base`, and the sync and `verify.mjs` steps it mentions are gone.

Scott's CI speed brief (21 Nov 2026) makes `bun lint` and `bun fmt` the suite's linter and formatter, with every rule turned on that can be, and says checks only stay or grow. This records how the switch keeps that promise.

## The tools

- **`bun lint`** reads `.oxlintrc.json`. Products extend `vendor/sm-core/tooling/oxlintrc.base.json`. `bun lint` is only in Bun's canary, so products pin the exact build the trial used, `bun@1.4.5-canary.20261120.1`, through `bun x`. Move to the stable release once it ships `bun lint`.
- **`bun fmt`** reads `.oxfmtrc.json`, which sync installs from `tooling/oxfmtrc.json`: 100 columns, Prettier's other defaults, imports sorted. It is in stable Bun 1.4.5. It also formats Markdown, YAML and JSON, which Biome didn't. Files sync installs, and the two ratchet files, are ignored, since a formatted copy would fail `verify.mjs`.
- **Biome** stays for the rules `bun lint` doesn't have. `tooling/biome.base.json` now turns off Biome's formatter and import sorting, runs the recommended rules on CSS, and runs the 9 JavaScript rules listed below. Products run `biome lint`, not `biome check`.

## What bun lint misses

Biome had 219 rules on across rollin, planning-poker and the site. `biome migrate eslint` mapped each of bun lint's 954 rules back to Biome, and a manual pass matched the ones it can't map (for example `oxc/no-accumulating-spread` for `noAccumulatingSpread`). 158 Biome rules have a bun lint equivalent. Of the other 61:

- **25 CSS rules** (`noDuplicateProperties`, `noUnknownProperty`, `noInvalidGridAreas` and the rest of the recommended set). `bun lint` reads only JavaScript and TypeScript. Biome keeps them.
- **9 JavaScript rules**: `a11y/noSvgWithoutTitle`, `complexity/noThisInStatic`, `complexity/noUselessContinue`, `complexity/noUselessStringRaw`, `complexity/useSimpleNumberKeys`, `correctness/noStringCaseMismatch`, `performance/noDynamicNamespaceImportAccess`, `suspicious/noImplicitAnyLet`, `suspicious/noSuspiciousSemicolonInJsx`. Biome keeps them. Drop each when `bun lint` gains an equivalent.
- **2 TypeScript rules** the compiler already enforces: `noEmptyTypeParameters` and `noVoidTypeReturn`.
- **11 matched by hand**: `noUnusedImports` and `noUnusedFunctionParameters` (`no-unused-vars` with `args: all`), `noGlobalIsNan` and `noGlobalIsFinite` (`unicorn/prefer-number-properties`), `noConstEnum` (`oxc/no-const-enum`), `noApproximativeNumericConstant` (`oxc/approx-constant`), `noMisrefactoredShorthandAssign` (`oxc/misrefactored-assign-op`), `noConstantMathMinMaxClamp` (`oxc/bad-min-max-func`), plus `noAccumulatingSpread`, `noUselessEscapeInString` and `noFlatMapIdentity` (`unicorn/prefer-array-flat`).
- **14 that can't apply**: 9 GraphQL rules (no product has GraphQL), 4 rules about Biome's own config file, and HTML `noDuplicateAttributes`, which never ran because Biome's HTML support is off. html-validate covers it on the site.

## Every rule on, except these

The base turns on all seven categories (correctness, suspicious, pedantic, perf, style, restriction, nursery) as errors, type-aware, for the ESLint, TypeScript, unicorn, React, React perf, jsx-a11y, import, Vitest, oxc, promise and Node plugins, plus Bun's own rules: 704 rules in all. A product records the findings it already has in `oxlint-suppressions.json` (`bun lint --suppress-all`), so new code meets every rule and the file only shrinks: `bun lint` fails on a new finding and on a suppression that no longer matches (`--prune-suppressions` clears those).

Some rules take an option so they describe the suite's code rather than ban it: `curly` (multi-line), `one-var` (never), `func-style` (declarations or arrows), `no-plusplus` (allowed in a `for` update), `no-void` (allowed as a statement, the escape `no-floating-promises` asks for), `import/no-unassigned-import` (CSS imports), `no-unused-vars` (all arguments, `_` prefix to opt out), `unicorn/filename-case` (kebab, Pascal or camel case), `unicorn/switch-case-braces` (avoid), `import/consistent-type-specifier-style` (inline), and `vitest/prefer-expect-assertions` (async tests only).

Off, and why:

- **Contradict a rule that's on.** `import/no-named-export` and `import/prefer-default-export` (`import/no-default-export` is on), `typescript/non-nullable-type-assertion-style` (asks for `!`, which `no-non-null-assertion` bans), `node/no-top-level-await` (`unicorn/prefer-top-level-await` is on), `vitest/prefer-to-be-truthy` and `vitest/prefer-to-be-falsy` (`vitest/prefer-strict-boolean-matchers` is on), `vitest/no-importing-vitest-globals` (Scott: test files keep their `vitest` imports, and `prefer-importing-vitest-globals` is on), `eslint/init-declarations` (asks for `= undefined`, which `unicorn/no-useless-undefined` removes), `eslint/default-case` (a `default` branch hides a missing case from `typescript/switch-exhaustiveness-check`).
- **The formatter owns it.** `eslint/sort-imports` (bun fmt sorts imports in a different order), `vitest/padding-around-test-blocks`, `vitest/padding-around-after-all-blocks`.
- **The compiler owns it.** `eslint/no-undef` (TypeScript reports unknown names, and the rule doesn't know type-only globals), `react/react-in-jsx-scope` (the automatic JSX runtime needs no React import), `typescript/explicit-function-return-type` (inner functions and callbacks infer their type; `explicit-module-boundary-types` stays on for exports).
- **Bans a language feature the suite is built on.** `oxc/no-async-await`, `oxc/no-optional-chaining`, `oxc/no-rest-spread-properties` (these exist for old compile targets), `eslint/no-ternary`, `eslint/no-undefined`, `unicorn/no-null` (DOM, IndexedDB and JSON return `null`), `promise/avoid-new` (wrapping a callback API needs `new Promise`), `import/group-exports` and `import/exports-last` (ban `export` on a declaration), `import/no-relative-parent-imports` (neither app has path aliases), `react/jsx-no-literals` (bans text in JSX; there's no translation layer), `react/forbid-component-props` (bans `className` on components, which the ui wrappers take), `vitest/no-hooks`, `vitest/require-test-timeout` (timeouts live in config; Scott's rule bans widening them test by test).
- **Arbitrary limits that would rewrite working code.** `eslint/no-magic-numbers` (a dice roller is made of numbers), `eslint/id-length`, `eslint/max-statements` (10), `eslint/max-lines-per-function` (50), `react/jsx-max-depth` (2), `unicorn/max-nested-calls`, `vitest/max-expects`. `complexity`, `max-depth`, `max-lines`, `max-params`, `max-nested-callbacks`, `max-classes-per-file` and `import/max-dependencies` stay on.
- **Ordering that carries meaning.** `eslint/sort-keys`: key order in tokens, fixtures and test tables is deliberate.
- **Not worth it on this stack.** `typescript/prefer-readonly-parameter-types` (DOM and React types can't be made deeply read-only, so it flags nearly every parameter), the four `react-perf/jsx-no-new-*-as-prop` rules (React's guidance is that inline handlers and objects are fine unless a memoised child needs a stable prop).

Not turned on: `bun/format` (bun fmt runs as its own check), `bun/no-restricted-text` and `bun/prefer-local-module` (they need a pattern or a module to name), `bun/prefer-builtin-sleep` (browser code has no `Bun.sleep`), the `jest`, `bun:test` and `nextjs` plugins (the suite uses Vitest's API and no Next.js), and the JSON and Markdown rules, which `.oxlintrc.json` can't turn on yet.

A product turns a rule off only in its own `.oxlintrc.json`, with the reason in an ADR, the same as Biome rules before.
