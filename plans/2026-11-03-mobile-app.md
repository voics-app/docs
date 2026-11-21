# Mobile app (iOS first, Android from the same code): plan (2026-11-03)

Summary: a React Native (Expo) app in the `client` monorepo that shares the desktop client's TypeScript core. It ships to iPhones through TestFlight. It comes in milestones: shared core, text MVP with push notifications, voice, encrypted modes, then parity polish. **This page is the plan; the M0 `apps/mobile` skeleton exists (see [Mobile client](../handbook/13-mobile-client.md)), the rest is not implemented yet.** The stack choice is [ADR 0024](../adr/0024-mobile-client-stack.md) (proposed).

Why now: mobile was a written non-goal of the v1 spec ("Web and mobile clients in v1. The protocol is designed so they can be added later"). On 2026-11-03 the owner asked for an iOS app.

## Owner decisions needed first

Tracked in [docs#10](https://github.com/voics-app/docs/issues/10) with `needs:owner`. M0 can start before 1 and 2 are answered. TestFlight (end of M1) cannot.

1. **Apple Developer account** ($99 a year, created by the owner, an individual or organization account). Only needed for TestFlight and the App Store, not to write the code.
2. **Stack:** approve ADR 0024 (React Native with Expo in the client monorepo), or choose native Swift.
3. **Android in the same releases?** It's nearly free with React Native. Distribute through Google Play ($25 once) or as an APK download from the website.
4. **App name and bundle id,** for example `nl.voics.discordy`. The name comes from `brand.json`, like desktop.
5. **Encryption in the first release?** Recommended: no. The first release supports standard messages and clear voice calls; encrypted messages show "open on desktop". Encryption follows in M3.

## What already exists (and what doesn't)

| Need | Status |
|---|---|
| REST API (`/api/v1`), auth, 2FA, guilds, channels, messages, DMs, attachments on the CDN | ready |
| Gateway (Elixir, WebSocket, resume) | ready. Mobile networks drop often, so resume and passive sessions ([gateway#12](https://github.com/voics-app/gateway/issues/12)) and zstd ([gateway#11](https://github.com/voics-app/gateway/issues/11)) start to matter |
| Voice signalling plus str0m SFU (WebRTC) | ready for clear calls. E2EE calls use DAVE frame encryption through `RTCRtpScriptTransform`, which `react-native-webrtc` does not offer: M3 |
| **Push notifications** (APNs for iOS, FCM for Android) | **missing.** A phone app is useless without them: it only receives gateway events while it's open |
| CORS | not an issue: native apps send no browser origin |
| QR login ([gateway#17](https://github.com/voics-app/gateway/issues/17)) | parked as "needs a mobile client". The phone scans the desktop's QR code. M4 |
| Native crypto (`native/crypto`: OpenMLS, Ed25519, encrypted SQLite, napi-rs) | desktop only. Needs an iOS/Android build plus a JSI binding: M3 |

## Architecture

```
client/                          (pnpm monorepo, already exists)
├─ packages/core/                NEW, shared by both apps
│   ├─ domain/                   moved from apps/desktop/src/renderer/domain (pure TypeScript)
│   ├─ application/              stores (zustand), use cases, ports (api, gateway, storage, notifications)
│   └─ infrastructure/           HTTP client and gateway client (fetch and WebSocket work in React Native)
├─ apps/desktop/                 Electron. Imports @discordy/core and keeps its React DOM interface layer
└─ apps/mobile/                  NEW: Expo development build, React Native UI, expo-router
    ├─ adapters/                 secure storage (Keychain via expo-secure-store), push, CallKit, WebRTC
    └─ app/                      screens
```

- **What gets shared:** the domain rules (message grouping, markdown parsing, permissions, member lists, unread state, system messages and more), the stores, and the protocol clients.
- **What doesn't:** the UI. React Native components replace the React DOM `interface` layer.
- **Platform calls go behind ports.** Anything touching `window`, `document`, `localStorage` or Electron becomes a port with one adapter per app. Today that's 2 `domain` modules and 9 `application` modules.
- **Tokens:** iOS Keychain or Android Keystore (`expo-secure-store`). The desktop keeps safeStorage.
- **Navigation:** `expo-router`. A bottom tab bar (Servers, DMs, Notifications, You), and a server's channel list as a drawer, like Discord mobile.
- **Lists:** FlashList for messages and members. The message list runs inverted, newest at the bottom.
- **Deep links:** `voics://` plus universal links on the website domain for invites (`/invite/<code>`). The website gets an `apple-app-site-association` file.

### Push notifications (new backend work)

| Piece | Where | What |
|---|---|---|
| Device push tokens | api | `POST/DELETE /users/@me/devices/push` stores an APNs or FCM token per device. The tables live next to the existing devices |
| Notifier | new worker (Rust), next to `messages` | Consumes the same dispatch event topics the gateway fans out from (Redpanda). Decides who gets a push using the existing notification settings ([api#28](https://github.com/voics-app/api/issues/28): mutes, @mentions only, DMs). Skips users with an active gateway session on that device. Sends to APNs (token auth, a `.p8` key in OpenBao) and FCM (a service account in OpenBao) |
| Back-pressure | notifier | [api#20](https://github.com/voics-app/api/issues/20) (bounded queue, drop or merge per user) |
| Privacy | notifier | Encrypted modes never put message text in a push; the push only says "New message". Standard messages carry a preview unless the user turns previews off |
| Ops | gitops | Deployment, OpenBao paths for the APNs key and FCM credentials, alerts on send failures. Definition of Done: Terraform, bootstrap, env.sh, overlays |

### Voice on mobile

- `react-native-webrtc` talks to the SFU through the existing signalling.
- **iOS:** CallKit through `react-native-callkeep`, so calls ring on the lock screen and survive the background, plus PushKit VoIP pushes for incoming DM calls (the notifier sends them).
- **Android:** ConnectionService plus a foreground service.
- **E2EE calls (DAVE):** the first release doesn't join them and shows "Join on desktop". M3 needs a native frame cryptor: a custom `react-native-webrtc` fork or a native module wrapping the Rust crypto core.

## Milestones

Each milestone ends with something you can run. Tickets get created on the board at the start of each milestone; the M0 and M1 tickets already exist (see below).

### M0: shared core and an app skeleton

1. Extract `packages/core` from `apps/desktop`. First move the 11 platform-touching modules behind ports, then move the files. The desktop must stay green the whole time (1177 unit tests, typecheck, lint, e2e, prod smoke). This lands as a series of small PRs, one area at a time.
2. Scaffold `apps/mobile`: Expo SDK (latest stable), TypeScript strict, ESLint config shared with desktop, Jest plus React Native Testing Library, `brand.json` for the name and icons.
3. CI: typecheck, lint and unit tests for `apps/mobile` in the existing node workflow (Linux, cheap). EAS builds start in M1.
4. Docs: handbook page `13-mobile-client.md`, a runbook "run the mobile app" (Expo dev build on your phone or a simulator), and the ADR flipped to accepted.

### M1: text MVP plus push, and TestFlight

- **Screens:** sign in (with 2FA, and "Wrong credentials. Please try again." like desktop), server list, channel list, channel messages (read, send, edit, delete, reply, reactions), DMs and group DMs, image and video attachments (view, and send from camera or photos), a profile sheet, and minimal settings (notifications, log out).
- **Live updates:** the gateway, with resume after network changes, and app background/foreground handling (`AppState`).
- **Push:** the api endpoints, the notifier and the gitops deployment. Tapping a notification opens the channel.
- **Distribution:** EAS Build plus TestFlight internal testing (needs decision 1), with app icons and a splash screen from `brand.json`.
- **Release flow:** the mobile version follows the client version (a client release builds desktop and mobile). Over-the-air JavaScript updates (`expo-updates`) are for bug fixes only, within App Store rules.

### M2: voice

- Voice channels and DM calls (clear calls): join and leave, mute and deafen, speaking indicators, and the participant list.
- CallKit and PushKit on iOS, ConnectionService on Android, and Bluetooth and speaker routing.
- Optional in M2: watching a screen share (receive only).

### M3: encrypted modes

- Compile `native/crypto` for iOS (arm64, simulator) and Android, with a JSI binding (uniffi or napi-equivalent), behind the same `PrivacyCrypto` port as desktop.
- Ephemeral and P2P messages, device identity, and device verification between a phone and a desktop.
- A native DAVE frame cryptor for E2EE calls.

### M4: parity polish

- QR login (gateway#17): the phone approves a desktop sign-in.
- Mobile parity items from the parity gap plan: swipe to reply, long-press menus, haptics, notification grouping, unread badges on the app icon, share to Voics (share extension), and a home-screen widget (later).

## Tickets created with this plan

| Ticket | Milestone | What |
|---|---|---|
| client#203 | epic | Mobile app (iOS and Android), tracks this plan |
| client#204 | M0 | Extract `packages/core` (domain, application, protocol clients) behind ports |
| client#205 | M0 | Scaffold `apps/mobile` (Expo dev build, CI, docs) |
| api#93 | M1 | Device push tokens API |
| messages#56 | M1 | Notifier worker: APNs and FCM from dispatch events |
| gitops#69 | M1 | Deploy the notifier, with APNs and FCM secrets in OpenBao |
| client#206 | M1 | Mobile text MVP screens, plus TestFlight via EAS |

Later milestones get their tickets when they start.

## Testing

- **Shared core:** the existing vitest suites move with the code.
- **Mobile:** Jest plus React Native Testing Library for components, and Maestro flows for end-to-end on a simulator (sign in, send a message, receive a push in a debug build).
- **Live:** a mobile variant of the production smoke test, run before every mobile release: sign in, send and receive with a desktop account, and get a push.

## Risks

| Risk | Mitigation |
|---|---|
| The `packages/core` extraction breaks desktop | Small PRs, desktop CI and prod smoke on each one, and no behaviour changes in those PRs |
| App Store review (user-generated content rules) | Report and block are needed in the app before submitting publicly. TestFlight internal testing has no review |
| Push privacy | No message text in pushes for encrypted modes, and an optional "hide previews" setting |
| Battery and data on gateway reconnects | Resume, passive sessions (gateway#12) and zstd (gateway#11) before a public release |
| The owner has no Mac | EAS cloud builds. A simulator needs macOS, so testing happens on a real iPhone with a development build |
