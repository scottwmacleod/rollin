# Installing the desktop app (unsigned builds)

Releases tagged `desktop-vX.Y.Z` attach a universal `.dmg` (Apple Silicon and Intel, macOS 11+) to [GitHub Releases](https://github.com/scottwmacleod/rollin/releases). The builds are ad-hoc signed but not signed with an Apple Developer ID or notarized, so Gatekeeper blocks the first launch.

1. Open the `.dmg` and drag Rollin to Applications.
2. Try to open it once, then either:
   - right-click (or Control-click) Rollin.app and choose **Open**, then **Open** again; on macOS 15 and later, instead go to System Settings > Privacy & Security and click **Open Anyway**; or
   - run `xattr -dr com.apple.quarantine /Applications/Rollin.app` in a terminal.

Later launches are normal.

## Cutting a release

No local git is needed. The "Release desktop app" workflow (`.github/workflows/release.yml`) works out the version, builds, and creates the tag and GitHub Release itself.

- **Daily:** at 05:17 UTC it releases a patch bump if `main` has changed `apps/desktop`, `src`, or the root `Cargo.toml`/`Cargo.lock` since the last release. It skips quietly when nothing changed or when the required CI checks (`lint`, `test`, `test-linux`, `desktop`) have not all passed on `main`'s head; it tries again the next day.
- **Manually:** Actions > Release desktop app > Run workflow (also available in GitHub Mobile). Choose `patch`, `minor` or `major`, or type an exact version, which wins over the bump. Run it on `main`. A version with a hyphen (`0.2.0-rc.1`) is marked as a pre-release.
- **Fallback:** pushing a `desktop-vX.Y.Z` tag by hand builds that version without the schedule's checks.

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

## Apple signing and notarization (optional, #112)

Until the secrets below exist, builds are ad-hoc signed and need the Gatekeeper steps at the top of this page. With all of them set, the release workflow signs with a Developer ID Application certificate, notarizes through the App Store Connect API, staples the ticket to the app, and verifies the result (`codesign`, `spctl -a -vv`, `xcrun stapler validate`); users then open the app with no warning. Setting only some of them fails the release on purpose.

One-time setup (needs a person):

1. Join the [Apple Developer Program](https://developer.apple.com/programs/enroll/) (US$99/year). An individual enrolment shows your legal name in Gatekeeper dialogs; an organisation shows the company name but needs a D-U-N-S number and takes longer. Approval can take from minutes to a few days.
2. Create a **Developer ID Application** certificate (Certificates, IDs & Profiles > Certificates, or Xcode > Settings > Accounts > Manage Certificates). Export it from Keychain Access with its private key as a `.p12` and choose a password. Only the Account Holder can create Developer ID certificates.
3. Create an App Store Connect API key (App Store Connect > Users and Access > Integrations > Team Keys; role Developer is enough). Note the Key ID and the Issuer ID, and download the `.p8` once, since Apple will not offer it again.
4. Add these repo secrets (Settings > Secrets and variables > Actions):

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | the `.p12`, base64 encoded: `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | the certificate's full name, e.g. `Developer ID Application: Your Name (TEAMID)`; see `security find-identity -v -p codesigning` |
| `APPLE_API_ISSUER` | the Issuer ID (a UUID) |
| `APPLE_API_KEY` | the Key ID (10 characters) |
| `APPLE_API_PRIVATE_KEY` | the full text of the `.p8` file |

5. Back up the `.p12`, its password and the `.p8` in a password manager. Delete the `.p12` and `.p8` from Downloads.

Updates keep working across the switch: the updater signature is separate, and the app's bundle identifier does not change. The first signed release replaces an ad-hoc one in place.
