# Local gates; `check` runs the same gates as the required `ci` check
# (.github/workflows/ci.yml). Needs Bun 1.4.5 (the version in package.json's
# packageManager).

check: web-check

# Regenerate ui/tokens.css from ui/tokens.json.
tokens:
    bun run tokens

web-check:
    bun install --frozen-lockfile
    bun --bun x playwright install chromium
    bun run check

# Run the web app in dev mode.
web-dev:
    bun install --frozen-lockfile
    bun run dev
