# Installing the desktop app (unsigned builds)

Releases tagged `desktop-vX.Y.Z` attach installers to [GitHub Releases](https://github.com/scottwmacleod/rollin/releases): a universal `.dmg` for macOS and a `-setup.exe` for Windows. Neither is signed with a paid certificate (Apple Developer ID or a Windows code-signing certificate), so each OS warns on the first launch. Pick your platform below.

## macOS

The `.dmg` covers Apple Silicon and Intel, macOS 11+. The build is ad-hoc signed but not notarized, so Gatekeeper blocks the first launch.

1. Open the `.dmg` and drag Rollin to Applications.
2. Try to open it once, then either:
   - right-click (or Control-click) Rollin.app and choose **Open**, then **Open** again; on macOS 15 and later, instead go to System Settings > Privacy & Security and click **Open Anyway**; or
   - run `xattr -dr com.apple.quarantine /Applications/Rollin.app` in a terminal.

Later launches are normal.

## Windows

The installer is `Rollin_<version>_x64-setup.exe` (64-bit Windows). It is unsigned, so SmartScreen warns about it.

1. Download the `-setup.exe` from the release page and run it.
2. If Windows shows "Windows protected your PC", click **More info**, then **Run anyway**.
3. Follow the installer. It installs for your user only, so there is no administrator prompt. Rollin goes in `%LOCALAPPDATA%\Rollin` and appears in the Start menu.

Later launches are normal, and the app updates itself (see [Updates](#updates)). To remove it, use Settings > Apps > Installed apps.

### Smart App Control (Windows 11)

If Smart App Control is on, Windows may refuse to run the installer at all, with no "Run anyway" option. Smart App Control blocks unsigned apps it does not recognise. Your options:

- Turn it off in Windows Security > App & browser control > Smart App Control settings. It can only be turned back on by resetting Windows, so think before doing this.
- Wait for a signed Windows build (tracked in [#149](https://github.com/scottwmacleod/rollin/issues/149)).

Smart App Control is only active on some Windows 11 installs, mostly clean ones. If you do not see the block, you can ignore this.

### Where your data lives

Characters, presets and settings are TOML files in `%APPDATA%\rollin` (that is `C:\Users\<you>\AppData\Roaming\rollin`). Uninstalling Rollin leaves this folder alone, so a reinstall keeps your data. Delete the folder yourself for a clean slate. On macOS and Linux the same files live in `$XDG_CONFIG_HOME/rollin` or `~/.config/rollin`.

## Cutting a release

No local git is needed. The "Release desktop app" workflow (`.github/workflows/release.yml`) works out the version, builds, and creates the tag and GitHub Release itself.

- **Daily:** at 05:17 UTC it releases a patch bump if `main` has changed `apps/desktop`, `src`, or the root `Cargo.toml`/`Cargo.lock` since the last release. It skips quietly when nothing changed or when the required CI checks (`lint`, `test`, `test-linux`, `desktop`, `desktop-windows`) have not all passed on `main`'s head; it tries again the next day.
- **Manually:** Actions > Release desktop app > Run workflow (also available in GitHub Mobile). Choose `patch`, `minor` or `major`, or type an exact version, which wins over the bump. Run it on `main`. A version with a hyphen (`0.2.0-rc.1`) is marked as a pre-release.
- **Highlights:** the manual run has an optional `highlights` field. Its text goes above the list of changes, in both the release page and the app's update notes.
- **Fallback:** pushing a `desktop-vX.Y.Z` tag by hand builds that version without the schedule's checks.

### Release notes

The notes are GitHub's generated list of PRs merged since the previous desktop release, grouped by label (`.github/release.yml`): `enhancement` under "New", `bug` under "Fixes", everything else under "Other changes". PRs labelled `dependencies`, `github_actions` or `internal` are left out. So write the PR title as a line a user would read, and label the PR. The same text goes into `latest.json` as the update notes; the release page also gets the install help appended after the build. Editing a release afterwards changes the page only, not `latest.json`, so use `highlights` or fix titles/labels before the run.

The git tag is the source of truth for the version. The workflow writes it into `tauri.conf.json` in the runner only; nothing is committed, and the `version` in `apps/desktop/src-tauri/Cargo.toml` is a `0.0.0` placeholder. Do not bump it.

## Updates

The app checks GitHub Releases on launch and from the About dialog. When a newer version exists it offers **Update and restart**. The update bundle is signed with a separate updater key, which the app verifies, so a tampered bundle is refused and the installed version keeps working. This is independent of Apple signing.

The app reads `https://github.com/scottwmacleod/rollin/releases/latest/download/latest.json`. GitHub's "latest" is the newest non-pre-release Release of any kind, so if CLI releases (#61) ever share this repo, publish them with `--latest=false` or the app will stop finding updates.

### One-time updater key setup

1. `cd apps/desktop && npm run tauri signer generate -- -w ~/.tauri/rollin-updater.key` and choose a password.
2. Put the contents of `~/.tauri/rollin-updater.key.pub` in `plugins.updater.pubkey` in `apps/desktop/src-tauri/tauri.conf.json`.
3. Add repo secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of `rollin-updater.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Back up the key file and password (password manager). If the private key is lost, installed copies can never update again; users would have to reinstall by hand.

The release workflow refuses to run while the placeholder public key or the secret is missing.
