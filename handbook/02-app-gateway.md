# gateway

Summary: the realtime WebSocket edge in Elixir: sessions, presence, event fan-out, voice allocation and relays.

| | |
|---|---|
| Repository | `discordy-voics/gateway` |
| Image | `ghcr.io/discordy-voics/gateway` (namespace `voics-apps`, port 4000) |
| Tech | Elixir 1.20 / OTP 29, Phoenix 1.8, brod, Redix, eetcd, libcluster |
| Owns | Valkey keys `gw:*`, `e2ee:*`, `voice:*`, `presence:*` |
| Consumes | every `discordy.*.v1` topic, one consumer group per topic |
| Publishes | `discordy.telemetry.v1` |
| Catalog entry | [Service catalog: gateway](../services/catalog.md#gateway) |

## What it does

Terminates client WebSockets (`wss://discordy-gateway.voics.nl/gateway`, protocol P7): HELLO, IDENTIFY (user JWT or bot token), READY, heartbeats, RESUME from a Valkey buffer within 120 seconds. One cluster-wide process per guild (Horde) filters the fan-out by membership, intents and `VIEW_CHANNEL`. It also aggregates presence, allocates voice nodes from etcd, relays E2EE inbox frames and P2P signaling, and publishes voice-quality telemetry. See the [gateway protocol](../protocols/gateway.md) and [events](../protocols/events.md).

## Folder map

| Path | What is there |
|---|---|
| `lib/discordy_gateway/domain` | Pure logic: permissions, intents, routing. |
| `lib/discordy_gateway/application` | Use cases and ports (sessions, guild processes, voice allocation). |
| `lib/discordy_gateway/infrastructure` | Kafka consumers, Valkey, etcd, HTTP clients, clustering. |
| `lib/discordy_gateway/interface` | Phoenix endpoint, WebSocket handler, internal HTTP. |
| `lib/discordy_gateway/composition_root.ex` | Wiring. |
| `config/`, `rel/` | Runtime config and release setup. |
| `scripts/test-kafka.sh` | Throwaway Redpanda for the Kafka suite (works on Windows). |
| `ARCHITECTURE.md` | Structure and C4 diagram. |

## Run, test, release

```bash
cp .env.example .env && make dev   # JWT_PUBLIC_KEY must match the api key
make test                          # unit and application tests, no external services
make integration                   # also Valkey, etcd and Redpanda in Docker
make lint                          # format, warnings as errors, credo --strict, sobelow
```

Release: tag `vX.Y.Z`, stable image, Flux ([Release](../runbooks/release.md)).

## Operate

- Logs: `kubectl -n voics-apps logs deploy/gateway`. Metrics job `gateway`.
- Drain or undrain a voice node through the admin portal or `POST /internal/v1/voice/nodes/{id}/drain` ([draining a region](../runbooks/voice-regions/draining-a-region.md)).
- Secrets: `VALKEY_URL`, `VOICE_TOKEN_SECRET`, `RELEASE_COOKIE`, `TURN_STATIC_AUTH_SECRET` ([rotation](../runbooks/secret-rotation.md)).
