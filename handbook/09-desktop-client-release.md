# Desktop client release and auto-update

Summary: how a client tag becomes an installer, an update feed and an in-app update, with branding, rollback and platform status.

## From merge to installer

Versioning follows [How we work](03-how-we-work.md#releases-and-versioning). `.github/workflows/release.yml` in `client` runs on every merge to `main` (a release in our git-flow), on a `v*` tag and on manual dispatch. `develop` never builds an installer (Windows minutes cost 2x).

1. **Version.** `scripts/release-version.mjs` reads the version the feed serves (`latest.yml`, fetched with a cache-buster) and picks the next one, because electron-updater only updates to a strictly higher semver. On `main`: the version in `apps/desktop/package.json` if it is higher than the published one (the release branch bumped it), otherwise published patch + 1. On a tag: exactly the tag, and the run fails clearly if it is not higher than the published version. If the feed cannot be read the run fails instead of guessing. The chosen version is applied to `package.json` in the CI workspace only (unit-tested in `tests/unit/main/releaseVersion.test.ts`).
2. A **Windows (NSIS)** build runs on a GitHub-hosted `windows-latest` runner, including the native crypto module (Rust). It costs roughly 15 to 30 billed minutes on the GitHub Free quota. The build checks that `latest.yml` carries the chosen version.
3. `Voics-Setup-X.Y.Z.exe`, its `.blockmap` and `latest.yml` are attached to the GitHub Release `vX.Y.Z`, which the workflow creates (and tags at the merge commit) for `main` builds.
4. `minio-publish` uploads them to the `discordy-updates` bucket (served at `https://discordy-updates.voics.nl`) and copies the installer to `Voics-Setup-latest.exe`, the stable target of the website's Download button. `latest.yml` and the stable name get a 5-minute cache, so the button and installed clients see a new build within five minutes.

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

The product was renamed from Discordy to Voics with a new V app icon. The new `appId` installs as a separate app next to an old Discordy install, and data folders follow `productName` (`%APPDATA%\Voics`), so settings and sign-in do not carry over and `discordy://` links no longer open the app. No migration is built. The Windows exe gets its icon and version info from electron-builder (`signAndEditExecutable` is no longer disabled); that step downloads winCodeSign, whose archive contains symlinks, so a Windows build needs administrator rights or Developer Mode.

## Rollback

To pull a bad release, restore the previous `latest.yml` in the `discordy-updates` bucket. Because clients only update forward, ship a fixed version quickly. Verify by installing the previous version, starting it and confirming that the update prompt arrives and installs.

## Platform status

| Platform | Status |
|---|---|
| Windows (NSIS, x64) | Built and published by CI |
| macOS (dmg) and Linux (AppImage, deb) | Scripts exist (`pnpm dist:mac`, `pnpm dist:linux`), CI does not run them yet; the website says "coming soon" |
| Code signing | Installers are unsigned, so Windows SmartScreen shows "unknown publisher" (spec section 10) |
| RC or beta channel | Not built (develop does not publish); a dev updates host exists for a future dev installer channel |
