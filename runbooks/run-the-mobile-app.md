# Run the mobile app

Use this to see the mobile app (`client` repository, `apps/mobile`) on a phone or emulator. It works on Windows; no Mac and no Apple account are needed for Expo Go. Background: [Mobile client](../handbook/13-mobile-client.md).

## Prerequisites

- Node 24 and pnpm 10, as for the desktop client.
- The `client` repository on `develop` (or the branch you test) and `pnpm install` run at its root.

## 1. Expo Go on a phone (quickest)

1. Install **Expo Go** (App Store or Google Play).
2. On the PC: `pnpm dev:mobile` in the client repository root. A QR code appears.
3. Phone and PC must share a Wi-Fi network. Scan the code: iPhone with the Camera app, Android inside Expo Go. The app opens on the sign-in placeholder; "Continue to the app skeleton" shows the tabs.
4. Edits to files in `apps/mobile` reload live.

If the phone cannot connect (Windows Firewall, guest Wi-Fi, VPN): allow Node.js on private networks in Windows Defender Firewall, or start with a tunnel: `pnpm --filter @discordy/mobile start -- --tunnel` (installs `@expo/ngrok` on first use).

## 2. Android emulator on Windows

Install Android Studio, create a virtual device, start it, then press `a` in the `pnpm dev:mobile` terminal.

## 3. iOS without a Mac

The iOS simulator exists only on macOS. Use a real iPhone with Expo Go (section 1). Once the app needs native modules that Expo Go lacks (WebRTC, push, CallKit; M1 and later) a **development build** is required:

- Build in the cloud: `npx eas-cli login`, then `npx eas-cli build --profile development --platform ios` in `apps/mobile`. Installing on an iPhone needs the Apple Developer account (owner decision, [docs#10](https://github.com/voics-app/docs/issues/10)). The EAS profiles are added in M1; they are not in the repository yet.
- Ephemeral and P2P chats need the crypto XCFramework in the build. Before the first iOS build (and whenever `native/crypto` or `apps/mobile/modules/voics-crypto` changes): start the manual workflow `crypto-ios` in the client repository (Actions tab, or `gh workflow run crypto-ios.yml --ref develop`; macOS minutes cost ten times, see [handbook 13](../handbook/13-mobile-client.md)), wait for the artifact `voics-crypto-ios`, and give EAS a token that can read Actions artifacts as the secret `VOICS_CRYPTO_GITHUB_TOKEN`. The `eas-build-pre-install` hook downloads the artifact; without the token or the artifact an iOS build stops with a plain message. To test a feature branch set `VOICS_CRYPTO_BRANCH`. By hand on a Mac: `VOICS_CRYPTO_GITHUB_TOKEN=... node apps/mobile/scripts/fetch-crypto-framework.mjs` before `expo run:ios`.
- Start the dev server for it with `pnpm --filter @discordy/mobile start:dev-client` and open the installed app.

## Checks before a PR

From the client repository root: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (desktop and mobile), the same as CI. To confirm the app bundles: `pnpm --filter @discordy/mobile exec expo export --platform ios --output-dir <temp dir>` (works on Windows). Version drift: `npx expo install --check` in `apps/mobile`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Desktop tests fail after a React bump | Mobile and desktop must pin the same React version; align `apps/desktop/package.json` and `apps/mobile/package.json`, run `pnpm install` |
| Metro cannot resolve a module | `pnpm install` at the repo root, then `pnpm dev:mobile -- --clear` |
| "Incompatible Expo Go" | Update Expo Go from the store; it supports the latest SDK |
