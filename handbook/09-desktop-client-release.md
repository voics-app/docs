# Desktop client release and auto-update

Summary: how a client tag becomes an installer, an update feed and an in-app update, with branding, rollback and platform status.

## From merge to installer

Versioning follows [How we work](03-how-we-work.md#releases-and-versioning). `.github/workflows/release.yml` in `client` runs on every merge to `main` (a release in our git-flow), on a `v*` tag and on manual dispatch. `develop` never builds an installer (Windows minutes cost 2x).

1. **Version.** `scripts/release-version.mjs` reads the version the feed serves (`latest.yml`, fetched with a cache-buster) and picks the next one, because electron-updater only updates to a strictly higher semver. A release or hotfix merge uses the branch version. Other `main` pushes use the package version if newer than the feed, otherwise published patch + 1. A tag uses its exact version: an already published version is a no-op and an older one fails. If the feed cannot be read the run fails instead of guessing. The chosen version is applied to `package.json` in the CI workspace only (unit-tested in `tests/unit/main/releaseVersion.test.ts`).
2. A **Windows (NSIS)** build runs on the configured Windows runner or GitHub-hosted `windows-latest`, including the native crypto module (Rust). The build checks that `latest.yml` carries the chosen version.
3. `Voics-Setup-X.Y.Z.exe`, its `.blockmap` and `latest.yml` are attached to the GitHub Release `vX.Y.Z`, which the workflow creates (and tags at the merge commit) for `main` builds.
4. Within 10 minutes the private gitops workflow `publish-public` (source `client-desktop`) uploads the `installer-windows` artifact to the `discordy-updates` bucket (served at `https://updates.voics.nl`) and copies the installer to `Voics-Setup-latest.exe`, the stable target of the website's Download button. The workflow requests a short cache for `latest.yml` and the stable name; verify the response and allow for caches during rollout.

A manual build when CI is unavailable: `pnpm dist:win` on Windows, then upload `apps/desktop/release/{Voics-Setup-X.Y.Z.exe,.blockmap,latest.yml}` to the bucket. The same steps are in [Release, Desktop client release](../runbooks/release.md#desktop-client-release).

## How the auto-updater works

The client uses **electron-updater** with the generic provider, pointed at the feed host (`brand.json` `updateFeedHost`, overridable with `UPDATE_FEED_URL`). The code is `apps/desktop/src/main/updater.ts`.

1. Ten seconds after start and then every 4 hours, a packaged app (not a dev run) calls `checkForUpdates`, which fetches `latest.yml` from the feed. A finished or running download is never restarted by a later check. The updater sits behind a small port (`UpdaterPort`) so the flow is unit-tested without Electron.
2. `latest.yml` names the newest version, the installer file, its SHA-512 and size. If the version is newer than the running one, the updater emits `update-available`.
3. With `autoDownload = true` it downloads the installer (using the `.blockmap` to fetch only changed blocks), reporting `download-progress` to the UI, then `update-downloaded`.
4. The user can install at once (`quitAndInstall`), or the update installs when the app quits (`autoInstallOnAppQuit = true`).
5. The UI shows the states checking, available, downloading, downloaded, not available and error. A non-blocking banner (bottom right) says "Update X found", then "Downloading N%", then "Update X is ready" with **Restart to update**, **What is new** (release notes, when the feed carries them in `latest.yml` `releaseNotes`) and **Later** (hidden for that version only). Settings > About and updates shows the current version and a manual **Check for updates**.

Publishing `latest.yml` is therefore what rolls an update out, and only forward: clients never downgrade.

## Uninstall and data on your computer

The Windows uninstaller removes the app and **keeps your data by default**, like Discord, so a reinstall picks up where you left off. The uninstaller asks what should happen to the data on this computer: **Keep my data** (selected) or **Remove everything**. Where things live (Electron's per-user profile, whatever the install location or install mode):

| Location | What is in it | Removed by Remove everything |
|---|---|---|
| `%APPDATA%\<productName>` (for example `%APPDATA%\Voics`) | session token vault, local message store and caches, settings, per-user E2EE key files (`crypto/<userId>.key` and `.db`), logs, Chromium caches | Yes |
| `%LOCALAPPDATA%\@discordydesktop-updater` (package name with `/` removed, plus `-updater`) | downloaded update installers | Yes |
| The install directory (default `%LOCALAPPDATA%\Programs\Voics`) | the app itself | Always removed |

Deleting the data also deletes the local encryption keys; encrypted history that only those keys could open is not recoverable afterwards, which the uninstaller page says. Nothing outside these folders is ever touched. Folder names come from `brand.json` (`productName`) and the package name, not from literals (`apps/desktop/build/installer.nsh`).

Silent and scripted uninstalls: `"Uninstall Voics.exe" /S` keeps the data; add `/DELETEDATA` to remove it too. An in-app update (electron-updater runs the old uninstaller with `--updated`) never deletes data.

## Branding

`apps/desktop/brand.json` holds `displayName`, `productName`, `shortName`, `appId` (`nl.voics.app`), `protocolScheme` (`voics`), `description`, `publisher`, `updateFeedHost`, and the hosts (`baseDomain`, `landingUrl`, `apiUrl`, `gatewayUrl`, `cdnUrl`). The window title, tray, UI copy, deep-link scheme, installer name and `electron-builder.config.cjs` read it; the installer is named `${productName}-Setup-${version}.${ext}`. A unit test fails if the display name is hard-coded elsewhere. Identifiers such as `@discordy/*` packages and `DISCORDY_*` variables stay as they are. The hosts stay on the `discordy-*.voics.nl` names.

The product was renamed from Discordy to Voics with a new V app icon. The new `appId` installs as a separate app next to an old Discordy install, and data folders follow `productName` (`%APPDATA%\Voics`), and `discordy://` links no longer open the app. On the first start the desktop app carries your data over from the old `Discordy` folder (a sibling of the new data folder on every platform): `crypto/`, `main-settings.json`, `session.bin`, Local Storage, IndexedDB and Chromium's `Local State` (on Windows it holds the key the OS encryption uses, so the session and E2EE key files stay readable). Caches are not copied and the old folder is never changed or deleted; it only runs when the new folder has no data yet and `DISCORDY_USER_DATA_DIR` is unset, and an interrupted copy is retried on the next start. On macOS and Linux the OS secret store is keyed by app name, so encrypted files may not open there and you sign in again. The Windows exe gets its icon and version info from electron-builder (`signAndEditExecutable` is no longer disabled); that step downloads winCodeSign, whose archive contains symlinks, so a Windows build needs administrator rights or Developer Mode.

## Rollback

To pull a bad release, restore the previous `latest.yml` in the `discordy-updates` bucket. Because clients only update forward, ship a fixed version quickly. Verify by installing the previous version, starting it and confirming that the update prompt arrives and installs.

## macOS dmg

The `macos` job of `release.yml` calls `.github/workflows/macos-dmg.yml` on a GitHub-hosted `macos-14` runner (the client repo is public, so no self-hosted runner is involved). Hosted macOS minutes cost 10x, so it only runs for releases, by hand (`gh workflow run macos-dmg.yml --ref <branch>`) and on pull requests that touch the Mac packaging files. The job is `continue-on-error`: a broken Mac build shows red but never blocks the Windows release.

- **Build**: `pnpm dist:mac` runs `scripts/build-native-mac-universal.sh` (the Rust crypto module for `aarch64-apple-darwin` and `x86_64-apple-darwin`, merged with `lipo` into one universal `.node`), then electron-builder with `--mac dmg --universal`. One `Voics-X.Y.Z.dmg` runs on Apple Silicon and Intel.
- **Signing**: without a Developer ID the app is ad-hoc signed by the `afterSign` hook (`apps/desktop/build/after-sign.cjs`), because Apple Silicon refuses to start a completely unsigned binary. Hooks for real signing are in place: set the repository secrets `MAC_CSC_LINK` (base64 .p12 of the Developer ID Application certificate) and `MAC_CSC_KEY_PASSWORD` and the same build signs with the hardened runtime and `build/entitlements.mac.plist`; add `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` to the build environment of `macos-dmg.yml` to notarize.
- **Publishing**: the artifact `installer-macos` holds `Voics-X.Y.Z.dmg` and a copy `Voics-latest.dmg`. gitops `publish-public` (source `client-macos`) syncs both to the `discordy-updates` bucket with a 5-minute cache on `Voics-latest.dmg`; the website's macOS buttons point to `https://updates.voics.nl/Voics-latest.dmg` (`downloads.macos` in the website `brand.json`).
- **No auto-update yet**: macOS updates (Squirrel.Mac) need a signed app and a `zip` target, so there is no `latest-mac.yml`. Mac users download a new dmg manually until signing exists; adding the `zip` target and publishing `latest-mac.yml` is the follow-up once a Developer ID is available.

### Opening an unsigned build

macOS Gatekeeper blocks an app that is not notarized. After dragging Voics to Applications, either right-click the app, choose **Open** and confirm **Open** in the dialog (once), or on macOS 15 and later open **System Settings > Privacy & Security** and choose **Open Anyway** after the first blocked start. From a terminal: `xattr -dr com.apple.quarantine /Applications/Voics.app`. Microphone and camera permission prompts appear on first use of voice or video.

## Platform status

| Platform | Status |
|---|---|
| Windows (NSIS, x64) | Built and published by CI |
| macOS (universal dmg, arm64 + x64) | Built by CI (`macos-dmg.yml`, called by `release.yml`), unsigned (ad-hoc), published by gitops `publish-public` (source `client-macos`) as `Voics-X.Y.Z.dmg` and `Voics-latest.dmg`; no auto-update yet. See "macOS dmg" below |
| Linux (AppImage, deb) | Script exists (`pnpm dist:linux`), CI does not run it yet; the website says "coming soon" |
| Code signing | Installers are unsigned, so Windows SmartScreen shows "unknown publisher" (spec section 10) |
| RC or beta channel | Not built (develop does not publish); a dev updates host exists for a future dev installer channel |
