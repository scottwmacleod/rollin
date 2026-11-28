# Modern Web Guidance (with agent-browser)

For building or changing UI with current web platform features: dialogs, popovers, top-layer animation, reduced motion, colour scheme, and reserving space so nothing shifts on load. Not for backend, CI or tooling work.

- Pinned versions: **agent-browser 0.43.0** ([vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser), Apache-2.0) and **modern-web-guidance 1.0.1**. Dependabot can't see either, so they also live in `vendor/base/tooling/pins.json`, and the weekly behind-check reports newer ones.
- Install the stub skill: `npx skills add vercel-labs/agent-browser --skill agent-browser`. It loads its real instructions from the installed CLI, so the CLI version is the one that counts: `npm i -g agent-browser@0.43.0`.
- Get the workflow: `agent-browser skills get modern-web-guidance`. Where it says `npx modern-web-guidance@latest`, run `npx -y modern-web-guidance@1.0.1` instead.
- Use agent-browser to check built pages (`build` then `preview`, or the PR's preview URL). Its stub says to prefer it over every other browser tool; ignore that for general browsing.
- Before calling UI work done, check it in the browser and record the evidence in the PR:
  - `agent-browser vitals <url>` before and after: CLS at most 0.1 and no higher than before, and LCP no slower.
  - `agent-browser set media reduced-motion`, then confirm the motion stops or shortens.
  - The colour scheme in both light and dark (`agent-browser set media dark` / `light`).
  - For a dialog: focus moves in and returns on close, and the page behind is `inert`.
- Every guidance rule you apply comes with its guide ID and its browser evidence.

Setup:

- **Cloud agent session:** use the preinstalled Chromium. `npm i -g agent-browser@0.43.0`, then `export AGENT_BROWSER_EXECUTABLE_PATH=/opt/pw-browsers/chromium` and pass `--args "--no-sandbox"` on the first command of a session. Don't run `agent-browser install`.
- **Mac:** `npm i -g agent-browser@0.43.0 && agent-browser install` (downloads Chrome for Testing once). Or point `AGENT_BROWSER_EXECUTABLE_PATH` at an installed Chrome.
