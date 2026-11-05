# Mobile client (Expo, React Native)

Summary: what exists of the mobile app today (the M0 skeleton plus the first M1 slices: sign-in, gateway, server list and text channels), how it is built in the client monorepo, how its name and bundle id are configured, how CI checks it, and what comes next. The plan is [Mobile app plan](../plans/2026-11-03-mobile-app.md); the stack choice is [ADR 0024](../adr/0024-mobile-client-stack.md).

Last reviewed: 2026-11-05 (servers: [client#274](https://github.com/discordy-voics/client/issues/274); [client#206](https://github.com/discordy-voics/client/issues/206), PRs client#256, client#257 and client#258; skeleton: client#205, PR client#232).

## Status

M0 skeleton plus the first M1 slices. `apps/mobile` in the `client` repository is an Expo app laid out like the desktop client, with no bottom tabs (see Layout below). You can sign in (email and password, then the authenticator or backup code when the account has two-factor sign-in) and sign out from the You screen. The app keeps a gateway connection and the server rail lists your servers and, per server, the text channels you can see, grouped by category. Tapping a text channel opens its messages (see Messages below). The DM column lists your conversations and the You screen has your account and a few settings (see Direct messages, profiles and settings below). Notifications is still a placeholder. All stores, the session manager and the protocol clients come from `@discordy/core`; nothing is published to an app store, and these slices have been tested with mocks only, not yet on a device or simulator.

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
| Long press | A bottom sheet with quick reactions, Reply, Copy Text, Select Text, Edit and Delete. Only what you may do is shown: Edit on your own messages, Delete on your own or with Manage Messages, reactions with Add Reactions, Reply and the composer with Send Messages, Copy Text and Select Text on messages that have text. The rules come from the core permission and message menu code, the same as desktop. Delete asks for confirmation. Select Text opens a sheet with natively selectable text; links and mentions stay tappable. |
| Sheets | Every sheet (message menu, profile, select text, server menu and server settings sheets) is the same bottom sheet: the dark backdrop fades in on its own at about 45% while only the sheet slides up, tap outside or drag the grab handle down to close, the keyboard closes first, and with Reduce Motion on it appears without animation. |
| Rendering | Message text is the core markdown tree: bold, italic, underline, strike, inline code, code blocks (with Copy), quotes, lists, headings, tables, spoilers (tap to reveal), mentions, custom emoji and timestamps. Links open in an in-app browser; a link whose label differs from its address asks first unless the host is trusted (offers Always trust). Names use the highest role colour, avatars come from the CDN, system messages (join, pin, call, group changes) use the core system message table, and a reply shows the original above it and jumps to it when tapped. |
| Reactions | Tap a reaction chip to add or remove your own. A refused change is undone and the reason shows in a red bar above the list. |
| Not yet | Channels with private delivery (ephemeral, peer to peer) open on a plain message instead of messages, because they need the encryption core (M3). Attachments, embeds, threads, pins and unread markers are not in this slice yet. |

## Name, scheme and bundle id (branding)

`apps/mobile/app.config.ts` reads `apps/desktop/brand.json`, the same file desktop uses:

| App setting | `brand.json` field |
|---|---|
| Display name | `displayName` |
| URL scheme (`voics://`) | `protocolScheme` |
| iOS bundle identifier and Android package | `appId` |

The icon is `apps/desktop/build/icon.png` (512 px; a 1024 px icon without transparency is needed before the App Store). The app is named Voics and the bundle id and Android package are `nl.voics.app`; the id cannot change after the first TestFlight build. Renaming the product: see [How to rebrand](../runbooks/rebrand.md); the mobile app follows the client `brand.json`.

## CI

The `client` CI calls the shared node workflow with the root scripts `lint`, `typecheck` and `test:unit`. These now run desktop and mobile one after the other, so a mobile failure fails the same job. It runs on Linux and needs no EAS or Apple account. EAS builds are started by hand with `eas.json` profiles (see Voice and calls); CI does not build them.

## Running it

[Run the mobile app](../runbooks/run-the-mobile-app.md) (phone with Expo Go, development builds, Windows without a Mac).

## Layout

The main screen follows the desktop shell: a narrow server rail on the left, a column beside it, and a user panel at the foot of the column.

| Part | Behaviour |
|---|---|
| Server rail | Direct messages on top, a separator, then your servers and folders in the order you set on desktop (folders open and close). The selected item has a pill on its left edge and a squarer, accent-coloured tile; a server with unread messages has a short pip; mentions show a red count (Direct messages counts mentions in all conversations). Muted channels never light the pip. Create, join and discover are not on mobile yet. |
| Column | The selected server's name (tap it for the server menu, see Servers below) and its channels of every kind by category (tap a category to collapse it): text `#`, announcement megaphone, voice and stage speaker (with the people connected and the user limit), forum bubbles. The open channel is highlighted, unread channels bold with a dot, muted ones dimmed, with mention counts; a lock marks private, ephemeral (accent lock) and age-restricted (18+) channels and a link marks peer-to-peer ones. With Direct messages selected it is the conversation list. The bell in the column header opens Notifications. |
| User panel | Your avatar, name and status (your custom status when set). Tapping it, or the gear, opens the You screen. |
| Chats | Opening a channel or conversation shows the chat full screen over the rail. The back arrow, the swipe from the left edge (iOS) and the Android back button return to the rail, with the same server and channel still selected. |
| Deep links | `/servers/:guildId/:channelId` and `/dms/:channelId` open that chat with the main screen underneath; `/servers/:guildId` and `/dms` open the main screen with that view selected. Signed out always lands on sign-in. |

Colours, radii and sizes are desktop's Nightglass tokens (72 pt rail, 48 pt tiles). The layout has been tested with mocks only, not yet on a device.

## Direct messages, profiles and settings

| Topic | Behaviour |
|---|---|
| DM list | Lists your 1:1 and group conversations, most recent activity first, with the person's name (their nickname if they are a friend and you set one), or the group name, or the members' names. DMs you closed on this device stay hidden until a newer message arrives. The order and the hiding come from the core DM model. |
| Opening | A row opens the same message screen as a server channel (history, composer, replies, edit, delete, reactions); there are no roles in a DM, so every participant may send, react and read. Conversations with private delivery show the same notice as private channels, never messages or an error. |
| Profile | Tap an author name, or Profile in the header of a 1:1 DM. A sheet shows the avatar (from the CDN, with the initial as fallback), display name, username, About me (refreshed from the profile endpoint, the cached one shows if that fails) and, for friends, Friends since. |
| You screen | Your avatar, name, username and email, a Show reactions under messages switch (a device-local core preference) and Sign out. |

## Servers

| Topic | Behaviour |
|---|---|
| Voice channels | Listed in their category with the speaker icon, the user limit (`2/4`, red when full) and, indented under the row, the people connected right now from voice state: avatar, name (nickname first) and marks for muted, deafened (server ones in red), camera and live. A collapsed category does not hide them in the list on desktop; mobile collapses everything in it. Tapping one opens a screen with the channel name and who is in it. In Expo Go it says "Voice isn't in this test version yet"; in a development build it has a Join voice button (see Voice and calls). |
| Other channels | Ephemeral, peer-to-peer and forum channels open on one plain sentence saying they are not in this test version, never on unreadable content or an error. Threads are not listed (as on desktop). |
| Member list | The people icon at the right of a server channel's header opens the server's member list, which slides in from the right like any pushed screen (back returns to the chat). Groups are hoisted roles (highest first), Online and Offline, each collapsible, built by the core member rules; a row has the avatar with a status dot, the name in the role colour, a crown for the owner, an APP tag for bots, a speaker when in voice and the activity or custom status line. Search filters the loaded members and asks the gateway for more after a short pause. A swipe from the right edge to open it is not built. |
| Profile sheet | Tapping a person (also an author in a server chat) shows avatar, names, About me, their roles and Member since in the server, Friends since, and a Message button (not on your own profile) that opens or creates the DM and shows it. |
| Server menu | Tapping the server name in the column header. Invite people appears with Create Invite (choose expiry and uses, then Copy link or Share, through the first text channel as on desktop). Server settings appears with Manage Server, Manage Roles or Manage Channels. Leave server (not for the owner) asks first. Delete server, notification settings, mute and mark as read are not on mobile. |
| Server settings | A list of the pages the user may open, using the same permission rules as desktop's server settings (the shared `serverSettingsTabs` in core): Overview (Manage Server: name, icon from the photo library, only changed fields are sent), Roles (Manage Roles: hierarchy list with member counts and locks; per role name, colour, display separately, mentionable and every permission, with a switch disabled when the user lacks that permission or the role is at or above their highest; create and delete with confirmation), Members (everyone, as on desktop: search, and Kick or Ban only for people the user outranks with the matching permission, after a confirmation), Invites (Manage Server: create, copy, revoke with confirmation) and Channels (Manage Channels: create channel with kind, category and delivery mode or create category, rename, delete with confirmation). A deep link to a page the user may not open shows a note, not controls. |
| Not built | From desktop's server settings: Emoji, Template, Discovery, Bans (list and unban), Audit log. Inside the pages: banner, invite splash, description, voice region, system messages, inactive channel, default notifications and prune in Overview; role reordering, duplicate, role icon, adding roles to members and members per role in Roles; roles, timeout, nickname and Mod View in Members; permission overwrites, topic, slowmode, age restriction and reordering in Channels. Also pinned channels and the channel context menu. |

The pages run on Expo Go modules only (`expo-clipboard`, `expo-image-picker`). Like the rest of the app they were tested with mocks, not yet on a device.

## Voice and calls

Status: written and tested with fakes, not yet run on a device ([client#275](https://github.com/discordy-voics/client/issues/275), PR client#284). Voice needs a development or preview build, because react-native-webrtc is native and Expo Go does not contain it. The app checks for Expo Go at startup and never loads the native modules there, so Expo Go still works and shows the usual notices.

| Topic | Behaviour |
|---|---|
| Builds | `apps/mobile/eas.json` has `development` (development client, internal distribution) and `preview` (internal distribution, build number auto-increment). Run `eas build` from `apps/mobile`; the repo is a pnpm workspace with hoisted node_modules. An iPhone build needs the Apple Developer account, the registered device and the Expo account (owner steps, docs#10). The build adds the microphone and camera usage strings and the `audio` background mode. |
| Libraries | react-native-webrtc 155 (WebRTC M155) with `@config-plugins/react-native-webrtc` 15, react-native-incall-manager 4.3 (speaker or earpiece), expo-dev-client. react-native-webrtc is a legacy-style native module that React Native 0.88 runs through its interop layer; if a later React Native removes that layer, the library must move first. |
| Join and leave | Tap a voice channel, then Join voice. The call screen shows who is here, a green ring around whoever speaks, mute, deafen, speaker or earpiece and leave. A bar above the user panel shows the call while you browse and returns to the screen. |
| DM calls | The voice button in a DM opens the call screen and joins; the server rings the others. An incoming call shows Accept and Decline over any screen while the app is open. Ringing when the app is closed needs CallKit and PushKit (later). |
| Not yet | Video, screen share, end-to-end encrypted calls (Ephemeral and P2P DMs, accounts with `e2ee_calls_default`: the call closes with a plain message because iOS has no frame cryptor yet), CallKit, PushKit. |
| Code | The voice session, call controller and media ports live in `@discordy/core` (`application/voice`, `application/ports/media.ts` and `voice.ts`); desktop and mobile each supply the peer connection, microphone and mixer. |

What the Ephemeral and P2P modes need on mobile: the Rust crypto in `native/crypto` built for iOS (a `uniffi` feature next to the napi layer, static libraries for the iOS targets, an XCFramework and an Expo local module behind a core `CryptoBridge` port; build it in a macOS CI job rather than on the EAS worker), and an adapter that gives the P2P service a react-native-webrtc peer connection. Details are in the PR of client#275.

## What comes next

The rest of M1: attachments, push notifications, and TestFlight through EAS (needs the Apple Developer account from the owner decisions). Order and scope are in the [plan](../plans/2026-11-03-mobile-app.md).
