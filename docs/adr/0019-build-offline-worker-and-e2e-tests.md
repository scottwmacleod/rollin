# Build, offline worker and e2e test rules

Recorded on 2026-11-21 from the code comments they replace.

**Test-only dice.** e2e tests run against a test build (`vite build --mode e2e`) served by `vite preview`, where a test can script the dice through `window.__rollinDice`. The production build drops that branch, and `apps/web/scripts/check-no-test-hooks.mjs` fails the build if it reached the bundle.

**No retries, random order.** Playwright runs with `retries: 0`, because a test that needs a retry has a bug (sm_ conventions). Vitest runs in random order so no test leans on another running first.

**Wait on state, not time.** Saves run in the background, so a test waits for the saved value before it reloads or goes offline, as a person would. Axe runs wait for finite animations, such as a new roll's 150ms fade, so colours are read at rest. The layout-shift check counts only vertical moves of more than a few pixels in a side panel; a font swap's pixel nudge is tracked separately, since the font stacks come from sm-core.

**Phones.** Phone projects run on Chromium with each phone's screen, touch and user agent, so CI needs no WebKit download. The iPhone's own browser engine isn't covered.

**Generated copies.** `apps/web/scripts/copy-tokens.mjs` copies `ui/tokens.css` and the rollin marks from the sm-core copy into the app before dev and build, so each has one source. The copies are gitignored; never hand-edit them.

**Offline worker.** After the build, `apps/web/scripts/pwa.ts` writes `sw.js`, which precaches every file the build emitted, so the app loads and rolls offline after one visit. It skips the woff fallbacks (every browser that runs the worker has woff2) and source maps. The cache name carries a hash of those files, so any change makes a new worker. A new worker waits until the player chooses to reload (the page sends `SKIP_WAITING`), never swapping mid-session. PostHog's proxy (`/_sm/`) always goes to the network. Module scripts are fetched with CORS, so cached copies ignore `Vary: Origin`.

**Build details.** The build stamps the Vercel commit so an error report says which deploy it came from. Source maps are public (the repo is public) so PostHog shows readable stack traces.
