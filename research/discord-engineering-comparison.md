# Discord engineering blog: comparison with Voics

- Status: accepted
- Date: 2026-10-18
- Tracking: [docs#9](https://github.com/voics-app/docs/issues/9)
- Scope: ten posts from the Discord engineering blog, compared with the spec, the ADRs and the code in the sibling repositories

## How to read this

Each section gives Discord's approach, our status and the issues filed. Status values:

- **Implemented**: the same technique or an equivalent is in the code, with file references.
- **Partial**: some of the technique exists, or the feature exists without the technique described.
- **Missing**: no equivalent exists in the code. The gap is either an issue or a recorded decision.

File references are relative to the repository named in the text. Every "missing" claim comes from a grep or read of the repository on `develop` (or `main` for client, which is the release branch), not from memory.

## Summary

| # | Post | Status | Issues |
|---|---|---|---|
| 1 | How Discord indexes trillions of messages | Partial (storage implemented, search missing) | [messages#10](https://github.com/voics-app/messages/issues/10) |
| 2 | How Discord indexes billions of messages | Missing | [messages#10](https://github.com/voics-app/messages/issues/10) |
| 3 | Encryption for voice and video on Discord | Partial | [voice#8](https://github.com/voics-app/voice/issues/8) |
| 4 | How Discord maintains performance while adding features | Partial | [client#24](https://github.com/voics-app/client/issues/24) |
| 5 | We care about your voice (engineering special) | Partial | [voice#7](https://github.com/voics-app/voice/issues/7) |
| 6 | Push request bursts with Elixir GenStage | Missing | [api#20](https://github.com/voics-app/api/issues/20) |
| 7 | Modernized MFA with WebAuthn | Missing | [api#19](https://github.com/voics-app/api/issues/19) |
| 8 | Reduced WebSocket traffic by 40 percent | Partial | [gateway#11](https://github.com/voics-app/gateway/issues/11), [gateway#12](https://github.com/voics-app/gateway/issues/12) |
| 9 | Automating ScyllaDB clusters at scale | Missing (single-node today) | [gitops#18](https://github.com/voics-app/gitops/issues/18) |
| 10 | App-wide keyboard navigation | Partial | [client#23](https://github.com/voics-app/client/issues/23) |

Issues are filed in the owning repository, labelled `type:feature`, assigned to the owner, set to milestone v0.1.0 and placed in the backlog column of the Voics project. Two of them are blocked on an owner decision or a dependency (see posts 3 and 1).

## 1. How Discord indexes trillions of messages

Source: <https://discord.com/blog/how-discord-indexes-trillions-of-messages>

**Discord's approach.** Elasticsearch on Kubernetes (ECK). Most indices use a single primary shard, with multi-shard indices only for very large guilds, because of the Lucene document limit. Guild messages are sharded by `guild_id` and DMs by `user_id`, and each DM is indexed under both participants. Indexing goes through a queue (Pub/Sub) into a message router that groups bulk requests per destination. Reindexing is a staged dual-write, backfill and cut-over.

**Our status: Partial.**

- Storage is implemented. Messages live in ScyllaDB in 10-day buckets, with request coalescing (`docs/adr/0010-scylladb-bucketing.md`, `messages/ARCHITECTURE.md`).
- Events are published as `discordy.message.v1` (`docs/adr/0012-search-deferred.md`), which a future indexer can consume.
- Search is missing. It is deferred by `docs/adr/0012-search-deferred.md` and excluded in spec section 1. Client README line 75 also excludes it.
- Search topology is now recorded as `docs/adr/0013-search-index-topology.md` (proposed), so the sharding and refresh decisions exist before the engine is chosen.

**Issues:** [messages#10](https://github.com/voics-app/messages/issues/10).

## 2. How Discord indexes billions of messages

Source: <https://discord.com/blog/how-discord-indexes-billions-of-messages>

**Discord's approach.** Self-hosted Elasticsearch. Sharding and routing sit in the application, not in the engine. A guild-to-shard mapping is persisted and cached, and allocation favours the less loaded shard. Indexing is lazy (on first search), with an initial pass over the last 7 days and a deep pass later. Only metadata is indexed, and content is read back from the message store. Refresh is controlled by the application with a dirty flag per guild, instead of the 1 s engine default.

**Our status: Missing.** There is no search index, no shard mapping and no refresh control. The design points that apply to us are recorded in `docs/adr/0013-search-index-topology.md`. The data model is compatible: the message store is the source of truth and Snowflake IDs already encode time, which allows ID-range queries.

**Issues:** [messages#10](https://github.com/voics-app/messages/issues/10), blocked on ADR-0013 acceptance and on the revisit conditions of ADR-0012.

## 3. Encryption for voice and video on Discord

Source: <https://discord.com/blog/encryption-for-voice-and-video-on-discord>, and the follow-up post "Every Voice and Video Call on Discord Is Now End-to-End Encrypted", which the first post links to. The first post is an early announcement and gives no protocol details, so the protocol facts below come from the follow-up.

**Discord's approach.** DAVE: an open, audited E2EE protocol for audio and video, built on MLS. Frames are encrypted with keys from the MLS group. Every call type except Stage is encrypted, and clients must support DAVE to join. The unencrypted fallback was being removed in early 2026.

**Our status: Partial.**

- Client DAVE is implemented: `client/apps/desktop/src/renderer/infrastructure/voice/daveSession.ts`. The session never reports active until an epoch key is installed, and it refuses to join when frames cannot be protected.
- Server routing is implemented: `voice/signaling/lib/discordy_voice/domain/dave.ex` relays MLS payloads without reading them. `voice/ARCHITECTURE.md` line 74 describes the behaviour.
- Encryption is opt-in for guild and DM calls. Spec section 7 says "always on in Ephemeral and P2P chats, opt-in per channel in Standard". `gateway/lib/discordy_gateway/domain/voice/voice_token_claims.ex` lines 31 and 32 apply the same rule.
- This is a product decision, not a defect. The owner must choose between keeping Standard calls opt-in and making E2EE the default.

**Issues:** [voice#8](https://github.com/voics-app/voice/issues/8) (decision).

## 4. How Discord maintains performance while adding features

Source: <https://discord.com/blog/how-discord-maintains-performance-while-adding-features> (2018)

**Discord's approach.** Code splitting by route with webpack, lazy animations, per-locale translations, and a chunk loader (`makeLazy`) that retries with backoff. Boot payload was about 700 KB.

**Our status: Partial.**

- Client performance is considered in the spec (section 10: virtualised message list, feature-sliced folders).
- Route and panel code splitting is missing. `grep -rn "React.lazy\|lazy(" client/apps/desktop/src` finds none. The only `loading="lazy"` uses are on images.
- No chunk-size budget runs in CI.
- Server-side performance work is tracked in the messages and gateway ADRs and is outside this post's scope.

**Issues:** [client#24](https://github.com/voics-app/client/issues/24).

## 5. We care about your voice (engineering special)

Source: <https://discord.com/blog/we-care-about-your-voice-engineering-special> (2016)

**Discord's approach.** A "curator" sends synthetic voice-like traffic to each voice server, removes unhealthy servers from allocation and notifies clients. Operators can blacklist servers, providers or regions. Servers can be drained so that sessions finish before maintenance. Clients resume after network changes.

**Our status: Partial.**

- Draining is implemented: `docs/runbooks/voice-regions/draining-a-region.md`, `gateway/ARCHITECTURE.md` (drain mark, around line 112).
- Failover is documented: `docs/runbooks/voice-regions/failover.md`.
- Lease-based liveness is implemented: 10 s etcd lease (spec section 7). Presence refresh is in `voice/signaling/lib/discordy_voice/infrastructure/node_presence.ex`.
- Client resume is implemented: `client/apps/desktop/src/renderer/infrastructure/gateway/gatewayClient.ts` handles RESUME, and the gateway keeps a resume buffer (`gateway/lib/discordy_gateway/application/ports/resume_store.ex`).
- Missing: active synthetic probing. A lease shows that a process is alive, not that media is healthy. Nothing in `voice` (excluding deps) probes nodes.

**Issues:** [voice#7](https://github.com/voics-app/voice/issues/7).

## 6. Push request bursts with Elixir GenStage

Source: <https://discord.com/blog/how-discord-handles-push-request-bursts-of-over-a-million-per-minute-with-elixirs-genstage>

**Discord's approach.** A GenStage producer and consumers with demand-driven back-pressure. Each consumer has at most 100 requests in flight and asks for more only after an acknowledgement. A bounded buffer absorbs bursts, and it drops requests when full, which Discord judged safer than stalling.

**Our status: Missing.** No push delivery exists. A search of `api`, `gateway`, `messages` and `voice` for fcm, firebase, apns and push_token finds nothing. The API publishes events through the outbox to Kafka-compatible topics (`api/crates/infrastructure/src/events/kafka.rs`), but no notification consumer reads them. The back-pressure design is recorded in `docs/adr/0016-push-backpressure.md` (proposed) so it is settled before push is built.

**Issues:** [api#20](https://github.com/voics-app/api/issues/20).

## 7. Modernized MFA with WebAuthn

Source: <https://discord.com/blog/how-discord-modernized-mfa-with-webauthn>

**Discord's approach.** WebAuthn added as an MFA factor next to TOTP. The server issues challenges, offers every registered factor, caches a successful MFA result briefly and uses backup codes for recovery. Native WebAuthn bridges were needed on desktop.

**Our status: Missing for WebAuthn; partial for MFA.**

- TOTP is implemented: `api/crates/application/src/ports/services.rs` (`TotpVerifier`), `api/crates/infrastructure/src/security/totp.rs`, `api/crates/application/src/use_cases/auth/disable_totp.rs`. The MFA-required error is in `api/crates/application/src/error.rs`.
- No WebAuthn code exists in `api` (`grep -ri webauthn api` finds nothing).
- No backup codes exist in `api/crates` (`grep -ri backup` finds nothing).
- Spec section 5 mentions only "optional TOTP 2FA". The choice is recorded in `docs/adr/0015-webauthn-second-factor.md` (proposed).

**Issues:** [api#19](https://github.com/voics-app/api/issues/19).

## 8. Reduced WebSocket traffic by 40 percent

Source: <https://discord.com/blog/how-discord-reduced-websocket-traffic-by-40-percent>

**Discord's approach.** Per-connection zstd streaming compression, replacing zlib streaming. Trained dictionaries were dropped because the gain was small. Passive Sessions V2 sends deltas to background sessions instead of full snapshots. Together they cut outbound gateway bandwidth by about 40%.

**Our status: Partial, and both halves are missing.**

- Compression: the gateway runs uncompressed JSON only. `gateway/lib/discordy_gateway/interface/router.ex` (around line 26) sets `compress: false`, and the endpoint accepts only `v=1&encoding=json`. The spec says "JSON in v1, ETF/zstd later" (section 8). The decision is recorded in `docs/adr/0014-gateway-compression.md` (proposed).
- Passive sessions: none. `grep -ri passive gateway/lib` finds nothing. Guild fan-out in `gateway/lib/discordy_gateway/application/guild.ex` sends the full stream.
- Gateway resume is implemented (`gateway/lib/discordy_gateway/application/ports/resume_store.ex`), which is the base that passive mode would reuse.

**Issues:** [gateway#11](https://github.com/voics-app/gateway/issues/11) (compression), [gateway#12](https://github.com/voics-app/gateway/issues/12) (passive sessions).

## 9. Automating ScyllaDB clusters at scale

Source: <https://discord.com/blog/how-discord-automates-scylladb-clusters-at-scale>

**Discord's approach.** A Rust control plane for ScyllaDB. Operations are idempotent tasks with preconditions and blocking condition checks, written as YAML workflows. Jobs resume from local state, failures are classed as recoverable or unrecoverable, and unrecoverable failures alert a webhook. Expansion is serial and zone-aware.

**Our status: Missing for multi-node operations.** The only deployment is one node in developer mode (`gitops/infrastructure/data/scylla/scylla.yaml`). `gitops/bootstrap/10-prepare-node.sh` sets the kernel I/O limit and nothing else is scripted. The backup policy is in `docs/runbooks/backup-restore.md`. A procedure runbook is added as `docs/runbooks/scylla-maintenance.md`. Automation waits until a second node exists.

**Issues:** [gitops#18](https://github.com/voics-app/gitops/issues/18).

## 10. App-wide keyboard navigation

Source: <https://discord.com/blog/how-discord-implemented-app-wide-keyboard-navigation>

**Discord's approach.** Keyboard operation for every interactive element. Native focus outlines were unreliable, so Discord built a `FocusRing` component, rendered in a scope at the app root, that follows its target, adapts radius and contrast, and tracks animated positions. It is open-sourced as `discord/focus-rings`.

**Our status: Partial.**

- Keyboard shortcuts are implemented for mute, deafen, palette, search, upload and channel switching, and bindings are user-configurable (`client/apps/desktop/src/renderer/interface/app/shortcuts.ts`, `prefsStore`).
- Escape closes popovers in several components (for example `features/chat/EmojiPopover.tsx`, `features/voice/Participants.tsx`).
- The focus indicator is weak. `client/apps/desktop/src/renderer/interface/shared/theme/base.css` line 26 sets `:focus { outline: none; }`, and line 27 adds a `:focus-visible` outline only where the browser supports it.
- There is no focus-ring component, no systematic ARIA audit and no keyboard-only flow tests.

**Issues:** [client#23](https://github.com/voics-app/client/issues/23) (priority p1, accessibility).

## Decisions added with this research

| ADR | Topic | Status |
|---|---|---|
| [0013](../adr/0013-search-index-topology.md) | Search index topology (per-guild shards, lazy indexing, refresh control) | proposed |
| [0014](../adr/0014-gateway-compression.md) | Gateway compression: per-connection zstd streaming, opt-in | proposed |
| [0015](../adr/0015-webauthn-second-factor.md) | WebAuthn as a second factor next to TOTP | proposed |
| [0016](../adr/0016-push-backpressure.md) | Push delivery with bounded back-pressure | proposed |

Runbook added: [Scylla maintenance](../runbooks/scylla-maintenance.md).

## Limits of this comparison

- The source posts do not always contain implementation detail. Where a post is an announcement, the status is taken from the linked follow-up or marked as not covered.
- "Missing" means absent from the repositories on their current branches. It does not mean a design was rejected, unless an ADR says so.
- Performance numbers quoted from Discord are their own measurements on their own infrastructure and are not targets for us.
