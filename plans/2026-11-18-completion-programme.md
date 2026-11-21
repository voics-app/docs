# Completion programme: clients, features and platform

Requested by the owner on 18 November 2026. Starting inventory: 81 open cards on
the existing GitHub project plus three open issues missing from the board: 84 initial
issues. Four coordination/presence/iOS/guides issues bring the owned inventory to 88.
This programme tracks delivery; an assigned item is not automatically complete.

## Documentation and verified snapshot

The coordinator has spawned all ten requested workstreams in scheduled waves.
The checked items below reflect independently recorded completion only, not every
merged PR. At this snapshot, TestFlight client#311, notifier deployment gitops#69
and the specific JWT audit cleanup api#79 have recorded closure. Other cards still
require their own implementation, review, release or real-device acceptance.

- [Mobile user guide, Dutch](../handbook/14-handleiding-mobiele-app.md)
- [Desktop user guide, Dutch](../handbook/15-handleiding-desktop.md)
- [Extra server, prepare-only](../runbooks/server-uitbreiden.md)
- [Backup plan, not activated](../runbooks/backup-restore.md)
- [Current evidence and owner dependencies](../handbook/16-status-en-beheerkeuzes.md)
- [Notion publication verification](../runbooks/notion-publicatie-controleren.md)
- [Community contracts](../protocols/community-settings.md) and [message metadata](../protocols/message-metadata.md)

The older master plan is historical design. Runtime corrections and supplementary
contracts in these documents take precedence over obsolete no-user-data, deployed
backup-job or universal Snowflake-generator assumptions. GitHub remains the source
of the latest per-card acceptance, and the coordinator controls status changes.

## Owner requirements

- Address every open feature, Ready, In progress and In review card; audit existing
  implementations before rebuilding features already present.
- Ten autonomous GPT-6-astra agents at max reasoning, scheduled in waves because
  this environment allows three active subagents alongside the coordinator.
- The coordinator independently reviews changes, tests integration and controls
  merges, releases and the project board. Agents do not approve their own delivery.
- Prepare easy additional-server provisioning, joining, load balancing, replica
  scaling, verification and safe removal. Do not create a server or migrate the
  live cluster during this programme without a later explicit instruction.
- Fix iPhone background presence: default Away, explicit Online respected, and
  Invisible/Do not disturb preserved. Explain native lifecycle limitations.
- Fix iOS video calls and screen sharing with platform-appropriate consent and
  capture lifecycle. Android tests alone cannot validate iOS ReplayKit.
- Install and exercise Voics in an existing Android emulator. Verify review cards
  using real user flows where applicable, alongside regression and integration tests.
- Write mobile and desktop user guides, a step-by-step server expansion guide and
  a backup plan. Publish through this repository's existing Notion mirror and
  verify the resulting pages. Backup activation is outside this prepare-only request.

## Delivery rules

Use isolated worktrees and feature/release Git flow. Preserve existing user work.
Never touch the former product VM at 192.168.1.204. Production is gen-serv at
192.168.1.212. Do not blindly increase stateful replicas or duplicate Snowflake
worker IDs. A second worker adds capacity but is not a three-member HA quorum.

Move a card to In progress only when that work is active. Move to In review when
an implementation or reviewable decision is ready. Close only after the relevant
acceptance criteria are checked, documentation is updated, required CI is green,
and deployment/native verification requirements are explicitly recorded.
Record genuine external prerequisites without pretending they have passed.

The existing GitHub registry/ARC credential failure remains a deployment
prerequisite. Credentials must be replaced through the established secret flow;
do not reuse the owner's broad GitHub CLI OAuth token as a cluster credential.

## Work allocation

### api_community

- [ ] [api#32](https://github.com/voics-app/api/issues/32): Discord parity: GIF picker (Tenor-compatible provider proxy)
- [ ] [api#33](https://github.com/voics-app/api/issues/33): Discord parity: stickers (server stickers and a built-in pack)
- [ ] [api#34](https://github.com/voics-app/api/issues/34): Discord parity: threads parity (browse, join/leave, archive, lock, private threads, members)
- [ ] [api#35](https://github.com/voics-app/api/issues/35): Discord parity: forum channels parity (tags, sorting, guidelines, post list)
- [ ] [api#36](https://github.com/voics-app/api/issues/36): Discord parity: announcement channels: follow and crosspost
- [ ] [api#39](https://github.com/voics-app/api/issues/39): Discord parity: AutoMod rules (keywords, spam, mention spam, link filter)
- [ ] [api#40](https://github.com/voics-app/api/issues/40): Discord parity: rules screening, onboarding and welcome screen
- [ ] [api#43](https://github.com/voics-app/api/issues/43): Discord parity: profile parity (pronouns, per-server profile, profile theme colors, banner per server)
- [ ] [api#44](https://github.com/voics-app/api/issues/44): Discord parity: server templates and create-from-template
- [ ] [api#45](https://github.com/voics-app/api/issues/45): Discord parity: server discovery and community features
- [ ] [api#49](https://github.com/voics-app/api/issues/49): Discord parity: scheduled events
- [ ] [api#50](https://github.com/voics-app/api/issues/50): Discord parity: embedded activities (games and apps in voice channels)
- [ ] [api#53](https://github.com/voics-app/api/issues/53): Discord parity: voice channel status text and Server Insights data
- [ ] [api#85](https://github.com/voics-app/api/issues/85): Audit log: per-server on/off switch and per-role configuration
- [ ] [api#96](https://github.com/voics-app/api/issues/96): Vanity URL for servers (GET/PATCH /guilds/{id}/vanity-url, resolve in /invites/{code})
- [ ] [api#102](https://github.com/voics-app/api/issues/102): Community request: native ban appeal form

### api_identity_safety

- [ ] [api#19](https://github.com/voics-app/api/issues/19): Discord parity: WebAuthn passkeys as a second factor
- [ ] [api#41](https://github.com/voics-app/api/issues/41): Discord parity: privacy and safety settings (who can DM or friend you, DM spam filter, message requests)
- [ ] [api#46](https://github.com/voics-app/api/issues/46): Discord parity: linked accounts (connections) and profile display
- [ ] [api#47](https://github.com/voics-app/api/issues/47): Discord parity: data export and request
- [ ] [api#48](https://github.com/voics-app/api/issues/48): Discord parity: member pruning
- [x] [api#79](https://github.com/voics-app/api/issues/79): Specific RUSTSEC-2026-0387 ignore removed after JWT dependency update and independent audit; unrelated documented advisory exceptions remain
- [ ] [api#98](https://github.com/voics-app/api/issues/98): Community request: hide profile badges
- [ ] [api#103](https://github.com/voics-app/api/issues/103): Community request: favourite friends and a friend invite link
- [ ] [api#121](https://github.com/voics-app/api/issues/121): Find out why logout_all_revokes_every_other_session_and_keeps_the_current_one failed once
- [ ] [api#126](https://github.com/voics-app/api/issues/126): Report a message or user: API route (needed for the App Store)

### cluster_expansion

- [ ] [gitops#6](https://github.com/voics-app/gitops/issues/6): Router port forwards: UDP 50000, UDP/TCP 3478, UDP 49160-49170 to 192.168.1.212
- [ ] [gitops#18](https://github.com/voics-app/gitops/issues/18): Discord parity: precondition-checked ScyllaDB cluster operations
- [ ] [gitops#21](https://github.com/voics-app/gitops/issues/21): Prepare cluster for 3 nodes (2 new nodes): HA control plane, storage, replication
- [ ] [gitops#22](https://github.com/voics-app/gitops/issues/22): Migrate gen-serv from microk8s to RKE2 + Rancher
- [ ] [gitops#27](https://github.com/voics-app/gitops/issues/27): Dev/test environment: whole suite from develop (incl. website) on its own subdomains
- [ ] [gitops#28](https://github.com/voics-app/gitops/issues/28): IaC: one-command environment provisioning (Terraform for Proxmox + bootstrap + Flux + secrets + seed)
- [ ] [gitops#48](https://github.com/voics-app/gitops/issues/48): OpenBao transit seal against a second OpenBao (follow-up to ADR-0021)
- [x] [gitops#69](https://github.com/voics-app/gitops/issues/69): Notifier deployment and synced APNs/FCM secrets independently verified; actual device push remains separate
- [ ] [gitops#117](https://github.com/voics-app/gitops/issues/117): No off-site backup exists

### desktop_features

- [ ] [client#61](https://github.com/voics-app/client/issues/61): Discord parity: integrations and webhooks management UI
- [ ] [client#63](https://github.com/voics-app/client/issues/63): Discord parity: passkey sign-in and enrolment UI
- [ ] [client#64](https://github.com/voics-app/client/issues/64): Discord parity: localisation: language picker and translated UI
- [ ] [client#69](https://github.com/voics-app/client/issues/69): Discord parity: OAuth2 authorize screen and authorized apps
- [ ] [client#73](https://github.com/voics-app/client/issues/73): Discord parity: activity status: game detection, Rich Presence and overlay (phased)
- [ ] [client#74](https://github.com/voics-app/client/issues/74): Discord parity: streamer mode
- [ ] [client#75](https://github.com/voics-app/client/issues/75): Discord parity: account switching (multiple saved accounts)
- [ ] [client#76](https://github.com/voics-app/client/issues/76): Discord parity: age-restricted channels gate
- [ ] [client#79](https://github.com/voics-app/client/issues/79): Discord parity: report, safety centre and ephemeral message handling
- [ ] [client#91](https://github.com/voics-app/client/issues/91): Discord parity: server rail and server menu details (copy ID, hide muted channels, collapse all, drop indicators, muted state)
- [ ] [client#96](https://github.com/voics-app/client/issues/96): Discord parity: DM list and Friends page small interactions (Active Now column, row status text, hover close, typing)
- [ ] [client#98](https://github.com/voics-app/client/issues/98): Discord parity: server settings navigation details (Delete Server entry, Widget, Server Profile, unsaved bar)

### desktop_quality

- [ ] [client#24](https://github.com/voics-app/client/issues/24): Discord parity: route-level code splitting and boot budget
- [ ] [client#36](https://github.com/voics-app/client/issues/36): Camera background blur (later)
- [ ] [client#78](https://github.com/voics-app/client/issues/78): Discord parity: advanced voice and video settings
- [ ] [client#84](https://github.com/voics-app/client/issues/84): Discord parity: unread and mention surfaces (taskbar badge on Windows, tray state, window title, message sounds, notification rules, Esc to mark read)
- [ ] [client#113](https://github.com/voics-app/client/issues/113): Composer: reply @ping toggle and @silent messages
- [ ] [client#120](https://github.com/voics-app/client/issues/120): macOS client: dmg build, auto-update and website download
- [ ] [client#121](https://github.com/voics-app/client/issues/121): Linux client: AppImage + deb build, auto-update and website download
- [ ] [client#301](https://github.com/voics-app/client/issues/301): Refresh token lost if the app closes between rotation and saving

### docs_guides

- [ ] [docs#166](https://github.com/voics-app/docs/issues/166): Dutch mobile/desktop manuals, server preparation, backup plan and verified existing Notion mirror
- [ ] [docs#10](https://github.com/voics-app/docs/issues/10): Owner decisions & deferred owner actions (tracking list)
- [ ] [docs#69](https://github.com/voics-app/docs/issues/69): Branding: product name, domains and assets changeable from one place
- [ ] [docs#135](https://github.com/voics-app/docs/issues/135): Remove the Discordy name everywhere

### gateway_voice

- [ ] [gateway#11](https://github.com/voics-app/gateway/issues/11): Discord parity: zstd streaming compression for gateway frames
- [ ] [gateway#12](https://github.com/voics-app/gateway/issues/12): Discord parity: passive sessions with delta updates
- [ ] [gateway#16](https://github.com/voics-app/gateway/issues/16): Discord parity: voice permission parity (priority speaker, video/stream permissions, AFK channel)
- [ ] [gateway#17](https://github.com/voics-app/gateway/issues/17): Discord parity: QR code login (remote auth)
- [ ] [gateway#53](https://github.com/voics-app/gateway/issues/53): Event consumer caps at about 250 events/s under fan-out
- [ ] [gateway#56](https://github.com/voics-app/gateway/issues/56): Per-session memory on the cluster is far above the local benchmark
- [ ] [voice#7](https://github.com/voics-app/voice/issues/7): Discord parity: active health probing of voice nodes
- [ ] [voice#9](https://github.com/voics-app/voice/issues/9): Discord parity: stage channels (speakers, audience, request to speak)
- [ ] [voice#10](https://github.com/voics-app/voice/issues/10): Discord parity: soundboard
- [ ] [voice#28](https://github.com/voics-app/voice/issues/28): Flaky test: screen_share::watched_screen_share_is_forwarded_as_its_own_stream (and ~1.3 s first-join keyframe)

### ios_media

- [ ] [client#337](https://github.com/voics-app/client/issues/337): iOS video/screen-share capture lifecycle and ReplayKit; native build/tests passed, physical iPhone acceptance pending
- [ ] [client#275](https://github.com/voics-app/client/issues/275): Mobile: calls and Ephemeral messages need a native build

### messaging_notifications

- [ ] [api#20](https://github.com/voics-app/api/issues/20): Discord parity: bounded back-pressure for push notifications
- [ ] [api#93](https://github.com/voics-app/api/issues/93): Device push tokens API (APNs/FCM) for the mobile app
- [ ] [messages#10](https://github.com/voics-app/messages/issues/10): Discord parity: search index topology for guild message search
- [ ] [messages#14](https://github.com/voics-app/messages/issues/14): Discord parity: polls
- [ ] [messages#15](https://github.com/voics-app/messages/issues/15): Discord parity: voice messages
- [ ] [messages#23](https://github.com/voics-app/messages/issues/23): Notification settings: honour per-server/channel levels and mutes in push and mention counts
- [ ] [messages#37](https://github.com/voics-app/messages/issues/37): Persist and return the tts flag of messages (client#65)
- [ ] [messages#56](https://github.com/voics-app/messages/issues/56): Notifier worker: push notifications (APNs + FCM) from dispatch events
- [ ] [messages#60](https://github.com/voics-app/messages/issues/60): Community request: edit alt text and add or remove spoiler on attachments after sending
- [ ] [messages#61](https://github.com/voics-app/messages/issues/61): Community request: scheduled messages

### mobile_presence

- [ ] [client#336](https://github.com/voics-app/client/issues/336): Default Away on background, explicit Online preserved; code merged, release/end-to-end acceptance pending
- [ ] [client#203](https://github.com/voics-app/client/issues/203): Mobile app (iOS + Android): epic
- [ ] [client#204](https://github.com/voics-app/client/issues/204): Mobile M0: extract packages/core (domain, application, protocol clients) behind ports
- [ ] [client#206](https://github.com/voics-app/client/issues/206): Mobile M1: text MVP screens + TestFlight via EAS
- [ ] [client#289](https://github.com/voics-app/client/issues/289): Flaky: Composer attachment tests hit the 60 s timeout on CI
- [x] [client#311](https://github.com/voics-app/client/issues/311): External TestFlight group/link independently verified, builds 6/7 available, limit 100

### coordination

- [ ] [docs#165](https://github.com/voics-app/docs/issues/165): Complete the programme with independent acceptance, releases and truthful board updates
