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
