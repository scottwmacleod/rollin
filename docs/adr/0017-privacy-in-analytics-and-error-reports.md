# Analytics and error reports carry no player data

Recorded on 2026-11-21 from the code comments they replace.

**Analytics.** Vercel Web Analytics counts pages and Speed Insights records web vitals (#216, #304). Both are cookieless and load one deferred script from the site's own `/_vercel/` path after the app renders. PostHog (sm-core#21) runs experiments and masked autocapture: its script loads from `/_sm` once the page is idle, nothing loads under Global Privacy Control or Do Not Track, and masked text keeps formulas out. Events carry counts only, never a formula, a name or a result: a roll reports how many dice and which die sizes. Reading an experiment flag records the exposure once per page, which experiment results need.

**Error reports.** "Copy error details" builds text meant to be pasted into a public GitHub issue, so it carries only what helps reproduce a crash: the build, the browser, the kind of error and where in our own code it happened. It never carries the error's message, which can quote a formula, a preset name or a character name, nor any saved data. The details are shown in full so people can see exactly what's shared. Only failures in the app's own scripts count; a browser extension's script or the offline worker failing to load isn't something the player or an issue can fix.
