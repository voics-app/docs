# voice

Summary: voice signaling (Elixir), the SFU (Rust, str0m) and the regionctl CLI.

| | |
|---|---|
| Repository | `discordy-voics/voice` |
| Images | `ghcr.io/discordy-voics/voice-signaling` and `ghcr.io/discordy-voics/voice-sfu` (namespace `voics-voice`) |
| Owns | etcd keys `/discordy/voice/nodes/<region>/<node_id>` (10-second lease) |
| Catalog entries | [voice-signaling and sfu](../services/catalog.md#voice-signaling) |

## Components

| Component | Path | Role |
|---|---|---|
| voice-signaling | `signaling/` | Voice WebSocket (`/voice`, port 4100), room registry, SFU control client, etcd registration and load reporting, drain mode, session replay after an SFU restart. Layers under `signaling/lib/discordy_voice/`. |
| voice-sfu | `sfu/` | UDP media mux (port 50000), ICE-lite and DTLS-SRTP, audio and simulcast video forwarding, NDJSON control on `127.0.0.1:4101`, ops HTTP on 4102. Crates `sfu-core` and `sfu-control`. |
| regionctl | `regionctl/` | CLI with `add`, `list`, `drain`, `undrain`. Writes a region into the gitops checkout and Cloudflare. A release binary, no image. |

Both services run in one pod per node with `hostNetwork`. The design follows Discord's published SFU approach: one SFU per node, all channels of a guild on one node, signaling decoupled from media ([ADR-0004](../adr/0004-custom-sfu.md), [voice protocol](../protocols/voice.md)).

## Run, test, release

```bash
make dev-sfu                        # media on UDP 50000, control on 4101
make dev-signaling                  # WebSocket on 4100 (copy signaling/.env.example first)
make test                           # cargo test and mix test
make lint
```

Tests include two in-process clients exchanging Opus through the SFU, the control server over TCP, etcd registration against a real etcd and full WebSocket handshakes. Release: tag `vX.Y.Z` builds both images and Flux deploys them.

## Operate

Everything about regions is in [Voice regions](07-voice-regions.md): adding, draining, failover and troubleshooting.

## Encrypted calls and video quality

The end-to-end encrypted call protocol (ops 25-31 as the client and node actually exchange them), the camera uplink settings and their troubleshooting are in [Voice: end-to-end encrypted calls and camera uplink quality](../specs/2026-10-23-voice-e2ee-and-uplink-quality.md).
