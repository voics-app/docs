# Mobile client (Expo, React Native)

Summary: what exists of the mobile app today (the M0 skeleton), how it is built in the client monorepo, how its name and bundle id are configured, how CI checks it, and what comes next. The plan is [Mobile app plan](../plans/2026-11-03-mobile-app.md); the stack choice is [ADR 0024](../adr/0024-mobile-client-stack.md).

Last reviewed: 2026-11-04 ([client#205](https://github.com/discordy-voics/client/issues/205), PR client#232).

## Status

M0 skeleton only. `apps/mobile` in the `client` repository is an Expo app with a sign-in placeholder and four bottom tabs (Servers, DMs, Notifications, You) holding placeholder screens. It talks to no API yet. The shared `packages/core` (`@discordy/core`) is being extracted in [client#204](https://github.com/discordy-voics/client/issues/204): the domain rules and protocol contracts are in, and persistence goes through a `KeyValueStorage` port so the same code runs on desktop (localStorage) and mobile. The application layer and protocol clients follow. Nothing is published to an app store.

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

M1 (text MVP, push notifications, TestFlight through EAS) needs the Apple Developer account from the owner decisions. Order and scope are in the [plan](../plans/2026-11-03-mobile-app.md).
