# Local gates; `check` runs the same gates as the required `ci` check
# (.github/workflows/ci.yml). Needs the Node version in .nvmrc (26) and
# Bun 1.4.4 (typecheck).

check: web-check

# Regenerate ui/tokens.css from ui/tokens.json.
tokens:
    npm run tokens

web-check:
    npm ci
    npx playwright install chromium
    npm run check
    node vendor/sm-core/verify.mjs

# Run the web app in dev mode.
web-dev:
    npm ci
    npm run dev
