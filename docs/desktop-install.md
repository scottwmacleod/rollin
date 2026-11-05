# Installing the desktop app (unsigned builds)

Releases tagged `desktop-vX.Y.Z` attach a universal `.dmg` (Apple Silicon and Intel, macOS 11+) to [GitHub Releases](https://github.com/scottwmacleod/rollin/releases). The builds are ad-hoc signed but not signed with an Apple Developer ID or notarized, so Gatekeeper blocks the first launch.

1. Open the `.dmg` and drag Rollin to Applications.
2. Try to open it once, then either:
   - right-click (or Control-click) Rollin.app and choose **Open**, then **Open** again; on macOS 15 and later, instead go to System Settings > Privacy & Security and click **Open Anyway**; or
   - run `xattr -dr com.apple.quarantine /Applications/Rollin.app` in a terminal.

Later launches are normal.

## Cutting a release

1. Bump `version` in `apps/desktop/src-tauri/Cargo.toml` (the single source of truth; `tauri.conf.json` has no version and uses it) and refresh `Cargo.lock`.
2. Merge, then `git tag desktop-vX.Y.Z && git push origin desktop-vX.Y.Z`. The workflow fails if the tag and the Cargo version differ. A tag with a hyphen (`desktop-v0.2.0-rc.1`) is marked as a pre-release.

## Updates

The app checks GitHub Releases on launch and from the About dialog. When a newer version exists it offers **Update and restart**. The update bundle is signed with a separate updater key, which the app verifies, so a tampered bundle is refused and the installed version keeps working. This is independent of Apple signing.

The app reads `https://github.com/scottwmacleod/rollin/releases/latest/download/latest.json`. GitHub's "latest" is the newest non-pre-release Release of any kind, so if CLI releases (#61) ever share this repo, publish them with `--latest=false` or the app will stop finding updates.

### One-time updater key setup

1. `cd apps/desktop && npm run tauri signer generate -- -w ~/.tauri/rollin-updater.key` and choose a password.
2. Put the contents of `~/.tauri/rollin-updater.key.pub` in `plugins.updater.pubkey` in `apps/desktop/src-tauri/tauri.conf.json`.
3. Add repo secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of `rollin-updater.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Back up the key file and password (password manager). If the private key is lost, installed copies can never update again; users would have to reinstall by hand.

The release workflow refuses to run while the placeholder public key or the secret is missing.
