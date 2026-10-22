# 0001 — Elixir gateway, Rust data services, Electron client

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §1 goal 2 and §3](../specs/2026-10-16-voics-platform-design.md#3-containers-c2)

## Context and Problem Statement

Discordy aims at feature parity with Discord, and its architecture is explicitly modelled on Discord's published engineering. Which languages and runtimes should the gateway, the data services, voice and the desktop client use?

## Decision Drivers

- Large numbers of long-lived WebSocket connections, each with its own state and fault isolation
- Predictable latency on the hot data paths: message history and SFU packet forwarding
- Following Discord's public write-ups, so that their lessons transfer directly
- One desktop codebase for Windows (primary), macOS and Linux
- A codebase that any engineer can maintain under Clean Architecture

## Considered Options

1. Elixir gateway + Rust services + Electron client (Discord's own split)
2. Go everywhere, with a Wails or Tauri client
3. TypeScript/Node everywhere, with an Electron client
4. JVM (Kotlin) services, with a Compose Multiplatform client

## Decision Outcome

Chosen option: **1**, because it is the stack whose scaling story Discord has documented:

- **Elixir/OTP** gives each session and each guild its own supervised process, plus clustering through libcluster and cheap fan-out.
- **Rust** gives safe, GC-free latency for `api`, `messages`, `admin-bff` and the SFU (str0m).
- **Electron** gives the most capable desktop capture API (`desktopCapturer`, Windows Graphics Capture with loopback audio) and one UI codebase. Native crypto is Rust, loaded through napi-rs.

Pinned versions: Rust 1.99, Elixir 1.20 / OTP 29, Node 24, TypeScript 5.9, React 19, Electron 38.

### Consequences

- Good, because every tier runs on the runtime best suited to it, and the reasoning in the published engineering applies directly.
- Good, because Rust also covers the client's native crypto (OpenMLS, SQLCipher), so the crypto is not written twice.
- Bad, because contributors need three ecosystems. `contracts` limits the cost by generating the Rust, Elixir and TS types from one source.
- Bad, because Electron uses more memory than a native client. We accept that in exchange for capture quality and delivery speed.

### Confirmation

CI uses the reusable `rust.yml`, `elixir.yml` and `node.yml` workflows from `discordy-voics/.github`. A service in any other language needs a superseding ADR.

## Pros and Cons of the Options

### Option 2 — Go everywhere

- Good, because there is one language and builds are fast.
- Bad, because it has no supervision tree or process-per-entity model, and GC pauses land on the SFU hot path. It also diverges from the reference architecture.

### Option 3 — Node everywhere

- Good, because the client and server share one language.
- Bad, because a single-threaded event loop limits per-connection state at scale, and a Node SFU is impractical.

### Option 4 — JVM

- Good, because the ecosystem is mature.
- Bad, because its memory footprint is heavy on a 7.6 GB VM, and desktop capture support is immature.

## More Information

- Discord: "How Discord Scaled Elixir to 5,000,000 Concurrent Users"
- Discord: "Why Discord is switching from Go to Rust"
- Discord: "How Discord Stores Trillions of Messages"
