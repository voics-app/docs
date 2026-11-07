# 0024 — Mobile client stack: React Native with Expo, inside the client monorepo

- Status: proposed
- Date: 2026-11-03
- Deciders: @oussamaelhajoui
- Technical story: [mobile plan](../plans/2026-11-03-mobile-app.md)
- Implementation: [Mobile client](../handbook/13-mobile-client.md) (M0 skeleton)
- Related: [ADR 0001](0001-technology-stack.md) (desktop stack), [ADR 0004](0004-custom-sfu.md) (SFU), [spec non-goals](../specs/2026-10-16-voics-platform-design.md) (mobile was out of scope for v1)

## Context and Problem Statement

The design spec of 2026-10-16 left web and mobile clients out of v1, with a protocol designed so they could be added later. On 2026-11-03 the owner asked for an iOS app. The backend already serves everything a phone client needs except push notifications: REST `/api/v1`, the Elixir gateway and voice signalling to the str0m SFU.

The desktop client (Electron, React 19, TypeScript) is layered:

- `domain`: 77 pure modules;
- `application`: stores, use cases, and ports for the API and the gateway;
- `infrastructure`: HTTP, gateway, voice, privacy;
- `interface`: React DOM components.

Encrypted modes use a Rust native module (`native/crypto`: OpenMLS, Ed25519 device identity, encrypted SQLite) built with napi-rs. Voice E2EE uses DAVE-style frame encryption through `RTCRtpScriptTransform`.

Question: which stack should the iOS (and Android) app use, and where should it live, so that the most code is shared with the desktop client?

## Decision Drivers

- Reuse the TypeScript `domain` and `application` code instead of writing it a second time.
- Build iOS without owning a Mac (the owner develops on Windows).
- One codebase for iOS and Android.
- Voice must reach the existing SFU (WebRTC) and use the system call UI (CallKit, Android ConnectionService).
- The Rust crypto core must be reusable on mobile later. Encrypted modes may come after the first release.
- This matches how Discord ships: its iOS app has been React Native since 2015, and Android since 2022.

## Considered Options

1. **React Native with Expo (development builds, EAS Build), as `apps/mobile` in the client monorepo.**
2. React Native with Expo in a separate `mobile` repo, consuming a published `@discordy/core` package.
3. Native Swift (SwiftUI) for iOS, and later Kotlin (Compose) for Android.
4. Flutter (Dart).
5. Capacitor: the desktop renderer in a WebView.

## Decision Outcome

Proposed: **option 1.**

- **Location:** the mobile app lives in the `client` repo as `apps/mobile`, next to `apps/desktop`.
- **Shared code:** the platform-free code moves into a new workspace package `packages/core`: the `domain` modules, the stores, use cases and ports from `application`, and the HTTP and gateway clients from `infrastructure`. Both apps import it, so a change to a message rule or a protocol type lands in both apps in one PR, with no package publishing.
- **Expo:** development builds (not Expo Go), because the app needs native modules: `react-native-webrtc`, CallKit through `react-native-callkeep`, and later the crypto core.
- **Builds:** iOS binaries come from EAS Build in the cloud, so no Mac is needed. TestFlight is the first distribution channel.

### Consequences

- **Good:** most business logic is shared from day one, and only the UI layer is new.
- **Good:** iOS and Android ship from one codebase, and the owner needs no Mac.
- **Good:** the gateway and REST clients get a second consumer, which hardens the protocol.
- **Bad:** extracting `packages/core` is a real refactor of the desktop client. Modules that touch `window`, `document` or Electron have to move behind ports first: 2 domain modules and 9 application modules today.
- **Bad:** voice E2EE on mobile needs frame transforms, which `react-native-webrtc` does not expose like browsers do. The first mobile release joined only clear (non-E2EE) calls and showed "join on desktop" for encrypted ones. Update (client#297): the app uses `@livekit/react-native-webrtc`, whose native frame cryptor is the only iPhone option; desktop and phone share its frame layout (DAVE protocol version 2) and encrypted calls work on the phone.
- **Bad:** the encrypted message modes (ephemeral, P2P) need the Rust crypto core compiled for iOS and Android with a JSI binding (for example uniffi). Until then mobile shows those messages as "open on desktop".
- **Cost:** an Apple Developer account ($99 a year). Optional: Google Play Console ($25 once), or APK sideloading for Android. EAS has a free tier with queued builds.

## Pros and Cons of the Options

### 2. Separate repo with a published core package

- Good: clean repo boundaries, and mobile CI runs on its own.
- Bad: every shared change needs a package release and a version bump in two repos, which is slow for a one-person team.

### 3. Native Swift (and Kotlin)

- Good: the best platform feel and performance, and direct access to every iOS API.
- Bad: rewrites all client logic (twice, with Android). Building needs a Mac or a macOS CI runner. No code shared with desktop.

### 4. Flutter

- Good: one codebase and good performance.
- Bad: Dart shares nothing with the TypeScript client. WebRTC and CallKit plugins are less mature than in React Native.

### 5. Capacitor (WebView)

- Good: reuses even the desktop UI.
- Bad: a desktop UI in a WebView does not feel like a phone app. Background voice, CallKit and push are awkward. This is not how Discord-class apps are built.
