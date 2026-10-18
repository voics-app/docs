# Discordy Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each workstream (WS) below is executed by one autonomous agent working in its own repo. **The "Pinned interfaces" section is law**: never change a name, port, topic, env var or payload shape defined there without updating this document first.

**Goal:** Build Discordy, a Discord-equivalent platform (minus payments), as a set of repos in the `discordy-voics` GitHub org. It runs locally via docker compose and on microk8s through Flux.

**Architecture:**
- Elixir gateway; Rust `api` and `messages` services.
- Voice: Elixir signaling + Rust SFU.
- Data: Postgres, ScyllaDB, Redpanda, Valkey, etcd, MinIO.
- Electron client.
- Admin portal (React + Rust BFF).
- Clean Architecture inside every service.

**Tech Stack:**
- Rust 1.99 stable (axum 0.8, tokio, sqlx, scylla, rdkafka, str0m).
- Elixir 1.20 / OTP 29 (Phoenix 1.8, brod, Redix, eetcd).
- Node 24 + pnpm 10, TypeScript 5.9, React 19, Vite 7, Electron 38.
- Postgres 17, ScyllaDB 2025.x, Redpanda 25.x, Valkey 8, etcd 3.6, MinIO.

**Spec:** `docs/specs/2026-10-16-voics-platform-design.md` (product name: **Discordy**)

## Global Constraints

- **Org and repos**: GitHub org `discordy-voics`; all repos private. Local root is `C:\Users\Karma\Projects\discordy\voics\<repo>`, with one git repo per directory.
- **Repo names**: `api`, `gateway`, `messages`, `voice`, `admin`, `client`, `bots-sdk`, `contracts`, `gitops`, `docs`, `.github`.
- **git-flow**: branches `main` + `develop`; work on `feature/<ws>-<topic>` branches, merged into `develop` with `--no-ff`.
- **Commits**: Conventional Commits, each ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Images**: `ghcr.io/discordy-voics/<repo>[-<component>]`. OCI labels required: `org.opencontainers.image.{title,description,source,version,revision,licenses}`; licenses = `UNLICENSED`.
- **Versioning**: semver via release-please. The initial version is `0.1.0`.
- **Code structure**: Clean Architecture folders `domain/`, `application/`, `infrastructure/`, `interface/`, plus a composition root. `domain` imports nothing from frameworks or IO. One use case per file.
- **Secrets**: no secrets in source. Config comes only from env vars, validated at startup; each repo ships an `.env.example` with dev-only values.
- **Every service exposes**:
  - `GET /healthz` (liveness)
  - `GET /readyz` (dependencies OK)
  - `GET /metrics` (Prometheus)
  - JSON structured logs to stdout
  - OpenTelemetry via `OTEL_EXPORTER_OTLP_ENDPOINT`, when that variable is set
- **Each repo contains**: `README.md`, `ARCHITECTURE.md` (with a C4 component diagram as Mermaid), `Makefile` (targets `dev`, `test`, `lint`, `build`, `docker`), `Dockerfile` (multi-stage, non-root, distroless or alpine), `.github/workflows/ci.yml` (calls the reusable workflows in `discordy-voics/.github`), `CHANGELOG.md`, `release-please-config.json` and `.release-please-manifest.json`.
- **Testing**: TDD for the domain and application layers. Integration tests use testcontainers, or the local compose stack where the language has no testcontainers support.
- **Hostnames**: one level deep under `voics.nl`, and always configurable. Defaults:

  | Hostname | Purpose |
  |---|---|
  | `discordy.voics.nl` | Landing page |
  | `discordy-api.voics.nl` | REST API |
  | `discordy-gateway.voics.nl` | Gateway WebSocket |
  | `discordy-rtc-<region>.voics.nl` | Voice WebSocket per region |
  | `discordy-admin.voics.nl` | Admin portal |
  | `discordy-headlamp.voics.nl` | Headlamp |
  | `discordy-updates.voics.nl` | Client update feed |
  | `discordy-cdn.voics.nl` | Attachments and avatars |

- **Out of scope**: payments, DRM capture, full-text search.

---

## Pinned interfaces

### P1. Ports (local dev and container)

**Services**

| Component | Port | Notes |
|---|---|---|
| api | 8080 | Public REST `/api/v1/*` and internal `/internal/v1/*` |
| messages | 8082 | Public REST (proxied under `/api/v1/channels/{id}/messages*`) and internal |
| gateway | 4000 | WS `/gateway`; internal HTTP `/internal/v1/*` |
| voice-signaling | 4100 | WS `/voice` |
| sfu | UDP 50000 | Media. Control on TCP `127.0.0.1:4101` (newline-delimited JSON) |
| admin-bff | 8090 | Serves `/admin-api/*` and the built SPA |
| admin-web (dev) | 5174 | |
| client renderer (dev) | 5173 | |
| coturn | UDP/TCP 3478 | |

**Infrastructure**

| Component | Port(s) |
|---|---|
| postgres | 5432 |
| scylla | 9042 |
| redpanda | 19092 (external), 9092 (internal), 9644 (admin) |
| valkey | 6379 |
| etcd | 2379 |
| minio | 9000 (API), 9001 (console) |
| victoriametrics | 8428 |
| grafana | 3000 |

**Local dev ingress (Caddy in compose, port 8000)** — mirrors production routing:

| Path | Routed to |
|---|---|
| `/api/v1/channels/*/messages*` | messages |
| `/api/v1/*` | api |
| `/gateway` | gateway |
| `/voice` | voice-signaling |
| `/cdn/*` | minio |

### P2. Environment variables

**Common to all services**

| Variable | Value |
|---|---|
| `DISCORDY_ENV` | `local` \| `production` |
| `LOG_LEVEL` | log level |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional |
| `INTERNAL_SERVICE_TOKEN` | shared secret sent as the `X-Internal-Token` header on `/internal/*` calls |
| `JWT_PUBLIC_KEY` | Ed25519 public key, PEM. Verified by every service |
| `SNOWFLAKE_WORKER_ID` | integer within the component's range (see P5) |
| `KAFKA_BROKERS` | e.g. `localhost:19092` |

**Per service**

| Service | Variables |
|---|---|
| api | `DATABASE_URL`, `VALKEY_URL`, `JWT_PRIVATE_KEY` (Ed25519 PEM), `PUBLIC_API_URL`, `PUBLIC_GATEWAY_URL`, `CDN_PUBLIC_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_ASSETS` (default `discordy-assets`), `MESSAGES_INTERNAL_URL` |
| messages | `SCYLLA_NODES`, `SCYLLA_KEYSPACE` (default `discordy`), `API_INTERNAL_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_ATTACHMENTS` (default `discordy-attachments`), `CDN_PUBLIC_URL` |
| gateway | `VALKEY_URL`, `ETCD_ENDPOINTS`, `TURN_STATIC_AUTH_SECRET`, `TURN_URLS`, `API_INTERNAL_URL`, `MESSAGES_INTERNAL_URL`, `VOICE_TOKEN_SECRET` (HS256), `PUBLIC_GATEWAY_URL`, `DEFAULT_VOICE_REGION` (default `nl-home`), `RELEASE_COOKIE` (Erlang distribution), `CLUSTER_DNS_QUERY` (optional, k8s headless service) |
| voice-signaling | `VOICE_REGION`, `VOICE_NODE_ID`, `VOICE_PUBLIC_WS_URL`, `VOICE_PUBLIC_IP`, `VOICE_UDP_PORT` (default `50000`), `ETCD_ENDPOINTS`, `VOICE_TOKEN_SECRET`, `SFU_CONTROL_ADDR` (default `127.0.0.1:4101`) |
| coturn | `TURN_STATIC_AUTH_SECRET` (shared with gateway, which mints short-lived TURN credentials for P2P) |
| sfu | `SFU_UDP_BIND` (default `0.0.0.0:50000`), `SFU_PUBLIC_IP`, `SFU_CONTROL_BIND` (default `127.0.0.1:4101`) |
| admin-bff | `ADMIN_DATABASE_URL`, `API_INTERNAL_URL`, `VICTORIAMETRICS_URL`, `ETCD_ENDPOINTS`, `ADMIN_ALLOWED_EMAILS` (comma-separated; the second gate after Cloudflare Access), `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` (both optional only when `DISCORDY_ENV=local`), `GATEWAY_INTERNAL_URL` |

### P3. Auth tokens

- **User access token**: JWT, alg `EdDSA`, 15-minute lifetime. Claims:

  | Claim | Value |
  |---|---|
  | `iss` | `"discordy-api"` |
  | `sub` | user ID, Snowflake as a string |
  | `sid` | session ID, a UUID |
  | `did` | device ID, Snowflake as a string |
  | `kind` | `"user"` |
  | `iat`, `exp` | standard |

  Sent as `Authorization: Bearer <jwt>`.
- **Refresh token**: opaque, 256-bit random, sent as base64url. It is stored as a hash in Postgres and rotated on every use; reuse of an already-rotated token revokes the whole session family. Endpoint: `POST /api/v1/auth/refresh`.
- **Bot token**: `Authorization: Bot <base64url(bot_user_id)>.<random 32 bytes base64url>`. Non-api services validate it via `POST /internal/v1/auth/introspect` and cache the result for 60 seconds.
- **Introspect response**: `{ "user_id": "...", "kind": "user"|"bot", "application_id": "..."|null, "session_id": "..."|null }`.
- **Voice token**: JWT HS256 signed with `VOICE_TOKEN_SECRET`, 60-second lifetime. Claims: `sub` (user ID), `sid`, `srv` (`guild_id`, or the DM `channel_id` for DM calls), `chn` (`channel_id`), `node` (voice node ID), `e2ee` (bool).

### P4. Internal HTTP APIs

All calls carry the `X-Internal-Token` header. All IDs are strings.

**api**

| Endpoint | Returns |
|---|---|
| `POST /internal/v1/auth/introspect` with `{token}` | the introspect response (P3) |
| `GET /internal/v1/users/{user_id}/ready` | `{ user, guilds: [GuildFull], private_channels: [Channel], relationships: [Relationship], user_settings }` |
| `GET /internal/v1/guilds/{guild_id}/state` | `GuildFull` (guild, roles, channels, members, voice_region) |
| `GET /internal/v1/channels/{channel_id}/access/{user_id}` | `{ "permissions": "<u64 as string>", "guild_id": ...\|null, "channel_type": int, "delivery_mode": "standard"\|"ephemeral"\|"p2p", "recipient_ids": [...] }` (403 if the user is not a member) |
| `GET /internal/v1/channels/{channel_id}/delivery` | `{ "guild_id": ...|null, "channel_type": int, "delivery_mode": ... }` without a user: used by messages for webhook and bot posts |
| `GET /internal/v1/admin/stats` | `{ users_total, guilds_total, channels_total, bots_total, signups_24h }` |
| `GET /internal/v1/admin/users?query=&limit=&after=` | paginated user list |
| `POST /internal/v1/admin/users/{id}/suspend` with `{reason, until}` | |
| `GET /internal/v1/admin/guilds?query=` | guild list |

**messages**

| Endpoint | Returns |
|---|---|
| `POST /internal/v1/channels/{id}/messages` with `{author_id, webhook_id?, username?, avatar_url?, interaction_id?, application_id?, target_user_ids?, content?, embeds?, components?, flags?, message_reference?, attachments?}` | Creates a standard message on behalf of a bot (`author_id` = bot user id), a webhook (`author_id` = `webhook_id`, with `username`/`avatar_url` overrides, as in Discord) or an interaction response (`interaction_id` + `application_id`; `flags & 64` = ephemeral, delivered only to the invoking user). Skips the user permission check because api authorised the call. Returns 409 / 50160 for non-standard delivery modes. Responds with the Message object |
| `GET /internal/v1/channels/{id}/last-message-id` | `{ "last_message_id": ... }` |
| `GET /internal/v1/admin/stats` | `{ messages_24h, messages_by_mode: {standard, ephemeral_relayed, p2p_signaled} }`. Counts only, never content |

**gateway**

| Endpoint | Returns |
|---|---|
| `GET /internal/v1/admin/stats` | `{ sessions_online, sessions_by_node, guild_processes, voice_allocations }` |
| `POST /internal/v1/voice/nodes/{node_id}/drain` | |
| `POST /internal/v1/voice/nodes/{node_id}/undrain` | |

### P5. Snowflakes

- **Layout**: 42 bits of milliseconds since epoch `1767225600000` (2026-01-01T00:00:00Z), 10 bits worker, 12 bits sequence. Serialized as **decimal strings** in JSON.
- **Worker ranges**:

  | Component | Workers |
  |---|---|
  | api | 0–63 |
  | messages | 64–127 |
  | gateway | 128–191 |
  | voice | 192–255 |

- **Buckets**: `bucket = floor((snowflake >> 22) / 864_000_000)`, i.e. 10 days of milliseconds.

### P6. Event bus (Redpanda / Kafka API)

**Envelope** (JSON, UTF-8):
```json
{ "id": "uuid-v7", "type": "MESSAGE_CREATE", "v": 1, "occurred_at": "RFC3339",
  "guild_id": "…|null", "channel_id": "…|null", "target_user_ids": ["…"] | null,
  "data": { /* exactly the gateway DISPATCH payload for `type` */ } }
```

**Topics**

| Topic | Key | Producer | Event types |
|---|---|---|---|
| `discordy.guild.v1` | guild_id | api | GUILD_CREATE, GUILD_UPDATE, GUILD_DELETE, CHANNEL_CREATE, CHANNEL_UPDATE, CHANNEL_DELETE, GUILD_ROLE_CREATE, GUILD_ROLE_UPDATE, GUILD_ROLE_DELETE, GUILD_MEMBER_ADD, GUILD_MEMBER_UPDATE, GUILD_MEMBER_REMOVE, GUILD_BAN_ADD, GUILD_BAN_REMOVE, GUILD_EMOJIS_UPDATE, INVITE_CREATE, INVITE_DELETE, THREAD_CREATE, THREAD_UPDATE, THREAD_DELETE, APPLICATION_COMMAND_PERMISSIONS_UPDATE |
| `discordy.message.v1` | channel_id | messages | MESSAGE_CREATE, MESSAGE_UPDATE, MESSAGE_DELETE, MESSAGE_DELETE_BULK, MESSAGE_REACTION_ADD, MESSAGE_REACTION_REMOVE, MESSAGE_REACTION_REMOVE_ALL, CHANNEL_PINS_UPDATE, MESSAGE_ACK |
| `discordy.user.v1` | user_id | api | USER_UPDATE, USER_SETTINGS_UPDATE, RELATIONSHIP_ADD, RELATIONSHIP_REMOVE, CHANNEL_CREATE (DMs, with `target_user_ids`), CHANNEL_RECIPIENT_ADD, CHANNEL_RECIPIENT_REMOVE, SESSIONS_REPLACE, USER_DEVICES_UPDATE (`{user_id, devices:[{device_id, identity_key_b64}]}`, targeted at the user and every user who shares a DM, group DM or guild with them; drives MLS member/device removal) |
| `discordy.interaction.v1` | application_id | api | INTERACTION_CREATE (routed to the bot's sessions) |
| `discordy.telemetry.v1` | node/user | voice, client (via gateway), gateway | VOICE_QUALITY, USAGE_TICK |
| `discordy.audit.v1` | guild_id | api | AUDIT_LOG_ENTRY_CREATE |

**Gateway routing**
- If `guild_id` is set (and `target_user_ids` is null): fan out through the guild process, filtered by VIEW_CHANNEL on `channel_id` and by intents.
- Otherwise: deliver to every session of each user in `target_user_ids`.
- Consumers are idempotent on `id`. The gateway keeps an LRU of the last 10k event IDs per node.

### P7. Gateway protocol (client ↔ gateway, `wss://<gateway>/gateway?v=1&encoding=json`)

**Frame format**: `{ "op": int, "d": any, "s": int|null, "t": string|null }`

**Opcodes**

| Op | Name | Direction | Payload `d` |
|---|---|---|---|
| 0 | DISPATCH | ← | event payload; `t` = event name; `s` = sequence number |
| 1 | HEARTBEAT | ↔ | last `s` |
| 2 | IDENTIFY | → | `{token, device_id, intents:int, properties:{os,client,version}, presence?}` |
| 3 | PRESENCE_UPDATE | → | `{status:"online"\|"idle"\|"dnd"\|"invisible", activities:[], afk:bool}` |
| 4 | VOICE_STATE_UPDATE | → | `{guild_id\|null, channel_id\|null, self_mute, self_deaf, self_video, self_stream}` |
| 6 | RESUME | → | `{token, session_id, seq}` |
| 7 | RECONNECT | ← | — |
| 8 | REQUEST_GUILD_MEMBERS | → | `{guild_id, query?, limit, user_ids?, nonce}` |
| 9 | INVALID_SESSION | ← | `resumable: bool` |
| 10 | HELLO | ← | `{heartbeat_interval: 41250}` |
| 11 | HEARTBEAT_ACK | ← | — |
| 20 | E2EE_ENVELOPE | ↔ | `{channel_id, message_id, sender_device_id, recipients:[{user_id, device_id, ciphertext_b64}], mls_epoch, content_type:"application"\|"commit"\|"welcome"\|"proposal"}`. Client→gateway carries all recipients; gateway→client carries only that device's entry |
| 21 | E2EE_ACK | → | `{message_ids:[...]}` — the gateway deletes those entries from this device's inbox |
| 22 | P2P_SIGNAL | ↔ | `{channel_id, to_user_id, to_device_id, from_user_id, from_device_id, kind:"offer"\|"answer"\|"ice"\|"bye", payload:string, identity_sig_b64}` — relayed only, never persisted |
| 23 | VOICE_TELEMETRY | → | `{channel_id, jitter_ms, loss_pct, rtt_ms, bitrate_kbps}` — published to `discordy.telemetry.v1` |
| 24 | WATCH_TOGETHER | ↔ | `{channel_id, action:"load"\|"play"\|"pause"\|"seek", url?, position_ms, at_server_ms}` |

**Dispatch events emitted by the gateway itself**: READY, RESUMED, PRESENCE_UPDATE, TYPING_START, VOICE_STATE_UPDATE, VOICE_SERVER_UPDATE `{token, guild_id|null, channel_id, endpoint, region}`, GUILD_MEMBERS_CHUNK, and E2EE inbox replay after READY.

**Typing**: `POST /api/v1/channels/{id}/typing`. The api publishes TYPING_START to `discordy.message.v1`.

**Sessions**:
- Resume window: 120 seconds. Missed dispatches are buffered in a Valkey list `gw:resume:<session_id>`, capped at 1000 entries.
- Rate limit: 120 sends per 60 seconds per session; close code 4008 when exceeded.

**Close codes**

| Code | Meaning |
|---|---|
| 4000 | unknown |
| 4001 | unknown opcode |
| 4002 | decode error |
| 4003 | not authenticated |
| 4004 | authentication failed |
| 4005 | already authenticated |
| 4007 | invalid seq |
| 4008 | rate limited |
| 4009 | session timed out |
| 4013 | invalid intents |
| 4014 | disallowed intents |

**Ephemeral inbox**:
- One Valkey stream per device, `e2ee:inbox:<device_id>`, with entries `{message_id, json}`.
- `MAXLEN ~ 10000`.
- Each entry also gets a sorted-set index `e2ee:ttl` scored by expiry (7 days). A sweeper process deletes expired entries every minute.
- **Nothing ephemeral is written to Postgres or ScyllaDB.**

**Intents**: Discord bit values — GUILDS 1<<0, GUILD_MEMBERS 1<<1, GUILD_MODERATION 1<<2, GUILD_EMOJIS 1<<3, GUILD_INTEGRATIONS 1<<4, GUILD_WEBHOOKS 1<<5, GUILD_INVITES 1<<6, GUILD_VOICE_STATES 1<<7, GUILD_PRESENCES 1<<8, GUILD_MESSAGES 1<<9, GUILD_MESSAGE_REACTIONS 1<<10, GUILD_MESSAGE_TYPING 1<<11, DIRECT_MESSAGES 1<<12, DIRECT_MESSAGE_REACTIONS 1<<13, DIRECT_MESSAGE_TYPING 1<<14, MESSAGE_CONTENT 1<<15.
- **Privileged**: GUILD_MEMBERS, GUILD_PRESENCES, MESSAGE_CONTENT.
- **User sessions** implicitly get all intents.

### P8. Voice allocation and voice protocol

- **etcd discovery**: each node writes `/discordy/voice/nodes/<region>/<node_id>` under a 10-second lease, refreshed every 3 seconds. Value: `{node_id, region, ws_url, public_ip, udp_port, users:int, cpu_pct:float, egress_bps:int, draining:bool, version}`.
- **Allocation** (gateway guild process; DM calls use a per-channel process):
  1. Read the region: per-channel override, else the guild's `voice_region`, else `DEFAULT_VOICE_REGION`.
  2. Pick the non-draining node with the lowest `users`, breaking ties by `cpu_pct`.
  3. Store the choice at Valkey `voice:alloc:<srv_id>` = node_id.
  4. Every user in that guild/DM shares the node.
  5. If the node disappears from etcd, the gateway reallocates and re-sends VOICE_SERVER_UPDATE to the connected users.
- **Voice WebSocket** (`wss://<node ws_url>/voice`), frames `{op, d}`:

  | Op | Name | Direction | Payload `d` |
  |---|---|---|---|
  | 0 | IDENTIFY | → | `{server_id, user_id, session_id, token, video:bool}` |
  | 2 | READY | ← | `{ssrc:int, ip, port, modes:["dtls-srtp"], streams:[{type:"video", rid, quality, ssrc, rtx_ssrc}]}` |
  | 1 | SELECT_PROTOCOL | → | `{protocol:"webrtc", data:{ice_ufrag, ice_pwd, fingerprint, setup:"actpass"}, codecs:[{name:"opus",type:"audio",priority,payload_type},{name:"VP9"\|"AV1"\|"H264",type:"video",priority,payload_type,rtx_payload_type}]}` |
  | 4 | SESSION_DESCRIPTION | ← | `{ice_ufrag, ice_pwd, fingerprint, candidates:[{ip,port,protocol:"udp"}], audio_codec, video_codec, e2ee:{protocol_version}\|null}`. The client synthesizes the remote SDP from this |
  | 3 | HEARTBEAT | → | `{t: nonce}` |
  | 6 | HEARTBEAT_ACK | ← | `{t}` |
  | 5 | SPEAKING | ↔ | `{speaking: bitmask(1 mic, 2 soundshare, 4 priority), ssrc, user_id?}` |
  | 8 | HELLO | ← | `{heartbeat_interval: 13750}` |
  | 11 | CLIENTS_CONNECT | ← | `{user_ids:[...]}` |
  | 12 | VIDEO | ↔ | `{audio_ssrc, video_ssrc, rtx_ssrc, streams:[...]}` |
  | 13 | CLIENT_DISCONNECT | ← | `{user_id}` |
  | 15 | MEDIA_SINK_WANTS | → | `{"<ssrc>": quality 0-100}` — viewer picks a simulcast layer |
  | 21–31 | DAVE_* | ↔ | MLS for media E2EE: 21 PREPARE_TRANSITION, 22 EXECUTE_TRANSITION, 25 MLS_EXTERNAL_SENDER, 26 MLS_KEY_PACKAGE, 27 MLS_PROPOSALS, 28 MLS_COMMIT_WELCOME, 29 MLS_ANNOUNCE_COMMIT, 30 MLS_WELCOME, 31 MLS_INVALID_COMMIT |

- **SFU control** (TCP 4101, NDJSON). Signaling → SFU commands: `{"cmd":"create_session","session_id","ice_ufrag","ice_pwd","remote_fingerprint","codecs"}`, `{"cmd":"close_session",...}`, `{"cmd":"set_sink_wants",...}`. SFU → signaling replies: `{"evt":"session_created","local_ufrag","local_pwd","fingerprint"}`, `{"evt":"speaking",...}`, `{"evt":"stats",...}`.
- **Crash recovery**: if the SFU restarts, signaling replays `create_session` for every live session (state rebuild, as at Discord).

### P9. REST API (public, `/api/v1`, JSON, snake_case, Discord-shaped objects)

**Endpoints** — owner is `api` unless marked **(messages)**:

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register {email, username, password}` → `{access_token, refresh_token, user}` · `POST /auth/login {email, password, totp?}` · `POST /auth/refresh {refresh_token}` · `POST /auth/logout` |
| Devices | `POST /devices {name, identity_key_b64}` → `{device_id}` · `POST /devices/{id}/key-packages {packages:[b64]}` · `GET /users/{id}/devices` → `[{device_id, identity_key_b64}]` · `POST /users/{id}/devices/{did}/key-packages/claim` → `{package_b64}` |
| Users | `GET/PATCH /users/@me` · `GET /users/{id}` · `GET/PATCH /users/@me/settings` (includes `default_delivery_mode`) · `GET /users/@me/channels` · `POST /users/@me/channels {recipient_ids}` (DM / group DM) · `GET/PUT/DELETE /users/@me/relationships/{id}` · `PUT /users/@me/channels/{id}/delivery-mode {mode}` (per-chat override) |
| Guilds | `POST /guilds` · `GET/PATCH/DELETE /guilds/{id}` · `GET/POST /guilds/{id}/channels` · `PATCH /guilds/{id}/channels` (positions) · `GET/POST /guilds/{id}/roles` · `PATCH/DELETE /guilds/{id}/roles/{rid}` · `GET /guilds/{id}/members` · `GET/PATCH/DELETE /guilds/{id}/members/{uid}` · `PUT/DELETE /guilds/{id}/members/{uid}/roles/{rid}` · `GET/PUT/DELETE /guilds/{id}/bans/{uid}` · `GET /guilds/{id}/audit-logs` · `GET/POST/PATCH/DELETE /guilds/{id}/emojis[/{eid}]` · `GET /guilds/{id}/invites` |
| Channels | `GET/PATCH/DELETE /channels/{id}` · `PUT/DELETE /channels/{id}/permissions/{overwrite_id}` · `POST /channels/{id}/invites` · `POST /channels/{id}/typing` · `POST /channels/{id}/threads` |
| Invites | `GET /invites/{code}` · `POST /invites/{code}` (accept) · `DELETE /invites/{code}` |
| Messages **(messages)** | `GET /channels/{id}/messages?before&after&around&limit` · `POST /channels/{id}/messages {content, nonce, attachments?, message_reference?, embeds?, components?}` · `PATCH/DELETE /channels/{id}/messages/{mid}` · `POST /channels/{id}/messages/bulk-delete` · `PUT/DELETE /channels/{id}/messages/{mid}/reactions/{emoji}/@me` · `GET/PUT/DELETE /channels/{id}/pins[/{mid}]` · `POST /channels/{id}/messages/{mid}/ack` · `POST /channels/{id}/attachments` (returns a presigned upload URL) |
| Applications / bots | `POST /applications` · `GET/PATCH /applications/{id}` · `POST /applications/{id}/bot/reset-token` · `GET/PUT/POST/PATCH/DELETE /applications/{id}/commands[/{cid}]` · `.../guilds/{gid}/commands[/{cid}]` · `POST /interactions/{id}/{token}/callback` · `PATCH/DELETE /webhooks/{app_id}/{token}/messages/@original` · `POST /webhooks/{app_id}/{token}` (follow-up) · `GET /oauth2/authorize` (bot invite info) · `POST /oauth2/authorize {client_id, guild_id, permissions, scope}` |
| Webhooks | `POST /channels/{id}/webhooks` · `GET /guilds/{id}/webhooks` · `POST /webhooks/{id}/{token}` (execute) · `PATCH/DELETE /webhooks/{id}` |
| Voice | `GET /voice/regions` → `[{id, name, optimal}]` · `PATCH /guilds/{id}` with `{voice_region}` |

**Delivery-mode rules (enforced server-side)**
- `POST /channels/{id}/messages` returns **409** `{code: 50160, message: "Channel uses <mode> delivery"}` when the effective mode is not `standard`. Private messages go over gateway op 20 or op 22.
- The `messages` service resolves the effective mode via the access endpoint (P4).

**Errors**: `{ "code": int, "message": string, "errors"?: object }` with Discord-style codes:

| Code | Meaning |
|---|---|
| 10003 | unknown channel |
| 10004 | unknown guild |
| 10008 | unknown message |
| 10013 | unknown user |
| 50001 | missing access |
| 50013 | missing permissions |
| 50035 | invalid form body |
| 40002 | verification required |
| 50160 | delivery-mode conflict |
| 429 | rate limited |

**Rate-limit headers**: `X-RateLimit-Limit`, `-Remaining`, `-Reset`, `-Reset-After`, `-Bucket`.

**Object shapes**: follow Discord API v10 field names exactly (User, Guild, Channel, Role, Member, Message, Attachment, Embed, Reaction, Emoji, Invite, Application, ApplicationCommand, Interaction, Webhook, VoiceState, PermissionOverwrite). Extra Discordy fields:
- Channel: `delivery_mode`, `voice_region`
- UserSettings: `default_delivery_mode`
- Device: `device_id`, `identity_key_b64`

**Channel types** (Discord values): 0 GUILD_TEXT, 1 DM, 2 GUILD_VOICE, 3 GROUP_DM, 4 GUILD_CATEGORY, 5 GUILD_ANNOUNCEMENT, 10/11/12 threads, 13 GUILD_STAGE_VOICE, 15 GUILD_FORUM.

**Permission bits**: Discord values (CREATE_INSTANT_INVITE 1<<0 … ADMINISTRATOR 1<<3 … VIEW_CHANNEL 1<<10, SEND_MESSAGES 1<<11, … CONNECT 1<<20, SPEAK 1<<21, MUTE_MEMBERS 1<<22, DEAFEN_MEMBERS 1<<23, MOVE_MEMBERS 1<<24, USE_VAD 1<<25, … STREAM 1<<9 …, USE_APPLICATION_COMMANDS 1<<31, … SEND_MESSAGES_IN_THREADS 1<<38 …). Serialized as decimal strings. The full table lives in `contracts/permissions.json`, which is generated from Discord's documented values.

**Permission computation**: Discord's algorithm.
1. Start from @everyone's base permissions, OR in the member's roles.
2. ADMINISTRATOR, or being the guild owner, grants all permissions.
3. Apply overwrites in order: @everyone overwrite, then role overwrites (all denies, then all allows), then the member overwrite.
4. Remove channel-scoped permissions when VIEW_CHANNEL is missing.

### P10. Data ownership

| Store | Owner | Contents |
|---|---|---|
| Postgres DB `discordy` | api (migrations in `api/migrations`, sqlx) | users, devices, key_packages, sessions, refresh_tokens, relationships, user_settings, channel_delivery_overrides, guilds, roles, members, member_roles, channels, permission_overwrites, invites, bans, emojis, applications, bot_tokens, application_commands, interactions, webhooks, audit_log, outbox |
| Postgres DB `discordy_admin` | admin-bff | usage rollups, feature_flags, admin_audit |
| ScyllaDB keyspace `discordy` | messages (CQL migrations in `messages/migrations`) | messages, reactions, pins, read_states, channel_last_message |
| Valkey | gateway (`gw:*`, `e2ee:*`, `voice:*`, `presence:*`); api (`rl:*`, `cache:*`) | |
| etcd | voice-signaling writes; gateway and admin-bff read | |
| MinIO | api (assets bucket); messages (attachments bucket); gitops (updates bucket) | |

### P11. Delivery-mode resolution (single implementation, in api)

```
effective(channel) =
  if channel.guild_id != null: channel.delivery_mode            # set by MANAGE_CHANNELS
  else: max_strictness( for u in recipients: override(u, channel) ?? settings(u).default_delivery_mode )
strictness: standard=0 < ephemeral=1 < p2p=2
constraints:
  - ephemeral is invalid for guild channels with >100 members who can view them → 400
  - p2p is invalid for guild channels, and for group DMs with >10 members → 400; falls back to ephemeral for resolution
```

---

## Workstreams

Each WS runs in its own repo, with its own agent, on `feature/<ws>-bootstrap`, which is merged into `develop` when green.

**Order**: WS0 and WS1 first, then WS2–WS9 in parallel against the pinned interfaces. WS10 integrates once the services build.

### WS0 — `contracts` (OpenAPI + JSON Schemas)

**Files:**
- `openapi/discordy.yaml`
- `schemas/gateway/*.json`
- `schemas/events/envelope.json`
- `schemas/voice/*.json`
- `permissions.json`, `intents.json`
- `codegen/` (scripts)
- `packages/ts/` (npm `@discordy-voics/contracts`)
- `packages/rust/` (crate `discordy-contracts`)
- `packages/elixir/` (generated constants module `Discordy.Contracts`)

**Tasks:**
- [ ] **Task 0.1 — Schemas**: write OpenAPI 3.1 covering every endpoint in P9, and JSON Schemas for every P7 opcode and dispatch payload, the P6 envelope and the P8 voice frames. Test: `pnpm validate` (redocly lint + ajv compile of all schemas) passes.
- [ ] **Task 0.2 — Constants and codegen**:
  - `permissions.json` and `intents.json` hold the exact Discord bit values.
  - Codegen produces TS types (openapi-typescript + json-schema-to-typescript), Rust types (typify) with permission/intent consts, and Elixir constants.
  - Test: a golden test asserts `ADMINISTRATOR == 8`, `VIEW_CHANNEL == 1024` and `CONNECT == 1048576` in all three languages.
- [ ] **Task 0.3 — CI**: `ci.yml` validates and runs codegen with a diff check. Release publishes the npm package to GitHub Packages and tags the crate (consumers use a git dependency with `tag = "vX.Y.Z"`).

### WS1 — `.github` (reusable workflows) + `gitops/local` (compose dev stack)

**Tasks:**
- [ ] **Task 1.1 — `discordy-voics/.github/.github/workflows/`**: reusable workflows `rust.yml`, `elixir.yml`, `node.yml`, `docker.yml`, `release-please.yml`, `gitflow-guard.yml`, `ghcr-retention.yml`.
  - `docker.yml`: buildx, OCI labels from inputs, push to GHCR with tags derived from the branch (`develop` → `X.Y.Z-dev.<run>`, `release/*` → `X.Y.Z-rc.<run>`, tag `vX.Y.Z` → `X.Y.Z`, `X.Y`, `latest`), cosign keyless signing, SBOM via syft, Trivy scan (fail on CRITICAL).
  - `gitflow-guard.yml`: fail when a PR to `main` doesn't come from `release/*` or `hotfix/*`, or a PR to `develop` doesn't come from `feature/*`, `release/*`, `hotfix/*` or `dependabot/*`.
  - `ghcr-retention.yml`: keep every stable version and the latest 5 prereleases.
  - Also: `profile/README.md`, issue/PR templates, `CODEOWNERS`.
  - `runs-on` takes an input defaulting to `ubuntu-latest`, overridable to `[self-hosted, discordy]`.
- [ ] **Task 1.2 — `gitops/local/compose.yaml`**: postgres (creates DBs `discordy` and `discordy_admin`), scylla (`--smp 1 --memory 1G --developer-mode 1`), redpanda (`--smp 1 --memory 1G`, topics from P6 created by an init container), valkey, etcd, minio (buckets created by an init container), coturn, caddy (routes from P1), victoriametrics, grafana.
  - Profile `deps` runs only infrastructure; profile `full` adds every service image at `:develop`.
  - Plus `gitops/local/.env.example` and `gitops/local/README.md`.
  - Test: `docker compose --profile deps up -d && ./local/smoke.sh` — every dependency becomes healthy.

### WS2 — `api` (Rust)

**Layout:**
- `crates/domain` (entities: User, Guild, Channel, Role, Member, Invite, Application, Permissions calculator, DeliveryMode resolver, Snowflake)
- `crates/application` (use cases + port traits: `UserRepository`, `GuildRepository`, `EventPublisher`, `PasswordHasher`, `TokenIssuer`, `Clock`, `IdGenerator`)
- `crates/infrastructure` (sqlx Postgres repos, outbox relay → rdkafka, argon2, ed25519 JWT, Valkey rate limiter, MinIO presign)
- `crates/interface` (axum routers, DTOs, extractors, error mapping)
- `bin/api` (composition root)
- `migrations/`

**Tasks** (each is TDD: failing test → implement → pass → commit):
- [ ] **2.1 Domain**: Snowflake generator (P5), permission computation (P9 algorithm, with table-driven tests that include overwrite precedence cases), delivery-mode resolver (P11, table-driven tests).
- [ ] **2.2 Persistence**: migrations for every P10 `discordy` table; repositories; integration tests with testcontainers Postgres.
- [ ] **2.3 Auth**: register, login, refresh rotation with reuse detection, logout, TOTP; Ed25519 JWT issuer (P3); internal introspect (P4).
- [ ] **2.4 Users and relationships**: users, settings, DMs/group DMs, devices, key packages (claim is atomic and single-use).
- [ ] **2.5 Guilds**: guilds, channels, roles, members, overwrites, bans, invites, emojis, audit log — each mutation writes an outbox event (P6) in the same transaction.
- [ ] **2.6 Outbox relay**: polls `outbox` with `FOR UPDATE SKIP LOCKED`, publishes to Redpanda (idempotent producer) and marks rows sent. Test: integration test with Redpanda via testcontainers.
- [ ] **2.7 Applications and bots**: applications, bot users and tokens, commands (global and guild), OAuth2 bot authorize, interactions (INTERACTION_CREATE published; callback endpoint), webhooks.
- [ ] **2.8 Internal and admin endpoints**: everything in P4 owned by api.
- [ ] **2.9 Rate limiting**: Valkey token buckets with the P9 headers.
- [ ] **2.10 Packaging**: Dockerfile, CI, README, ARCHITECTURE.md.

### WS3 — `messages` (Rust)

**Layout**: same crate split as api. Domain: Message, Attachment, Reaction, ReadState, Bucket.

**Tasks:**
- [ ] **3.1 Domain**: bucket math (P5); paging walks buckets backwards until `limit` is reached or the channel's creation bucket. Unit-tested.
- [ ] **3.2 ScyllaDB adapter**: CQL migrations (spec §6.2 plus reactions, pins, channel_last_message); prepared statements; integration tests against ScyllaDB in testcontainers.
- [ ] **3.3 Request coalescing**: a `Coalescer<K, V>` built on a `DashMap<K, Shared<BoxFuture>>`, so concurrent identical history reads share one ScyllaDB query. Test: 100 concurrent identical calls produce exactly 1 repository call.
- [ ] **3.4 Use cases**: create, edit, delete, bulk-delete, react, pin, ack, history. Permission checks via api `/internal/v1/channels/{id}/access/{user}` with a 5-second cache. Returns 409 (code 50160) when the delivery mode is not standard. Publishes to `discordy.message.v1`.
- [ ] **3.5 Attachments**: presigned upload to MinIO, attachment metadata on the message, CDN URLs.
- [ ] **3.6 Internal and admin stats** (P4). **3.7 Packaging**: Docker, CI, docs.

### WS4 — `gateway` (Elixir/Phoenix)

**Layout**: `lib/discordy_gateway/{domain,application,infrastructure,interface}`.

| Module | Role |
|---|---|
| `Session` | GenServer per connection |
| `Guild` | GenServer per guild, under a Horde/`:pg` registry |
| `Presence` | |
| `Fanout` | |
| `VoiceAllocator` | |
| `E2EEInbox` | |
| `Consumers` | brod group subscribers, one per topic |

**Tasks:**
- [ ] **4.1 Protocol codec**: op/close-code handling (P7), with tests for every opcode's decode/encode and the error close codes.
- [ ] **4.2 Session lifecycle**: HELLO → IDENTIFY (JWT verify; bot tokens via introspect) → READY (from api `/ready`) → heartbeat timeout; RESUME from the Valkey buffer; rate limit.
- [ ] **4.3 Guild processes**: lazily started from `/guilds/{id}/state`, with membership and permission caches kept current from `discordy.guild.v1` events; fan-out filtered by VIEW_CHANNEL and intents (permission algorithm ported from P9, with tests mirroring api's tables).
- [ ] **4.4 Consumers**: one consumer group per topic. Routing per P6; dedup LRU.
- [ ] **4.5 Presence and typing**: presence aggregated across a user's sessions; PRESENCE_UPDATE fanned out to guilds and friends.
- [ ] **4.6 Voice**: VoiceAllocator per P8 (eetcd watch, least-loaded selection, Valkey allocation, reallocation when a node vanishes); voice-state registry; VOICE_SERVER_UPDATE with the HS256 token; drain/undrain endpoints.
- [ ] **4.7 E2EE relay and P2P**: E2EE relay (op 20/21, Valkey streams, TTL sweeper, inbox replay after READY); P2P signal relay (op 22) delivered to online devices only — `{"error":"peer_offline"}` is returned as a DISPATCH `P2P_SIGNAL_FAILED`.
- [ ] **4.8 Telemetry and Watch Together**: VOICE_TELEMETRY published to Redpanda; WATCH_TOGETHER relay with the server clock.
- [ ] **4.9 Clustering and packaging**: libcluster (DNS strategy in k8s), internal admin stats, release, Dockerfile, CI, docs.

### WS5 — `voice` (Elixir signaling + Rust SFU)

**Layout:**
- `signaling/` (Phoenix app, no Ecto)
- `sfu/` (Rust workspace: `sfu-core` built on str0m; `sfu-control` for the NDJSON server; `bin/sfu`)

**Tasks:**
- [ ] **5.1 SFU core**:
  - Single UDP socket mux on port 50000.
  - One str0m `Rtc` per session, demultiplexed by ICE ufrag and source address.
  - ICE-lite, DTLS-SRTP.
  - Forward audio RTP to every other session in the same room.
  - Test: an integration test with two in-process str0m clients exchanging Opus packets.
- [ ] **5.2 Media**: video simulcast/SVC forwarding with per-subscriber layer selection from MEDIA_SINK_WANTS and bandwidth estimates; RTP sequence-number and timestamp rewriting across layer switches and DTX gaps (unit-tested rewriter); RTCP feedback (NACK/PLI/REMB/TWCC) forwarding and termination.
- [ ] **5.3 Control and observability**: control server (P8 NDJSON); speaking detection from the audio-level header extension; stats.
- [ ] **5.4 Signaling WebSocket**: the voice WS protocol (P8 opcodes); token verification (HS256); room registry; SPEAKING relay; CLIENTS_CONNECT/DISCONNECT; DAVE opcode relay (21–31) — the server acts as MLS external sender and relays proposals/commits; it never sees keys.
- [ ] **5.5 Discovery and recovery**: etcd lease registration (P8); load reporting; drain mode (stop accepting new sessions, keep existing ones); SFU supervisor (restart the SFU port process and replay sessions).
- [ ] **5.6 Packaging and regions**: Dockerfile with two images (`voice-signaling`, `voice-sfu`), CI, docs, and the `regionctl` CLI (Rust or bash) that writes a `gitops/regions/<name>/` overlay plus the Cloudflare DNS record via API.

### WS6 — `client` (Electron + React)

**Layout:**
- `apps/desktop/src/main` (main process)
- `src/preload`
- `src/renderer/{app,features,entities,shared}`
- `native/crypto` (napi-rs: OpenMLS, ed25519, SQLCipher via rusqlite+bundled-sqlcipher)

**Tasks:**
- [ ] **6.1 Shell and design system**: shell (security flags, typed IPC bridge, tray, deep links, single-instance); design-token system (dark, OLED, light, accent), primitives, layout (server rail, channel sidebar, chat, member list), command palette; Storybook-like `/__gallery` route for visual review.
- [ ] **6.2 Auth and connectivity**: auth screens; token storage in the OS keychain (keytar/safeStorage); REST client generated from contracts; gateway client (heartbeat, resume, reconnect with backoff) feeding the Zustand stores.
- [ ] **6.3 Servers and settings**: guilds and channels UI; server settings (roles editor with the permission matrix, channel overwrites, members, bans, invites, emojis, audit log); user settings (profile, privacy and delivery-mode defaults, voice and video, keybinds, appearance, notifications).
- [ ] **6.4 Messaging**: virtualized history, composer (markdown, mentions, emoji, replies, attachments with drag-drop), reactions, pins, threads, typing, unread badges, optimistic sends.
- [ ] **6.5 Delivery modes**: Ephemeral (MLS group per channel via the native module; op 20/21; local SQLCipher store) and P2P (WebRTC DataChannel; signaling via op 22; identity signature over the DTLS fingerprint; "peer offline" state); mode badge and per-chat/account switches.
- [ ] **6.6 Voice and video**: P8 client (synthesize SDP from the minimal payload); devices, VAD/PTT (global hotkey via uiohook-napi), RNNoise WASM worklet; per-user volume; video grid; screen share picker (desktopCapturer with Windows loopback audio, presets); stream viewer with PiP; DAVE-style frame E2EE through RTCRtpScriptTransform keyed from MLS exporter secrets; Watch Together panel.
- [ ] **6.7 Packaging**: electron-builder (NSIS for Windows as the primary target, dmg, AppImage/deb); electron-updater pointed at `UPDATE_FEED_URL`; Playwright end-to-end tests (login, send message, create guild).

### WS7 — `bots-sdk` + bot platform verification

**Tasks:**
- [ ] **7.1 SDK**: TypeScript `@discordy-voics/bots`: `Client` (gateway with intents, auto-resume), REST with rate-limit bucket handling, slash-command builder and registration, interaction handlers (reply, defer, follow-up, components, modals), webhooks. Unit tests with a mocked gateway.
- [ ] **7.2 Example bot**: `examples/moderation-bot` (`/ping`, `/kick`, buttons), plus docs.

### WS8 — `admin` (React + Rust BFF)

**Tasks:**
- [ ] **8.1 BFF**: axum + sqlx. Usage aggregator consuming every topic (counters only, **never message content**) into `discordy_admin` rollup tables (minute, hour, day); endpoints proxying P4 admin stats, VictoriaMetrics queries, etcd voice nodes, drain/undrain, user suspend, feature flags, admin audit. Auth: Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`, verified against the team JWKS) + `ADMIN_ALLOWED_EMAILS`; in local dev, a dev header.
- [ ] **8.2 Web**: React + Vite with the same design tokens as the client; Overview, Usage, Voice Regions (map/table, drain), Platform Health, Trust & Safety, Feature Flags, Audit pages; charts with Recharts following the dataviz guidance.

### WS9 — `gitops` (cluster) + VM platform

Blocked on the owner prerequisites: VM group access, GitHub org and scopes, Cloudflare token. Manifests can be written before then.

**Tasks:**
- [ ] **9.1 Repo layout**:
  - `clusters/gen-serv/{flux-system,infrastructure.yaml,configs.yaml,apps.yaml,regions.yaml}`
  - `infrastructure/controllers/{ingress-nginx,external-secrets,openbao,actions-runner-controller,headlamp,victoria-metrics,grafana,cloudflared,coturn,etcd}`
  - `infrastructure/data/{postgres(CloudNativePG),scylla(single-node StatefulSet, developer mode),redpanda(StatefulSet),valkey,minio}`
  - `infrastructure/configs/{cluster-config.yaml, cluster-secret-store.yaml, namespaces}`
  - `apps/{api,messages,gateway,admin}` (base + production overlays)
  - `regions/{_template,nl-home}`
  - Every hostname comes from `cluster-config` via `postBuild.substituteFrom`.
  - Image automation: `ImageRepository` + `ImagePolicy` (semver `>=0.1.0`) + `ImageUpdateAutomation` on `main`.
  - Test: `kustomize build` + kubeconform on every path in CI.
- [ ] **9.2 Secrets**:
  - `.github/workflows/secrets-sync.yml` runs on `[self-hosted, discordy]` and writes GitHub secrets to OpenBao `kv/discordy/<service>`.
  - `ExternalSecret` per app.
  - `docs/secrets/inventory.yaml` check.
- [ ] **9.3 Bring-up on the VM**:
  1. Inventory the cluster.
  2. Enable microk8s addons `dns`, `hostpath-storage` and `metrics-server`.
  3. `flux bootstrap github --owner discordy-voics --repository gitops --private --path clusters/gen-serv`.
  4. Initialize and unseal OpenBao (keys to 1Password via `op`).
  5. Create the Cloudflare tunnel and DNS records via API.
  6. Install ARC with a runner scale set labeled `discordy`.
  7. Verify Headlamp at `discordy-headlamp.voics.nl`.

### WS10 — `docs` + Notion

**Tasks:**
- [ ] **10.1 C4 model**: `c4/workspace.dsl` (Structurizr) with the C1 context, C2 containers, a C3 component view per service and C4 code views for the key modules (permission calculator, coalescer, SFU forwarder, VoiceAllocator); deployment views for `gen-serv` and the region template. CI renders SVGs (structurizr-cli export to PlantUML/Mermaid → SVG).
- [ ] **10.2 ADRs and references**: ADRs 0001–0012 (spec §14); service catalog; `secrets/inventory.yaml` + rendered `secrets/README.md`; protocol references (gateway, voice, events) generated from contracts.
- [ ] **10.3 Runbooks and guides**:
  - Runbooks: `voice-regions/{adding-a-region,draining-a-region,failover,troubleshooting}.md`, `openbao-unseal.md`, `backup-restore.md`, `secret-rotation.md`, `release.md`, `local-development.md`.
  - `CONTRIBUTING.md`: Clean Code rules, layering, git-flow, commit format.
- [ ] **10.4 Notion mirror**: create the "Discordy" page tree in Notion (by the coordinator via the Notion connector), plus a `notion-sync` workflow (Notion API token in org secret `NOTION_TOKEN`) that mirrors markdown on merges to `main`.

### WS11 — Integration and release (coordinator)

**Tasks:**
- [ ] **11.1 Local end-to-end**: run the full compose stack; client end-to-end tests: register → create guild → send message → second user receives it over the gateway; ephemeral message delivered and deleted from Valkey after ACK; P2P message delivered with zero server writes; voice call between two clients with audio flowing through the SFU.
- [ ] **11.2 Publish**: create the GitHub repos, push `main` + `develop`, set secrets, run CI, cut `v0.1.0` via release/0.1.0 → main, build the installers.
- [ ] **11.3 Deploy**: bring up WS9 on the VM; verify Flux reconciles, the apps are healthy and the admin portal shows usage.
