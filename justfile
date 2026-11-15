# Local gates; `check` mirrors the `web` job in .github/workflows/web.yml.
# Needs Node 22.

check: web-check

# Regenerate ui/tokens.css from ui/tokens.json.
tokens:
    npm run tokens

web-check:
    npm ci
    npm run tokens:check
    npm run typecheck
    npx biome check .
    npm test
    npx playwright install chromium
    npm run e2e

# Run the web app in dev mode.
web-dev:
    npm ci
    npm --workspace rollin-web run dev
