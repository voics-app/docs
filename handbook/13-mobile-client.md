# Mobile client (Expo, React Native)

Summary: what exists of the mobile app today (the M0 skeleton plus the first M1 slice: sign-in, gateway and server list), how it is built in the client monorepo, how its name and bundle id are configured, how CI checks it, and what comes next. The plan is [Mobile app plan](../plans/2026-11-03-mobile-app.md); the stack choice is [ADR 0024](../adr/0024-mobile-client-stack.md).

Last reviewed: 2026-11-04 ([client#206](https://github.com/discordy-voics/client/issues/206), PR client#256; skeleton: client#205, PR client#232).

## Status

M0 skeleton plus the first M1 slice. `apps/mobile` in the `client` repository is an Expo app with four bottom tabs (Servers, DMs, Notifications, You). You can sign in (email and password, then the authenticator or backup code when the account has two-factor sign-in) and sign out from the You tab. The app keeps a gateway connection and the Servers tab lists your servers and, per server, the text channels you can see, grouped by category. DMs, Notifications and message screens are still placeholders. All stores, the session manager and the protocol clients come from `@discordy/core`; nothing is published to an app store, and the first slice has been tested with mocks only, not yet on a device or simulator.

## How it is built

| Topic | Choice |
|---|---|
| Framework | Expo SDK 58, React Native 0.88, expo-router (file based routes in `app/`) |
| Language | TypeScript strict (plus `noUncheckedIndexedAccess`) |
| Versions | All pinned exactly in `apps/mobile/package.json`. `npx expo install --check` (run in `apps/mobile`) says whether they match the SDK |
| Workspace | One pnpm workspace with desktop. The root `.npmrc` has `node-linker=hoisted`, which Expo's monorepo support works with; Metro finds the workspace on its own |
| React version | Desktop and mobile pin the same React (19.3.0, what React Native 0.88 needs). Two React copies in a hoisted tree broke 144 desktop tests, so keep them equal when either app bumps React |
| Lint | `eslint.base.mjs` at the repo root holds the shared rules; `apps/desktop` and `apps/mobile` extend it |
| Tests | Jest (`jest-expo` preset) and React Native Testing Library in `apps/mobile/tests` |

## Sign-in, session and gateway

| Topic | Behaviour |
|---|---|
| Tokens | Kept in the iOS Keychain (Android Keystore) through expo-secure-store, readable after the first unlock and never leaving the device. A damaged entry reads as signed out. |
| Other device-local data | The persisted stores (preferences, drafts) use the key-value store of expo-sqlite behind the core storage port. |
| Sign-in | Core `SessionManager` does the work. A wrong email or password always shows "Wrong credentials. Please try again.", like desktop. A two-factor account gets a second step for the authenticator or backup code. |
| Gateway | Connects after sign-in or when the app starts with a stored session, and resumes the session when it can. |
| Foreground | When the app comes back from the background, a connection that is still connecting or reconnecting is replaced at once, and a ready one is replaced if the app was away for 30 seconds or more, because iOS can kill the socket silently. A short pause such as the control centre changes nothing. |
| Encrypted modes | Not on mobile yet: no device identity is registered (M3). |

## Name, scheme and bundle id (branding)

`apps/mobile/app.config.ts` reads `apps/desktop/brand.json`, the same file desktop uses:

| App setting | `brand.json` field |
|---|---|
| Display name | `displayName` |
| URL scheme (`discordy://`) | `protocolScheme` |
| iOS bundle identifier and Android package | `appId` |

The icon is `apps/desktop/build/icon.png` (512 px; a 1024 px icon without transparency is needed before the App Store). **The bundle id `nl.voics.discordy` is a placeholder** until the owner decides it ([docs#10](https://github.com/discordy-voics/docs/issues/10), plan decision 4). Changing it is a `brand.json` edit; it must happen before the first TestFlight build, because the id cannot change afterwards. Renaming the product: see [How to rebrand](../runbooks/rebrand.md); the mobile app follows the client `brand.json`.

## CI

The `client` CI calls the shared node workflow with the root scripts `lint`, `typecheck` and `test:unit`. These now run desktop and mobile one after the other, so a mobile failure fails the same job. It runs on Linux and needs no EAS or Apple account. EAS builds are added in M1.

## Running it

[Run the mobile app](../runbooks/run-the-mobile-app.md) (phone with Expo Go, development builds, Windows without a Mac).

## What comes next

The rest of M1: message screens (read, send, edit, delete, reply, reactions), DMs, attachments, push notifications, and TestFlight through EAS (needs the Apple Developer account from the owner decisions). Order and scope are in the [plan](../plans/2026-11-03-mobile-app.md).
