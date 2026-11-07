# Voics Platform — Design Specification

| | |
|---|---|
| Status | Draft — awaiting owner review |
| Date | 2026-10-16 |
| Owner | @oussamaelhajoui |
| GitHub org | `discordy-voics` (private repos) |
| Product name | **Voics** (lives at `discordy.voics.nl`; the earlier product on `voics.nl` / `app.voics.nl` is separate and untouched) |
| Scope | Full Discord-equivalent platform, excluding payments (Nitro, boosts, shop) |

## 1. Goals

1. A real-time chat, voice, video and screen-share platform with **feature parity with Discord** except payments.
2. **Architecture modelled on Discord's published engineering**:
   - Elixir gateway
   - Rust data services
   - ScyllaDB message store with bucketed partitions and request coalescing
   - Kafka-API event bus
   - Guild-allocated voice servers made of Elixir signaling plus a home-grown SFU
3. **Three message delivery modes**: Standard, Ephemeral (E2EE relay) and P2P. Each user configures them per chat or account-wide.
4. **Multi-region voice** where adding a region is a documented, mostly automated procedure.
5. Runs on the owner's Proxmox VM (microk8s), reconciled by Flux, monitored with Headlamp. Every hostname is configurable, with **no interference with `voics.nl` or `app.voics.nl`**.
6. **The codebase stays maintainable by any software engineer**:
   - Clean Architecture and SOLID principles
   - Documented decisions (ADRs)
   - C1–C4 diagrams
   - git-flow
   - Full CI/CD with semver images on GHCR
7. **Desktop client** installable on Windows (primary), macOS and Linux.
8. **Admin portal** showing usage, health, voice regions and trust & safety.

### Non-goals
- Payments and monetisation.
- Capturing DRM-protected video (Netflix etc.). That is circumvention of copy protection; **Watch Together** is offered instead.
- Full-text message search in v1. It needs an Elasticsearch-class engine and more RAM than the VM has; tracked as ADR-0012 (deferred). When it is revisited, the index layout follows ADR-0013 (proposed).
- Web and mobile clients in v1. The protocol is designed so they can be added later. (Mobile was requested on 2026-11-03: [plan](../plans/2026-11-03-mobile-app.md), [ADR 0024](../adr/0024-mobile-client-stack.md).)

## 2. Context (C1)

**Actors**
- **User**, using the desktop client.
- **Bot developer**, using the REST API, the gateway and `bots-sdk`.
- **Platform admin**, using the admin portal and Headlamp.

**External systems**
- Cloudflare: tunnel, TLS, Access.
- GitHub: source, Actions, GHCR, secrets.
- Notion: mirrored docs.
- The owner's router: UDP port forwards.

## 3. Containers (C2)

| Repo | Container(s) | Tech | Responsibility |
|---|---|---|---|
| `api` | api | Rust, Axum, SQLx, Postgres | Auth, users, devices, relationships, servers (guilds), channels, roles and permissions, invites, applications/bots, slash commands, interactions, webhooks, MLS key packages, admin endpoints, transactional outbox → Redpanda |
| `gateway` | gateway | Elixir, Phoenix, libcluster | Client WebSocket protocol, session processes, guild processes, presence, typing, fan-out, ephemeral ciphertext relay, P2P signaling, voice-server allocation |
| `messages` | messages | Rust, Axum, scylla driver | Standard message CRUD and history, Snowflake IDs, request coalescing, read states, attachments (MinIO) |
| `voice` | voice-signaling + sfu (one pod) | Elixir + Rust (str0m) | Discord-style voice server: voice WebSocket, media setup, speaking indicators, SFU forwarding, simulcast layer selection, RTP rewrite, RTCP/BWE, Watch Together clock |
| `admin` | admin-web + admin-bff | React/TS + Rust | Usage, health, regions, trust & safety, feature flags, audit |
| `client` | desktop app | Electron, React, TS, napi-rs (Rust) | End-user application |
| `bots-sdk` | npm package | TypeScript | Bot library |
| `contracts` | packages | OpenAPI 3.1, JSON Schema | Source of truth for REST and gateway payloads; generates Rust, Elixir and TS types; semver-versioned |
| `gitops` | — | Flux, Kustomize, Helm | Cluster, infrastructure, apps, regions, local compose |
| `docs` | — | Markdown, Structurizr DSL | This spec, ADRs, C4, runbooks, inventories |
| `.github` | — | GitHub Actions | Reusable workflows, org profile, templates |

**Data stores**

| Store | Contents |
|---|---|
| Postgres 17 | Relational data |
| ScyllaDB (developer mode on the single node) | Messages, read states |
| Redpanda | Kafka API, events |
| Valkey | Sessions/resume buffers, presence, rate limits, ephemeral inbox |
| etcd | Voice-server discovery |
| MinIO | Attachments, avatars, emoji, client update feed |

### 3.1 Communication rules
- **Queries** are synchronous: REST between client and services, internal HTTP/gRPC between services.
- **State changes** are published as events on Redpanda. Topics are partitioned by `channel_id` or `guild_id` so related events stay in order.
- **Delivery semantics**: at-least-once delivery, idempotent consumers, deduplication by Snowflake ID or event ID.
- **Outbox**: services writing to Postgres use a transactional outbox, so a committed change is never lost before it is published.

## 4. Code architecture (C3/C4 conventions — every service)

```
src/
  domain/          entities, value objects, domain events, domain errors — no framework/IO
  application/     use cases (one per file), ports (traits/behaviours) — orchestrates domain
  infrastructure/  adapters: postgres/scylla repos, redpanda producer, http clients
  interface/       http/ws handlers, DTO mapping, auth extractors
  main / application.ex  composition root: wires adapters into ports
```

- **Dependency rule**: dependencies point inward only, and `domain` has no dependencies.
- **Design**: SOLID; ports and adapters; constructor injection at the composition root; no global state; small functions with intention-revealing names (Clean Code).
- **Errors**: typed domain errors, mapped to the error envelope defined in `contracts`.
- **Config**: 12-factor; environment variables only, validated at startup.
- **Observability**: structured JSON logs, OpenTelemetry traces, Prometheus metrics at `/metrics`, health checks at `/healthz` and `/readyz`.

## 5. Identity, auth and permissions

- **Login**: email + password hashed with argon2id, plus optional 2FA. TOTP is implemented. WebAuthn passkeys as a second factor, with single-use backup codes for recovery, are proposed in ADR-0015 and tracked in [api#19](https://github.com/discordy-voics/api/issues/19).
- **Tokens**: 15-minute access JWTs signed with Ed25519, and rotating refresh tokens with reuse detection.
- **Devices**: each device has an Ed25519 identity key and uploads MLS key packages. Users can compare safety numbers.
- **Permissions**: Discord-compatible 64-bit permission bitfield, @everyone role, role hierarchy, and channel overwrites (role and member, allow/deny). Computed in `api`; cached and recomputed in guild processes.
- **Bots**: bot users authenticate with `Bot <token>` and receive OAuth2 `bot` + `applications.commands` scopes. Gateway intents apply, with the privileged ones (members, presence, message content) gated.

## 6. Messaging

### 6.1 Snowflake IDs
64-bit IDs laid out as 42 bits of milliseconds since the Voics epoch `2026-01-01T00:00:00Z`, 10 bits of worker ID (from the pod ordinal) and 12 bits of sequence.

### 6.2 Standard message storage (ScyllaDB)
```sql
CREATE TABLE messages (
  channel_id bigint, bucket int, message_id bigint,
  author_id bigint, content text, attachments list<frozen<attachment>>,
  embeds text, mentions set<bigint>, mention_roles set<bigint>,
  reply_to bigint, flags int, edited_at timestamp,
  PRIMARY KEY ((channel_id, bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);

CREATE TABLE read_states (
  user_id bigint, channel_id bigint, last_read_id bigint, mention_count int,
  PRIMARY KEY ((user_id), channel_id)
);
```
- **Buckets**: `bucket = floor(snowflake_ms / 10 days)`. History reads walk buckets backwards.
- **Data-service routing**: the `messages` service routes by consistent hash on `channel_id`, so one instance owns each channel's hot path.
- **Request coalescing**: identical concurrent reads are merged into a single in-flight ScyllaDB query.
- **Reactions and pins**: stored in their own tables, partitioned by the same `(channel_id, bucket)` key.

### 6.3 Fan-out
1. `messages` writes to ScyllaDB.
2. It publishes `message.created` to topic `messages.v1`, keyed by `channel_id`.
3. The gateway guild process consumes the event.
4. It filters recipients by VIEW_CHANNEL permission and the subscribed intents.
5. It dispatches `MESSAGE_CREATE` to their sessions.

The client resolves optimistic sends by matching nonces.

### 6.4 Delivery modes

| | Standard | Ephemeral | P2P |
|---|---|---|---|
| Crypto | TLS in transit | MLS (RFC 9420, OpenMLS) end-to-end | WebRTC DTLS data channel; fingerprint signed by device identity key |
| Server persistence | Plaintext in ScyllaDB | Ciphertext in a per-recipient-device Valkey stream (AOF on); **deleted on that device's ACK**; hard TTL 7 days | **None**. The gateway relays only opaque SDP/ICE; coturn relays DTLS bytes only when NAT requires it |
| Offline delivery | Yes | Yes (≤7 days) | No: "peer offline" |
| History / multi-device / edit / delete | Yes | Local encrypted store (SQLCipher) per device | Local encrypted store per device |
| Bots, embeds, server features | Yes | No | No |
| Allowed in | All channels | DMs, group DMs, guild channels ≤100 members | DMs, group DMs ≤10 members |

**How the effective mode is resolved**
- **DMs and group DMs**: effective mode = the strictest of the participants' settings (P2P > Ephemeral > Standard), where each participant's setting is their per-chat override, falling back to their account default.
- **Guild channels**: the mode is set by members holding MANAGE_CHANNELS. A user's account default does not apply there.
- **Mode changes** post a system notice in the chat. The composer always shows the active mode.

**What the server sees in private modes**: sender, recipients, timestamp and size. Content is never logged.

## 7. Voice, video and screen share

Modelled on *How Discord Handles 2.5M Concurrent Voice Users Using WebRTC*. Each row below adapts one element of that design:

| Element | Design |
|---|---|
| Voice server | One pod per node: `voice-signaling` (Elixir) controls a local `sfu` (Rust/str0m) over a Unix socket. Signaling issues stream IDs and keys and forwards speaking indicators. |
| Allocation | **All voice channels of a guild share one voice server.** The first joiner triggers the gateway guild process to pick the **least-utilised healthy server in the guild's region** from etcd. Region is set per guild and overridable per channel. |
| Discovery | Each voice server writes `/voics/voice/<region>/<node>` to etcd with a 10 s TTL lease, carrying users, CPU and egress. A missed lease removes it from allocation. Active synthetic probing that also removes degraded nodes is proposed in [voice#7](https://github.com/discordy-voics/voice/issues/7). |
| Handshake | `VOICE_STATE_UPDATE` (gateway) → `VOICE_SERVER_UPDATE {endpoint, token}` → client opens the **voice WebSocket** at `wss://discordy-rtc-<region>.voics.nl` → join payload of about 1 KB (SSRCs, codecs, crypto). The client synthesises SDP locally; the server is **ICE-lite**; there is no TURN for voice. Client IPs are never exposed to peers. |
| Media | Opus with FEC and **DTX**: no packets in silence, and the SFU rewrites RTP sequence numbers and timestamps. Video uses VP9 SVC, AV1 or H.264 simulcast with per-subscriber layer selection driven by RTCP/REMB/TWCC bandwidth estimation. |
| Failover | **SFU crash** → signaling restarts it and rebuilds state without client involvement (also used for zero-downtime upgrades). **Server loss or DDoS** → the lease expires or the node is drained → the client's voice WebSocket drops → the client asks the gateway → the guild process reassigns → the client reconnects. |
| E2EE | DAVE-style: frame-level encryption with keys derived from the call's MLS group. Always on in Ephemeral and P2P chats, opt-in per channel in Standard. Account setting `e2ee_calls_default` ("Encrypt all my calls end-to-end", default off): when on, every call the user starts or joins is E2EE, in DMs, group DMs, voice channels and Go Live ([voice#8](https://github.com/discordy-voics/voice/issues/8), owner decision 2026-10-19). Mixed calls (proposed, pending owner confirmation in [docs#10](https://github.com/discordy-voics/docs/issues/10)): if any participant has the setting on, or the channel requires E2EE, or someone already in the call is encrypted, the call is E2EE for everyone; participants who were not yet encrypted receive a new voice token with E2EE on. The setting does not change a call in progress, and a call stays E2EE until it empties. P2P-mode DM calls are direct peer connections with no SFU. DAVE is implemented on the client and in the signaling node. |
| E2EE when settings are unreadable | If the gateway cannot read the participants' `e2ee_calls_default` (Valkey unavailable), `E2EE_SETTINGS_UNAVAILABLE_POLICY` decides: `open` (default) joins unencrypted and logs a warning, `closed` encrypts the call, `wait` retries the read for about 2 s and then refuses the join with a `VOICE_JOIN_FAILED` error ([gateway#13](https://github.com/discordy-voics/gateway/issues/13)). |
| Screen share | Electron `desktopCapturer` (Windows Graphics Capture): screen, window or app, **with app/system audio** (Windows loopback). Presets 720p30, 1080p60, 1440p60 and Source. Hardware encode through Chromium. Several streams can be watched at once, with pop-out. DRM content renders black; **Watch Together** keeps play/pause/seek in sync while each participant plays from their own account. |
| Audio processing | WebRTC AEC/AGC, RNNoise (WASM), adjustable VAD, global push-to-talk, per-user volume. |
| Telemetry | Clients report jitter, loss, RTT and bitrate every 10 s → Redpanda → admin regions dashboard. |
| Limits | 25 cameras per channel (Discord parity). Server mute, deafen, move and disconnect; SPEAK, STREAM and USE_VAD permission bits. |

### 7.1 Regions
- **Template**: `gitops/regions/_template/` contains the voice-server Deployment (hostNetwork, UDP 50000), its ConfigMap and its secret references.
- **Adding a region**: `regionctl add <name> --node-endpoint <ip> --public-host <host>` copies the template, creates the DNS/Cloudflare entries and opens a PR. Once Flux reconciles, the node registers in etcd and starts receiving allocations.
- **Documentation**: the runbook `docs/runbooks/voice-regions/adding-a-region.md` is the authoritative procedure. Drain, failover and troubleshooting runbooks sit alongside it, plus one C4 deployment diagram per region.

## 8. Gateway protocol (summary; full schema lives in `contracts`)

**Opcodes**

| Op | Name |
|---|---|
| 0 | DISPATCH |
| 1 | HEARTBEAT |
| 2 | IDENTIFY |
| 3 | PRESENCE_UPDATE |
| 4 | VOICE_STATE_UPDATE |
| 6 | RESUME |
| 7 | RECONNECT |
| 8 | REQUEST_GUILD_MEMBERS |
| 9 | INVALID_SESSION |
| 10 | HELLO |
| 11 | HEARTBEAT_ACK |
| 20 | E2EE_ENVELOPE |
| 21 | E2EE_ACK |
| 22 | P2P_SIGNAL |

**Behaviour**
- **Encoding**: JSON in v1. Per-connection zstd streaming is proposed as an opt-in, negotiated at connect time (ADR-0014, [gateway#11](https://github.com/discordy-voics/gateway/issues/11)). ETF comes later.
- **Background clients**: passive sessions that receive deltas instead of the full dispatch stream are proposed in [gateway#12](https://github.com/discordy-voics/gateway/issues/12).
- **Resume**: sessions are resumable for 2 minutes from a Valkey resume buffer.
- **Intents**: follow the Discord model.

## 9. Bots

- **Applications**: an application has a bot user, an invite URL with a permissions integer, and intents.
- **Commands and interactions**: slash commands (global and guild), user/message context menus, components (buttons, selects), modals, and interaction responses (deferred, follow-up).
- **Webhooks**: incoming and interaction webhooks.
- **Rate limits**: Discord-style buckets with `X-RateLimit-*` headers.
- **SDK**: `bots-sdk` (TypeScript) plus an example bot.

## 10. Client

- **Main process**: Electron. Handles tray, global hotkeys, capture picker, auto-update (electron-updater from the public `updates.<domain>` MinIO feed), notifications and `voics://` deep links. Push delivery to offline devices is not built. When it is, back-pressure follows ADR-0016 (proposed).
- **Renderer**:
  - Security: `contextIsolation` and sandboxing, with a typed preload bridge.
  - Stack: React, TS and Vite, with feature-sliced folders.
  - State: Zustand stores fed by gateway events, TanStack Query for REST.
  - Message list: virtualised.
- **Native crypto**: Rust via napi-rs (OpenMLS, identity keys), with keys in the OS keychain and local history in SQLCipher.
- **Design**:
  - Token-based design system with dark, OLED and light themes and an accent picker.
  - Glass surfaces, Inter + JetBrains Mono, 8 px rhythm.
  - Spring motion that honours reduced-motion settings.
  - Keyboard operation for every interactive element, with a visible focus indicator (at least 3:1 contrast) in every theme. Tracked in [client#23](https://github.com/discordy-voics/client/issues/23).
  - Command palette (Ctrl+K), animated speaking rings, a screen-share stage with PiP, and a delivery-mode badge.
  - Key screens are mocked and reviewed before being built.
- **Packaging**: electron-builder producing an NSIS installer (Windows, primary), dmg (macOS) and AppImage/deb (Linux). Unsigned at first; signing is added later.
- **Parity list**:
  - **Structure**: servers, categories, and text, voice, announcement, forum and stage channels, threads.
  - **Messages**: replies, reactions, custom emoji, mentions, pins, embeds, attachments, typing, read states and unread badges.
  - **People**: friends, DMs and group DMs, presence and custom status, profiles, invites.
  - **Server administration**: server settings (roles, overwrites, members, bans, audit log, basic AutoMod).
  - **Voice and media**: voice, video, screen share, Watch Together.
  - **Settings**: notification settings and keybinds.

## 11. Admin portal

- **Access**: Cloudflare Access plus the `platform_admin` role; all actions are audited.
- **Dashboards**:
  - **Usage**: DAU/MAU, concurrent sessions, messages per minute by mode (counts only), voice minutes, active calls, growth.
  - **Regions**: load, users, egress, etcd health and client quality, with drain/undrain controls.
  - **Platform**: service health, Redpanda lag, DB latency, gateway sessions per node, error rates.
  - **Trust & safety**: search, suspend/ban, reports (Standard content only), rate-limit overrides, feature flags.
- **Data**: rollups in Postgres, maintained by an aggregator that consumes Redpanda; plus VictoriaMetrics queries.

## 12. Infrastructure

- **Cluster**: existing microk8s 1.35 on `gen-serv` (192.168.1.212). Namespaces `voics-apps`, `voics-data`, `voics-voice`, `voics-system`, `observability` and `flux-system`. Existing workloads are inventoried first and left untouched.
- **Flux**: bootstrapped to `discordy-voics/gitops` with the layout `clusters/gen-serv/{infrastructure,apps,regions}.yaml`. Infrastructure is split into controllers and configs, and applied in dependency order. Image automation follows semver tags from GHCR and commits the bumps to git.
- **Ingress**: `cloudflared` → ingress-nginx → services, with TLS at Cloudflare.
- **Router forwards**: UDP **50000** (SFU) and UDP **3478** (coturn, P2P fallback only).
- **Hostnames** live in the `cluster-config` ConfigMap and are substituted through Flux `postBuild`, so every hostname is configurable. Cloudflare's free Universal SSL only covers `*.voics.nl`, so **every hostname is exactly one level deep**. Defaults:

  | Host | Serves | Path |
  |---|---|---|
  | `discordy.voics.nl` | Landing page + download page | tunnel |
  | `discordy-api.voics.nl` | REST API | tunnel |
  | `discordy-gateway.voics.nl` | Gateway WebSocket | tunnel |
  | `discordy-rtc-<region>.voics.nl` | Voice WebSocket for a region | tunnel |
  | `discordy-admin.voics.nl` | Admin portal (Cloudflare Access) | tunnel |
  | `discordy-headlamp.voics.nl` | Headlamp (Cloudflare Access) | tunnel |
  | `discordy-updates.voics.nl` | Client auto-update feed (MinIO) | tunnel |
  | `discordy-cdn.voics.nl` | Attachments/avatars (MinIO, signed URLs) | tunnel |

  Voice media (UDP 50000) and coturn (UDP 3478) cannot go through Cloudflare's proxy. Each region's public IP is configured in the region's ConfigMap and sent to clients in the voice join payload. DNS records are created through the Cloudflare API from the `regionctl` / gitops workflows, on the account that already hosts `voics.nl`.
- **Monitoring**: Headlamp (behind Cloudflare Access), VictoriaMetrics + Grafana, OpenTelemetry collector. The host's Prometheus snap is left untouched.
- **Secrets**:
  1. Values are stored in GitHub org and environment secrets.
  2. A `secrets-sync` workflow runs on the in-cluster self-hosted runner (Actions Runner Controller) and writes them to OpenBao KV v2.
  3. External Secrets Operator syncs them into Kubernetes Secrets.

  OpenBao unseal keys are kept in 1Password. `docs/secrets/inventory.yaml` lists every secret, and a CI check enforces it.
- **Capacity**: the VM has 7.6 GB RAM. Every component has requests and limits set, ScyllaDB runs in developer mode (1 core, about 1.5 GB) and Redpanda with `--smp 1 --memory 1G`. Raising the VM to 16 GB is recommended.

## 13. CI/CD and git-flow

- **Branches**: `main` (released), `develop` (integration), `feature/*`, `release/*` and `hotfix/*`. Every commit follows Conventional Commits.
- **Reusable workflows** in `discordy-voics/.github`, run in this order:
  1. lint
  2. test
  3. build
  4. scan: gitleaks, Trivy, cargo-audit, sobelow, npm audit
  5. SBOM (syft)
  6. push to GHCR, with OCI labels for title, description, source, version, revision and licenses
  7. cosign signature
- **Versions**:

  | Branch | Version |
  |---|---|
  | `develop` | `X.Y.Z-dev.N` |
  | `release/*` | `X.Y.Z-rc.N` |
  | merged to `main` | release-please tags `vX.Y.Z` and creates the changelog and GitHub Release |
- **GitHub Free workarounds**:
  - Heavy builds run on the in-cluster runner.
  - GHCR retention workflow keeps the last 5 prereleases and all stable versions.
  - macOS client builds run on release only.
  - git-flow is enforced by a CI check rather than branch protection, because rulesets are unavailable for private repos on Free.
- **Local development**: `gitops/local/compose.yaml` runs the full stack; each service also runs natively against it with `make dev`.

## 14. Documentation

- **`docs` repo contents**:
  - This spec.
  - ADRs in MADR format: 0001 stack, 0002 repo-per-service, 0003 delivery modes, 0004 custom SFU, 0005 Cloudflare tunnel, 0006 secrets flow, 0007 GitHub Free workarounds, 0008 microk8s reuse, 0009 Redpanda over Kafka, 0010 ScyllaDB bucketing, 0011 no DRM capture / Watch Together, 0012 search deferred.
  - C1–C4 diagrams in Structurizr DSL, with SVGs rendered by CI.
  - Service catalog.
  - Secrets inventory.
  - Protocol references.
  - Runbooks: voice regions (add, drain, failover), OpenBao unseal, backup/restore, secret rotation, release.
  - Local setup and contributing guides.
- **Notion**: the `docs` repo is mirrored to a Notion "Voics" page tree on every merge to `main`. Git stays the source of truth.

## 15. Testing

- **Unit**: domain and application layers, written test-first.
- **Integration**: testcontainers with Postgres, ScyllaDB and Redpanda.
- **Contract**: tests against `contracts`.
- **Gateway**: protocol conformance tests.
- **SFU**: loss/jitter simulator and forwarding correctness tests.
- **Client**: Playwright end-to-end tests.
- **Load**: k6 against the gateway and messages.

## 16. Delivery order

1. **Foundation**: org, repos, `.github`, `contracts`, `docs` + C4, local compose.
2. **Platform**: Flux, OpenBao, External Secrets, ingress, cloudflared, runner, Headlamp, monitoring.
3. **Core services, in parallel agents**: `api`, `messages`, `gateway`, `voice`, client shell + design system.
4. **Feature layer**: bots + SDK, admin, private delivery modes end-to-end, Notion sync.
5. **Release**: hardening, load tests, `v0.1.0` release + installers.

## 17. Owner prerequisites

1. **Create the org** `discordy-voics` on GitHub Free.
2. **Widen the token scopes**: `gh auth refresh -s admin:org,workflow,write:packages,delete:packages`.
3. **On the VM**: `sudo usermod -aG microk8s karma && sudo chown -R karma ~/.kube`. Passwordless sudo is optional.
4. **Cloudflare**: an API token (Zone:DNS:Edit + Account:Cloudflare Tunnel:Edit + Access:Edit) for the `voics.nl` zone, stored as the GitHub org secret `CLOUDFLARE_API_TOKEN`. Voics creates its own tunnel and DNS records.
5. **Router**: forward UDP 50000 and 3478 to 192.168.1.212.
