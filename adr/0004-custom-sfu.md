# 0004 — Home-grown SFU (Rust/str0m) with Elixir voice signaling

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §7](../specs/2026-10-16-voics-platform-design.md#7-voice-video-and-screen-share), master plan P8

## Context and Problem Statement

Voice, video and screen share need a media server. Discord built its own on top of WebRTC primitives and documented the design. Should Voics do the same, or adopt an off-the-shelf SFU?

## Decision Drivers

- **Discord-style allocation:** all voice channels of a guild share one voice server, picked from etcd within the guild's region.
- **Minimal handshake:** a join payload of about 1 KB, SDP synthesised by the client, an ICE-lite server, no TURN for voice, and client IPs never exposed to peers.
- **Self-healing:** SFU restarts with zero downtime, rebuilding state without involving clients.
- **Media control:** fine-grained control over simulcast layer selection, RTP rewriting across DTX gaps, and RTCP/bandwidth estimation.
- **Footprint:** small enough for a small VM and cheap region nodes.

## Considered Options

1. Our own SFU in Rust on str0m (sans-IO WebRTC), controlled by Elixir signaling over a local socket
2. LiveKit
3. mediasoup
4. Janus or Jitsi Videobridge

## Decision Outcome

Chosen option: **1**. A voice server is one pod per node, made of two processes:

- **`voice-signaling` (Elixir):** speaks the voice WebSocket protocol, issues SSRCs and keys, relays speaking indicators and DAVE MLS messages, registers the node in etcd under a 10-second lease, and supervises the SFU.
- **`sfu` (Rust, str0m):** listens on a single UDP port (50000), runs ICE-lite and DTLS-SRTP, and forwards media with per-subscriber layer selection and sequence/timestamp rewriting. Signaling controls it over NDJSON on `127.0.0.1:4101`.

When the SFU crashes, signaling restarts it and replays `create_session` for every live session.

### Consequences

- Good, because the protocol and the allocation model match Discord's: one UDP port per node, and region placement driven by etcd.
- Good, because str0m is sans-IO, so the forwarder, layer selector and rewriter can be unit-tested deterministically (see the [C4 code view](../c4/rendered/structurizr-C4-SfuForwarder.svg)).
- Bad, because media correctness is ours to own: NACK/PLI, bandwidth estimation and simulcast edge cases. The loss/jitter simulator tests in WS5 mitigate this.
- Bad, because there is no TURN fallback for voice, so users on networks that block UDP cannot join calls in v1.

### Confirmation

- **WS5:** an integration test with two in-process str0m clients exchanging Opus.
- **WS11:** an end-to-end call between two clients through the SFU.

## Pros and Cons of the Options

### Option 2 — LiveKit

- Good, because it is feature-rich, production-proven and ships SDKs.
- Bad, because it brings its own signaling protocol and room model. Guild-scoped allocation and the Discord wire protocol would have to be bolted on, and its Redis-based clustering duplicates etcd.

### Option 3 — mediasoup

- Good, because it is an excellent low-level SFU.
- Bad, because it runs as Node plus C++ workers, which adds a fourth runtime, and its negotiation is SDP-centric.

### Option 4 — Janus or Jitsi

- Good, because both are mature.
- Bad, because they are heavyweight, plugin- or XMPP-centric, and far from the target protocol.

## More Information

- Discord: "How Discord Handles Two and Half Million Concurrent Voice Users using WebRTC"
- str0m: <https://github.com/algesten/str0m>
