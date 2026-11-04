# Mobile client (Expo, React Native)

Summary: what exists of the mobile app today (the M0 skeleton plus the first M1 slices: sign-in, gateway, server list and text channels), how it is built in the client monorepo, how its name and bundle id are configured, how CI checks it, and what comes next. The plan is [Mobile app plan](../plans/2026-11-03-mobile-app.md); the stack choice is [ADR 0024](../adr/0024-mobile-client-stack.md).

Last reviewed: 2026-11-04 ([client#206](https://github.com/discordy-voics/client/issues/206), PRs client#256, client#257 and client#258; skeleton: client#205, PR client#232).

## Status

M0 skeleton plus the first M1 slices. `apps/mobile` in the `client` repository is an Expo app with four bottom tabs (Servers, DMs, Notifications, You). You can sign in (email and password, then the authenticator or backup code when the account has two-factor sign-in) and sign out from the You tab. The app keeps a gateway connection and the Servers tab lists your servers and, per server, the text channels you can see, grouped by category. Tapping a text channel opens its messages (see Messages below). The DMs tab lists your conversations and the You tab has your account and a few settings (see Direct messages, profiles and settings below). Notifications is still a placeholder. All stores, the session manager and the protocol clients come from `@discordy/core`; nothing is published to an app store, and these slices have been tested with mocks only, not yet on a device or simulator.

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

## Messages

| Topic | Behaviour |
|---|---|
| Reading | A text channel opens a message list with the newest message at the bottom. The latest 50 load first, older ones load as you scroll up. New, edited and deleted messages and reactions arrive live from the gateway through the core message store. |
| Sending | Type and tap Send. The message shows at once, dimmed, and settles when the server answers. If sending fails, the message stays with "Not sent: reason" and Retry and Discard. |
| Long press | A bottom sheet with quick reactions, Reply, Edit and Delete. Only what you may do is shown: Edit on your own messages, Delete on your own or with Manage Messages, reactions with Add Reactions, Reply and the composer with Send Messages. The rules come from the core permission and message menu code, the same as desktop. Delete asks for confirmation. |
| Reactions | Tap a reaction chip to add or remove your own. A refused change is undone and the reason shows in a red bar above the list. |
| Not yet | Channels with private delivery (ephemeral, peer to peer) show a notice instead of messages, because they need the encryption core (M3). Attachments, formatting and embeds, threads, pins and unread markers are not in this slice. |

## Name, scheme and bundle id (branding)

`apps/mobile/app.config.ts` reads `apps/desktop/brand.json`, the same file desktop uses:

| App setting | `brand.json` field |
|---|---|
| Display name | `displayName` |
| URL scheme (`voics://`) | `protocolScheme` |
| iOS bundle identifier and Android package | `appId` |

The icon is `apps/desktop/build/icon.png` (512 px; a 1024 px icon without transparency is needed before the App Store). The app is named Voics and the bundle id and Android package are `nl.voics.app`; the id cannot change after the first TestFlight build. Renaming the product: see [How to rebrand](../runbooks/rebrand.md); the mobile app follows the client `brand.json`.

## CI

The `client` CI calls the shared node workflow with the root scripts `lint`, `typecheck` and `test:unit`. These now run desktop and mobile one after the other, so a mobile failure fails the same job. It runs on Linux and needs no EAS or Apple account. EAS builds are added in M1.

## Running it

[Run the mobile app](../runbooks/run-the-mobile-app.md) (phone with Expo Go, development builds, Windows without a Mac).

## Direct messages, profiles and settings

| Topic | Behaviour |
|---|---|
| DMs tab | Lists your 1:1 and group conversations, most recent activity first, with the person's name (their nickname if they are a friend and you set one), or the group name, or the members' names. DMs you closed on this device stay hidden until a newer message arrives. The order and the hiding come from the core DM model. |
| Opening | A row opens the same message screen as a server channel (history, composer, replies, edit, delete, reactions); there are no roles in a DM, so every participant may send, react and read. Conversations with private delivery show the same notice as private channels, never messages or an error. |
| Profile | Tap an author name, or Profile in the header of a 1:1 DM. A sheet shows the avatar (from the CDN, with the initial as fallback), display name, username, About me (refreshed from the profile endpoint, the cached one shows if that fails) and, for friends, Friends since. |
| You tab | Your avatar, name, username and email, a Show reactions under messages switch (a device-local core preference) and Sign out. |

## What comes next

The rest of M1: attachments, push notifications, and TestFlight through EAS (needs the Apple Developer account from the owner decisions). Order and scope are in the [plan](../plans/2026-11-03-mobile-app.md).
