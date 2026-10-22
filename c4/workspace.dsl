/*
 * Discordy — C4 model (Structurizr DSL)
 *
 * Source of truth for every architecture diagram in the docs repo.
 *   C1  System context
 *   C2  Containers
 *   C3  One component view per service
 *   C4  Code views for the permission calculator, request coalescer,
 *       SFU forwarder and VoiceAllocator (code elements are modelled as
 *       components tagged "Code" and hidden from the C3 views)
 *   Deployment views for gen-serv and the voice-region template
 *
 * Render locally with `make render` (see c4/README.md). CI re-renders on
 * every change and commits the result under c4/rendered/.
 */
workspace "Discordy" "Discord-equivalent chat, voice, video and screen-share platform (no payments)." {

    !identifiers flat
    !impliedRelationships false

    model {

        properties {
            "structurizr.groupSeparator" "/"
        }

        # ------------------------------------------------------------------
        # People (C1 actors)
        # ------------------------------------------------------------------
        user = person "User" "Chats, talks, streams and watches together using the desktop client."
        botDeveloper = person "Bot developer" "Builds bots with bots-sdk against the REST API and the gateway."
        platformAdmin = person "Platform admin" "Operates the platform through the admin portal and Headlamp."

        # ------------------------------------------------------------------
        # External systems
        # ------------------------------------------------------------------
        cloudflare = softwareSystem "Cloudflare" "Tunnel, DNS for voics.nl, TLS (Universal SSL) and Access." "External"
        github = softwareSystem "GitHub" "Source, Actions, GHCR images, org/environment secrets." "External"
        notion = softwareSystem "Notion" "Read-only mirror of the docs repo." "External"
        router = softwareSystem "Owner's router" "Forwards UDP 50000 (SFU) and UDP 3478 (coturn) to the cluster node." "External"
        thirdPartyBot = softwareSystem "Third-party bot" "A bot built on bots-sdk, run by a bot developer." "External"
        onePassword = softwareSystem "1Password" "Holds the OpenBao unseal keys and root token." "External"

        # ------------------------------------------------------------------
        # Discordy (C2 containers, C3 components, C4 code elements)
        # ------------------------------------------------------------------
        discordy = softwareSystem "Discordy" "Real-time chat, voice, video and screen share with three delivery modes." {

            # ---------------- client ----------------
            client = container "Desktop client" "End-user application for Windows (primary), macOS and Linux." "Electron, React, TypeScript, napi-rs" "Desktop" {
                clMain = component "Main process" "Window lifecycle, tray, global hotkeys, voics:// deep links, notifications, single instance." "Electron main"
                clUpdater = component "Auto-updater" "Checks the update feed and installs new versions." "electron-updater"
                clCapture = component "Capture picker" "Screen/window/app capture with Windows loopback audio and quality presets." "desktopCapturer"
                clPreload = component "Preload bridge" "Typed, minimal IPC surface exposed to the sandboxed renderer." "contextBridge"
                clFeatures = component "Feature slices" "Guilds, chat, DMs, voice stage, settings, server settings, command palette." "React, feature-sliced"
                clStores = component "Stores" "Client state fed by gateway dispatches; REST cache." "Zustand, TanStack Query"
                clRest = component "REST client" "Typed client generated from contracts; rate-limit aware." "TypeScript"
                clGateway = component "Gateway client" "Heartbeat, resume, reconnect with backoff, op 20/21/22 handling." "WebSocket"
                clVoice = component "Voice client" "Voice WebSocket, local SDP synthesis, simulcast, DAVE frame E2EE, RNNoise, VAD/PTT." "WebRTC"
                clEphemeral = component "Ephemeral mode" "MLS group per chat; encrypts/decrypts E2EE envelopes." "TypeScript"
                clP2P = component "P2P mode" "WebRTC data channels; identity-signed DTLS fingerprints." "WebRTC"
                clNative = component "Native crypto" "OpenMLS, Ed25519 identity keys, SQLCipher local history, OS keychain." "Rust, napi-rs"
            }

            # ---------------- api ----------------
            api = container "api" "Auth, users, devices, relationships, guilds, channels, roles, permissions, invites, bots, interactions, webhooks, MLS key packages, admin endpoints; transactional outbox." "Rust, Axum, SQLx" "Service" {
                apiPublicHttp = component "Public REST" "/api/v1 routers, DTO mapping, Discord-style error envelope." "axum" "Interface"
                apiInternalHttp = component "Internal REST" "/internal/v1: introspect, ready, guild state, channel access, admin." "axum" "Interface"
                apiAuthMw = component "Auth & rate-limit middleware" "Bearer/Bot token extraction, X-Internal-Token check, X-RateLimit-* headers." "axum extractors" "Interface"
                apiAuthUc = component "Auth use cases" "Register, login, TOTP, refresh rotation with reuse detection, logout, introspect." "Rust" "Application"
                apiUsersUc = component "User use cases" "Profiles, settings, relationships, DMs, devices, single-use key-package claims, delivery-mode overrides." "Rust" "Application"
                apiGuildsUc = component "Guild use cases" "Guilds, channels, roles, members, overwrites, bans, invites, emojis, audit log." "Rust" "Application"
                apiAppsUc = component "Application use cases" "Applications, bot users and tokens, slash commands, OAuth2 bot authorize, interactions, webhooks." "Rust" "Application"
                apiAdminUc = component "Admin use cases" "Stats, user search, suspension, guild search." "Rust" "Application"
                apiPermissions = component "Permission calculator" "Discord's algorithm: base permissions, administrator/owner, overwrites, implicit denies." "Rust (domain)" "Domain"
                apiDelivery = component "Delivery-mode resolver" "P11: strictest of participants for DMs, channel setting for guilds, size constraints." "Rust (domain)" "Domain"
                apiSnowflake = component "Snowflake generator" "42-bit ms since 2026-01-01, 10-bit worker (0-63), 12-bit sequence." "Rust (domain)" "Domain"
                apiRepos = component "Postgres repositories" "Implements the repository ports; writes outbox rows in the same transaction." "sqlx" "Infrastructure"
                apiOutbox = component "Outbox relay" "Polls outbox FOR UPDATE SKIP LOCKED and publishes with an idempotent producer." "Kafka client" "Infrastructure"
                apiTokens = component "Token issuer" "Ed25519 (EdDSA) access JWTs, opaque refresh tokens, bot tokens." "ed25519" "Infrastructure"
                apiHasher = component "Password hasher" "argon2id." "argon2" "Infrastructure"
                apiRateLimiter = component "Rate limiter" "Token buckets in Valkey (rl:*)." "redis client" "Infrastructure"
                apiPresigner = component "Asset presigner" "Presigned URLs for avatars, icons and emoji in the assets bucket." "S3 client" "Infrastructure"

                # C4 code: permission calculator
                pcPermissionCalculator = component "PermissionCalculator" "Pure service: compute(guild, member, channel?) -> Permissions." "struct" "Code,CodePermissions"
                pcPermissions = component "Permissions" "u64 bitfield value object: contains, insert, remove, all(); serialised as a decimal string." "newtype" "Code,CodePermissions"
                pcGuildContext = component "GuildContext" "owner_id, @everyone role, roles by id." "struct" "Code,CodePermissions"
                pcMemberContext = component "MemberContext" "user_id and assigned role ids." "struct" "Code,CodePermissions"
                pcOverwrite = component "PermissionOverwrite" "id, kind (role|member), allow, deny." "struct" "Code,CodePermissions"
                pcBase = component "compute_base_permissions" "@everyone | member roles; ADMINISTRATOR or owner short-circuits to all()." "fn" "Code,CodePermissions"
                pcOverwrites = component "apply_overwrites" "@everyone overwrite, then role denies, role allows, then the member overwrite." "fn" "Code,CodePermissions"
                pcImplicit = component "apply_implicit_denies" "Strips channel-scoped bits when VIEW_CHANNEL is missing; text bits when SEND_MESSAGES is missing." "fn" "Code,CodePermissions"
            }

            # ---------------- messages ----------------
            messages = container "messages" "Standard message CRUD and history, Snowflake IDs, request coalescing, reactions, pins, read states, attachments." "Rust, Axum, scylla driver" "Service" {
                msgPublicHttp = component "Public REST" "/api/v1/channels/{id}/messages*, reactions, pins, ack, attachments." "axum" "Interface"
                msgInternalHttp = component "Internal REST" "last-message-id and admin stats (counts only)." "axum" "Interface"
                msgAuth = component "Auth extractor" "Verifies EdDSA JWTs locally; introspects bot tokens via api (60 s cache)." "axum extractor" "Interface"
                msgUseCases = component "Message use cases" "Create, edit, delete, bulk delete, react, pin, ack, history; 409/50160 for non-standard channels." "Rust" "Application"
                msgAttachUc = component "Attachment use cases" "Presigned uploads, attachment metadata and CDN URLs." "Rust" "Application"
                msgDomain = component "Message domain" "Message, Attachment, Reaction, ReadState, Bucket math, backwards bucket walk." "Rust (domain)" "Domain"
                msgSnowflake = component "Snowflake generator" "Worker range 64-127." "Rust (domain)" "Domain"
                msgAccess = component "Channel access client" "GET /internal/v1/channels/{id}/access/{user} with a 5 s cache." "reqwest" "Infrastructure"
                msgCoalescer = component "Request coalescer" "Merges identical concurrent history reads into one in-flight query." "Rust" "Infrastructure"
                msgScylla = component "ScyllaDB repositories" "Prepared statements over (channel_id, bucket) partitions." "scylla" "Infrastructure"
                msgPublisher = component "Event publisher" "Publishes to discordy.message.v1 keyed by channel_id." "Kafka client" "Infrastructure"
                msgPresigner = component "Attachment presigner" "Presigned PUT/GET on the attachments bucket." "S3 client" "Infrastructure"

                # C4 code: request coalescer
                coCoalescer = component "Coalescer<K, V>" "get_or_load(key, loader): joins an in-flight future or starts one; removes the entry on completion." "generic struct" "Code,CodeCoalescer"
                coInFlight = component "InFlight map" "DashMap<K, Shared<BoxFuture<Result<V, E>>>>." "DashMap" "Code,CodeCoalescer"
                coKey = component "HistoryQuery" "Coalescing key: channel_id, bucket, before/after/around, limit." "struct (Hash + Eq)" "Code,CodeCoalescer"
                coDecorator = component "CoalescingMessageRepository" "Decorator implementing MessageRepository; routes reads through the coalescer, writes straight through." "struct" "Code,CodeCoalescer"
                coPort = component "MessageRepository" "Port used by the history use case." "trait" "Code,CodeCoalescer"
                coScylla = component "ScyllaMessageRepository" "Adapter executing the prepared CQL statement." "struct" "Code,CodeCoalescer"
                coHistory = component "GetHistory" "Use case: walks buckets backwards until limit or the channel's first bucket." "struct" "Code,CodeCoalescer"
            }

            # ---------------- gateway ----------------
            gateway = container "gateway" "Client WebSocket protocol, sessions, guild processes, presence, typing, fan-out, E2EE relay, P2P signaling, voice allocation." "Elixir, Phoenix, libcluster" "Service" {
                gwSocket = component "Gateway socket" "/gateway?v=1&encoding=json transport; close codes 4000-4014." "Phoenix socket" "Interface"
                gwCodec = component "Protocol codec" "Encodes/decodes {op, d, s, t} frames for every P7 opcode." "Elixir" "Interface"
                gwInternalHttp = component "Internal HTTP" "Admin stats, voice node drain/undrain." "Plug" "Interface"
                gwSession = component "Session" "GenServer per connection: identify, heartbeat, sequence, resume buffer, 120/60 s rate limit." "GenServer" "Application"
                gwGuild = component "Guild process" "GenServer per guild: members, roles, channels, permission cache, voice state." "GenServer" "Application"
                gwRegistry = component "Guild registry" "Cluster-wide process registry and lazy start." "Horde / :pg" "Application"
                gwFanout = component "Fan-out" "Filters recipients by VIEW_CHANNEL and intents; dispatches to sessions." "Elixir" "Application"
                gwPermissions = component "Permission calculator" "Port of api's algorithm, tested with the same tables." "Elixir (domain)" "Domain"
                gwPresence = component "Presence" "Aggregates a user's sessions; PRESENCE_UPDATE to guilds and friends." "Elixir" "Application"
                gwVoiceAllocator = component "Voice allocator" "Picks the least-utilised healthy voice node in the guild's region; reallocates on loss." "GenServer" "Application"
                gwVoiceStates = component "Voice-state registry" "Who is in which voice channel; VOICE_STATE_UPDATE fan-out." "Elixir" "Application"
                gwE2EE = component "E2EE inbox" "Per-device ciphertext streams, ACK deletion, 7-day TTL sweeper, replay after READY." "Elixir" "Application"
                gwP2P = component "P2P relay" "Relays op 22 to online devices only; never persists." "Elixir" "Application"
                gwWatch = component "Watch Together relay" "Relays op 24 with the server clock." "Elixir" "Application"
                gwConsumers = component "Event consumers" "One consumer group per topic; P6 routing; 10k-entry dedup LRU." "brod" "Infrastructure"
                gwApiClient = component "api client" "ready, guild state, channel access, introspect." "Req" "Infrastructure"
                gwValkey = component "Valkey adapter" "gw:*, e2ee:*, voice:*, presence:* keys." "Redix" "Infrastructure"
                gwEtcd = component "etcd watcher" "Watches /discordy/voice/nodes/." "eetcd" "Infrastructure"
                gwTelemetry = component "Telemetry publisher" "VOICE_TELEMETRY and USAGE_TICK to discordy.telemetry.v1." "brod" "Infrastructure"

                # C4 code: VoiceAllocator
                vaAllocator = component "VoiceAllocator" "allocate(srv_id, channel) / reallocate(node_id); one per guild (or DM channel)." "GenServer" "Code,CodeVoiceAllocator"
                vaRegion = component "RegionResolver" "Channel override, else guild voice_region, else DEFAULT_VOICE_REGION." "pure module" "Code,CodeVoiceAllocator"
                vaSelector = component "NodeSelector" "Non-draining node with the fewest users; ties broken by cpu_pct." "pure module" "Code,CodeVoiceAllocator"
                vaNode = component "VoiceNode" "node_id, region, ws_url, public_ip, udp_port, users, cpu_pct, egress_bps, draining, version." "struct" "Code,CodeVoiceAllocator"
                vaDirectory = component "NodeDirectory" "Port: list(region), subscribe(region)." "behaviour" "Code,CodeVoiceAllocator"
                vaEtcdDirectory = component "EtcdNodeDirectory" "Adapter: etcd prefix watch with lease-expiry removal." "module" "Code,CodeVoiceAllocator"
                vaStore = component "AllocationStore" "Port: get/put/delete voice:alloc:<srv_id>." "behaviour" "Code,CodeVoiceAllocator"
                vaValkeyStore = component "ValkeyAllocationStore" "Adapter over Redix." "module" "Code,CodeVoiceAllocator"
                vaTokens = component "VoiceTokenSigner" "HS256 JWT, 60 s: sub, sid, srv, chn, node, e2ee." "module" "Code,CodeVoiceAllocator"
                vaNotifier = component "VoiceServerNotifier" "Sends VOICE_SERVER_UPDATE {token, guild_id, channel_id, endpoint, region} to sessions." "module" "Code,CodeVoiceAllocator"
            }

            # ---------------- voice ----------------
            voiceSignaling = container "voice-signaling" "Voice WebSocket, media setup, speaking indicators, DAVE MLS relay, etcd registration, SFU supervision." "Elixir, Phoenix" "Service" {
                vsSocket = component "Voice socket" "/voice transport, P8 opcodes." "Phoenix socket" "Interface"
                vsCodec = component "Voice codec" "Encodes/decodes {op, d} frames." "Elixir" "Interface"
                vsTokens = component "Token verifier" "Verifies HS256 voice tokens (node, srv, chn, expiry)." "Elixir" "Application"
                vsRooms = component "Room registry" "Rooms per server/channel, CLIENTS_CONNECT/DISCONNECT, SPEAKING relay." "Registry" "Application"
                vsSession = component "Voice session" "Process per client: IDENTIFY, SELECT_PROTOCOL, SESSION_DESCRIPTION, MEDIA_SINK_WANTS." "GenServer" "Application"
                vsDave = component "DAVE relay" "MLS external sender; relays proposals, commits and welcomes; never sees keys." "Elixir" "Application"
                vsDrain = component "Drain controller" "Stops new sessions while keeping existing ones." "Elixir" "Application"
                vsSfuClient = component "SFU control client" "NDJSON over TCP 127.0.0.1:4101." "gen_tcp" "Infrastructure"
                vsSupervisor = component "SFU supervisor" "Restarts the SFU and replays create_session for every live session." "Supervisor" "Infrastructure"
                vsRegistrar = component "etcd registrar" "Lease (10 s TTL, 3 s refresh) at /discordy/voice/nodes/<region>/<node_id> with load." "eetcd" "Infrastructure"
            }

            sfu = container "sfu" "Home-grown selective forwarding unit: ICE-lite, DTLS-SRTP, simulcast/SVC layer selection, RTP rewrite, RTCP/BWE." "Rust, str0m" "Service" {
                sfuUdp = component "UDP mux" "Single socket on UDP 50000." "tokio UdpSocket" "Infrastructure"
                sfuDemux = component "Session demux" "Routes datagrams by ICE ufrag (STUN) then by source address." "Rust" "Application"
                sfuRtc = component "Peer session" "One str0m Rtc per client: ICE-lite, DTLS-SRTP, RTP/RTCP." "str0m" "Infrastructure"
                sfuRooms = component "Room table" "Sessions per room, published tracks, subscriptions." "Rust" "Application"
                sfuForwarder = component "Forwarding engine" "Forwards audio to every other member; selects video layers per subscriber." "Rust" "Domain"
                sfuRtcp = component "RTCP handler" "Terminates/forwards NACK, PLI, REMB, TWCC." "Rust" "Application"
                sfuSpeaking = component "Speaking detector" "Audio-level header extension to speaking events." "Rust" "Domain"
                sfuControl = component "Control server" "NDJSON on 127.0.0.1:4101: create_session, close_session, set_sink_wants." "tokio TcpListener" "Interface"
                sfuStats = component "Stats" "Per-session bitrate/loss, Prometheus metrics." "Rust" "Infrastructure"

                # C4 code: SFU forwarder
                fwForwarder = component "Forwarder" "on_packet(from, MediaPacket) -> Vec<(SessionId, MediaPacket)>." "struct" "Code,CodeForwarder"
                fwRoom = component "Room" "Members, published tracks by SSRC, subscriptions." "struct" "Code,CodeForwarder"
                fwPacket = component "MediaPacket" "ssrc, rid/spatial/temporal layer, seq, timestamp, marker, payload, keyframe flag." "struct" "Code,CodeForwarder"
                fwSubscription = component "Subscription" "Subscriber, source track, current and target layer, rewriter state." "struct" "Code,CodeForwarder"
                fwSelector = component "LayerSelector" "Target layer from MEDIA_SINK_WANTS quality and the subscriber's bandwidth estimate; switches on keyframes." "struct" "Code,CodeForwarder"
                fwWants = component "SinkWants" "Map ssrc -> quality 0-100 from MEDIA_SINK_WANTS." "struct" "Code,CodeForwarder"
                fwBwe = component "BandwidthEstimate" "Latest REMB/TWCC estimate per subscriber." "struct" "Code,CodeForwarder"
                fwRewriter = component "RtpRewriter" "Continuous seq/timestamp across layer switches and DTX gaps; outbound SSRC per subscription." "struct" "Code,CodeForwarder"
            }

            # ---------------- admin ----------------
            adminWeb = container "admin-web" "Admin SPA: overview, usage, voice regions, platform health, trust & safety, feature flags, audit." "React, TypeScript, Vite" "WebApp" {
                awPages = component "Pages" "Overview, Usage, Voice Regions, Platform Health, Trust & Safety, Feature Flags, Audit." "React" "Interface"
                awCharts = component "Charts" "Usage and health charts using the shared design tokens." "Recharts" "Interface"
                awApi = component "admin-api client" "Typed fetch client for /admin-api/*." "TypeScript" "Infrastructure"
            }

            adminBff = container "admin-bff" "Admin backend: Access verification, usage aggregation, stats proxying, regions, drain, suspension, flags, audit." "Rust, Axum, SQLx" "Service" {
                abHttp = component "admin-api" "/admin-api/* routes and the built SPA." "axum" "Interface"
                abAuth = component "Access verifier" "Validates Cf-Access-Jwt-Assertion against the team JWKS, then ADMIN_ALLOWED_EMAILS." "axum extractor" "Interface"
                abUseCases = component "Admin use cases" "Usage queries, region view, drain/undrain, suspend, feature flags." "Rust" "Application"
                abAudit = component "Admin audit" "Records every admin action." "Rust" "Application"
                abAggregator = component "Usage aggregator" "Consumes every topic; counters only (never content); minute/hour/day rollups." "Kafka client" "Infrastructure"
                abRepo = component "Rollup repository" "discordy_admin: rollups, feature_flags, admin_audit." "sqlx" "Infrastructure"
                abStats = component "Internal stats client" "P4 admin endpoints of api, messages and gateway." "reqwest" "Infrastructure"
                abMetrics = component "Metrics client" "PromQL/MetricsQL queries." "reqwest" "Infrastructure"
                abNodes = component "Voice node reader" "Reads /discordy/voice/nodes/." "etcd client" "Infrastructure"
            }

            # ---------------- data stores ----------------
            postgres = container "Postgres" "Relational data (DB discordy, owned by api) and admin rollups (DB discordy_admin)." "Postgres 17 (CloudNativePG)" "Database"
            scylla = container "ScyllaDB" "Messages, reactions, pins, read states, channel_last_message (keyspace discordy)." "ScyllaDB 2025.x, developer mode" "Database"
            redpanda = container "Redpanda" "Event bus: discordy.{guild,message,user,interaction,telemetry,audit}.v1." "Redpanda 25.x (Kafka API)" "Queue"
            valkey = container "Valkey" "Resume buffers, presence, rate limits, voice allocations, E2EE inboxes (AOF on)." "Valkey 8" "Database"
            etcd = container "etcd" "Voice-server discovery under leased keys." "etcd 3.6" "Database"
            minio = container "MinIO" "Assets, attachments and the client update feed." "MinIO (S3 API)" "Database"
            coturn = container "coturn" "TURN relay for P2P data channels when NAT requires it (never for voice)." "coturn" "Service"
            victoria = container "VictoriaMetrics" "Metrics storage and query." "VictoriaMetrics" "Database"
        }

        # ==================================================================
        # Relationships
        # ==================================================================

        # ---- C1 ----
        user -> discordy "Chats, calls, streams" "HTTPS, WSS, UDP"
        botDeveloper -> thirdPartyBot "Writes and runs"
        thirdPartyBot -> discordy "Calls REST API, connects to gateway" "HTTPS, WSS"
        platformAdmin -> discordy "Operates via admin portal and Headlamp" "HTTPS"
        discordy -> cloudflare "Exposed through tunnel; DNS records managed via API" "HTTPS"
        router -> discordy "Forwards voice media and TURN" "UDP 50000, UDP/TCP 3478"
        github -> discordy "Builds images, syncs secrets, Flux source" "HTTPS"
        discordy -> notion "Docs mirrored on merge to main" "HTTPS"
        platformAdmin -> onePassword "Retrieves unseal keys"

        # ---- C2: people and externals to containers ----
        user -> client "Uses"
        thirdPartyBot -> api "REST /api/v1 with Bot token" "HTTPS"
        thirdPartyBot -> gateway "Gateway with intents" "WSS"
        platformAdmin -> adminWeb "Uses (behind Cloudflare Access)" "HTTPS"
        client -> cloudflare "Reaches every public hostname" "HTTPS, WSS"
        client -> router "Sends voice media to region public IP" "UDP 50000"
        router -> sfu "Forwards" "UDP 50000"
        router -> coturn "Forwards" "UDP/TCP 3478"

        # ---- C2: container to container ----
        client -> api "Auth, guilds, users, devices" "HTTPS/JSON"
        client -> messages "Message history and sends (routed by ingress)" "HTTPS/JSON"
        client -> gateway "Real-time events, E2EE envelopes, P2P signaling" "WSS/JSON"
        client -> voiceSignaling "Voice WebSocket" "WSS/JSON"
        client -> sfu "Voice, video and screen share" "DTLS-SRTP over UDP"
        client -> coturn "P2P relay when NAT requires it" "TURN"
        client -> minio "Downloads attachments and updates" "HTTPS (signed URLs)"

        api -> postgres "Reads/writes relational data and outbox" "SQL"
        api -> redpanda "Publishes guild, user, interaction, audit events" "Kafka"
        api -> valkey "Rate limits and caches" "RESP"
        api -> minio "Presigns asset uploads" "S3"
        api -> messages "Last message ids" "HTTP /internal/v1"

        messages -> scylla "Reads/writes messages" "CQL"
        messages -> redpanda "Publishes message events" "Kafka"
        messages -> minio "Presigns attachment uploads" "S3"
        messages -> api "Channel access, bot token introspection" "HTTP /internal/v1"

        gateway -> api "Ready payload, guild state, access, introspect" "HTTP /internal/v1"
        gateway -> messages "Last message ids" "HTTP /internal/v1"
        gateway -> redpanda "Consumes all topics; publishes telemetry" "Kafka"
        gateway -> valkey "Sessions, resume buffers, presence, voice allocations, E2EE inboxes" "RESP"
        gateway -> etcd "Watches voice nodes" "gRPC"

        voiceSignaling -> sfu "Controls sessions" "NDJSON over TCP 127.0.0.1:4101"
        voiceSignaling -> etcd "Registers node under a lease" "gRPC"
        voiceSignaling -> redpanda "Publishes voice quality telemetry" "Kafka"

        adminWeb -> adminBff "Calls /admin-api" "HTTPS/JSON"
        adminBff -> postgres "Rollups, flags, admin audit (discordy_admin)" "SQL"
        adminBff -> redpanda "Consumes every topic for counters" "Kafka"
        adminBff -> api "Admin stats, users, suspension" "HTTP /internal/v1"
        adminBff -> messages "Message stats" "HTTP /internal/v1"
        adminBff -> gateway "Session stats, drain/undrain" "HTTP /internal/v1"
        adminBff -> victoria "Queries metrics" "HTTP"
        adminBff -> etcd "Reads voice nodes" "gRPC"

        # ---- C3: client ----
        clMain -> clUpdater "Starts"
        clMain -> clCapture "Opens on screen-share request"
        clMain -> clPreload "Exposes IPC through"
        clFeatures -> clPreload "Calls native features through"
        clFeatures -> clStores "Reads/writes"
        clStores -> clRest "Fetches via"
        clGateway -> clStores "Feeds dispatches into"
        clFeatures -> clVoice "Joins calls with"
        clFeatures -> clEphemeral "Sends ephemeral messages with"
        clFeatures -> clP2P "Sends P2P messages with"
        clEphemeral -> clGateway "Sends op 20/21 through"
        clP2P -> clGateway "Signals via op 22 through"
        clEphemeral -> clNative "MLS operations, local history"
        clP2P -> clNative "Identity signatures, local history"
        clVoice -> clNative "DAVE key derivation"
        clVoice -> clCapture "Gets capture streams from"
        clUpdater -> minio "Downloads updates from" "HTTPS"
        clRest -> api "Calls" "HTTPS/JSON"
        clRest -> messages "Calls" "HTTPS/JSON"
        clGateway -> gateway "Connects to" "WSS"
        clVoice -> voiceSignaling "Connects to" "WSS"
        clVoice -> sfu "Streams media to" "DTLS-SRTP/UDP"
        clP2P -> coturn "Relays through when needed" "TURN"

        # ---- C3: api ----
        apiPublicHttp -> apiAuthMw "Guarded by"
        apiInternalHttp -> apiAuthMw "Guarded by"
        apiPublicHttp -> apiAuthUc "Invokes"
        apiPublicHttp -> apiUsersUc "Invokes"
        apiPublicHttp -> apiGuildsUc "Invokes"
        apiPublicHttp -> apiAppsUc "Invokes"
        apiInternalHttp -> apiAuthUc "Introspect"
        apiInternalHttp -> apiGuildsUc "Ready, guild state, channel access"
        apiInternalHttp -> apiAdminUc "Admin endpoints"
        apiAuthMw -> apiRateLimiter "Consumes tokens from"
        apiAuthMw -> apiTokens "Verifies tokens with"
        apiAuthUc -> apiHasher "Hashes and verifies passwords with"
        apiAuthUc -> apiTokens "Issues tokens with"
        apiAuthUc -> apiRepos "Persists sessions and refresh tokens"
        apiUsersUc -> apiDelivery "Resolves effective delivery mode"
        apiUsersUc -> apiRepos "Reads/writes"
        apiUsersUc -> apiSnowflake "Generates ids"
        apiGuildsUc -> apiPermissions "Authorises with"
        apiGuildsUc -> apiDelivery "Validates channel delivery mode"
        apiGuildsUc -> apiRepos "Reads/writes (with outbox)"
        apiGuildsUc -> apiSnowflake "Generates ids"
        apiGuildsUc -> apiPresigner "Presigns icons and emoji"
        apiAppsUc -> apiPermissions "Checks bot permissions"
        apiAppsUc -> apiRepos "Reads/writes (with outbox)"
        apiAppsUc -> apiTokens "Issues bot tokens"
        apiAdminUc -> apiRepos "Queries"
        apiOutbox -> apiRepos "Claims unsent rows from"
        apiRepos -> postgres "SQL" "sqlx"
        apiOutbox -> redpanda "Publishes" "Kafka"
        apiRateLimiter -> valkey "rl:* buckets" "RESP"
        apiPresigner -> minio "Presigns" "S3"
        apiUsersUc -> messages "Last message ids" "HTTP"

        # ---- C4: permission calculator ----
        pcPermissionCalculator -> pcBase "1. computes base with"
        pcPermissionCalculator -> pcOverwrites "2. applies channel overwrites with"
        pcPermissionCalculator -> pcImplicit "3. applies implicit denies with"
        pcBase -> pcGuildContext "Reads @everyone and role permissions from"
        pcBase -> pcMemberContext "Reads role ids from"
        pcOverwrites -> pcOverwrite "Folds"
        pcBase -> pcPermissions "Returns"
        pcOverwrites -> pcPermissions "Transforms"
        pcImplicit -> pcPermissions "Transforms"
        apiGuildsUc -> pcPermissionCalculator "compute(guild, member, channel)"

        # ---- C3: messages ----
        msgPublicHttp -> msgAuth "Guarded by"
        msgPublicHttp -> msgUseCases "Invokes"
        msgPublicHttp -> msgAttachUc "Invokes"
        msgInternalHttp -> msgUseCases "Stats, last message id"
        msgAuth -> api "Introspects bot tokens" "HTTP"
        msgUseCases -> msgDomain "Applies rules from"
        msgUseCases -> msgSnowflake "Generates ids"
        msgUseCases -> msgAccess "Checks permissions and delivery mode"
        msgUseCases -> msgCoalescer "Reads history through"
        msgUseCases -> msgScylla "Writes through"
        msgUseCases -> msgPublisher "Publishes events through"
        msgAttachUc -> msgPresigner "Presigns with"
        msgCoalescer -> msgScylla "Single in-flight query"
        msgAccess -> api "GET /internal/v1/channels/{id}/access/{user}" "HTTP"
        msgScylla -> scylla "CQL"
        msgPublisher -> redpanda "discordy.message.v1" "Kafka"
        msgPresigner -> minio "Presigns" "S3"

        # ---- C4: coalescer ----
        coHistory -> coPort "Depends on"
        coDecorator -> coPort "Implements"
        coScylla -> coPort "Implements"
        coDecorator -> coCoalescer "Routes reads through"
        coDecorator -> coScylla "Delegates loads and writes to"
        coCoalescer -> coInFlight "Joins or inserts shared futures in"
        coCoalescer -> coKey "Keyed by"
        msgUseCases -> coHistory "Executes"

        # ---- C3: gateway ----
        gwSocket -> gwCodec "Decodes/encodes frames with"
        gwSocket -> gwSession "Starts one per connection"
        gwSession -> gwApiClient "Fetches ready payload, introspects bot tokens"
        gwSession -> gwValkey "Resume buffer gw:resume:<session_id>"
        gwSession -> gwRegistry "Subscribes to guilds via"
        gwSession -> gwPresence "Reports status to"
        gwSession -> gwVoiceStates "Forwards op 4 to"
        gwSession -> gwE2EE "Forwards op 20/21 to"
        gwSession -> gwP2P "Forwards op 22 to"
        gwSession -> gwWatch "Forwards op 24 to"
        gwSession -> gwTelemetry "Forwards op 23 to"
        gwRegistry -> gwGuild "Locates or starts"
        gwGuild -> gwApiClient "Loads guild state"
        gwGuild -> gwPermissions "Computes VIEW_CHANNEL with"
        gwGuild -> gwFanout "Dispatches through"
        gwGuild -> gwVoiceAllocator "Allocates voice server via"
        gwFanout -> gwSession "Delivers DISPATCH to"
        gwConsumers -> gwRegistry "Routes guild events to"
        gwConsumers -> gwFanout "Routes targeted events to"
        gwPresence -> gwValkey "presence:*"
        gwPresence -> gwFanout "Publishes PRESENCE_UPDATE through"
        gwVoiceStates -> gwGuild "Tracks state in"
        gwVoiceAllocator -> gwEtcd "Discovers nodes via"
        gwVoiceAllocator -> gwValkey "voice:alloc:<srv_id>"
        gwE2EE -> gwValkey "e2ee:inbox:<device_id>, e2ee:ttl"
        gwE2EE -> gwFanout "Delivers envelopes through"
        gwP2P -> gwFanout "Delivers signals through"
        gwWatch -> gwFanout "Delivers sync events through"
        gwInternalHttp -> gwVoiceAllocator "Drain/undrain"
        gwInternalHttp -> gwRegistry "Stats"
        gwApiClient -> api "Calls" "HTTP /internal/v1"
        gwConsumers -> redpanda "Consumes" "Kafka"
        gwTelemetry -> redpanda "Publishes" "Kafka"
        gwValkey -> valkey "RESP"
        gwEtcd -> etcd "Watches" "gRPC"

        # ---- C4: VoiceAllocator ----
        vaAllocator -> vaRegion "1. resolves region with"
        vaAllocator -> vaDirectory "2. lists healthy nodes from"
        vaAllocator -> vaSelector "3. picks node with"
        vaAllocator -> vaStore "4. stores allocation in"
        vaAllocator -> vaTokens "5. signs voice token with"
        vaAllocator -> vaNotifier "6. sends VOICE_SERVER_UPDATE via"
        vaSelector -> vaNode "Ranks"
        vaDirectory -> vaNode "Returns"
        vaEtcdDirectory -> vaDirectory "Implements"
        vaValkeyStore -> vaStore "Implements"
        vaEtcdDirectory -> vaAllocator "Notifies node loss (reallocate)"
        gwGuild -> vaAllocator "allocate(srv_id, channel)"
        vaEtcdDirectory -> etcd "Prefix watch" "gRPC"
        vaValkeyStore -> valkey "voice:alloc:*" "RESP"

        # ---- C3: voice-signaling ----
        vsSocket -> vsCodec "Decodes/encodes frames with"
        vsSocket -> vsSession "Starts one per client"
        vsSession -> vsTokens "Verifies IDENTIFY token with"
        vsSession -> vsRooms "Joins room in"
        vsSession -> vsDave "Relays op 21-31 via"
        vsSession -> vsSfuClient "create_session, set_sink_wants"
        vsSession -> vsDrain "Checks admission with"
        vsSupervisor -> vsSfuClient "Reconnects and replays sessions via"
        vsRegistrar -> vsRooms "Reports user count from"
        vsDrain -> vsRegistrar "Publishes draining flag via"
        vsSfuClient -> sfu "NDJSON commands" "TCP 127.0.0.1:4101"
        vsRegistrar -> etcd "Lease + key" "gRPC"

        # ---- C3: sfu ----
        sfuUdp -> sfuDemux "Hands datagrams to"
        sfuDemux -> sfuRtc "Feeds the owning session"
        sfuRtc -> sfuForwarder "Emits media packets to"
        sfuRtc -> sfuRtcp "Emits feedback to"
        sfuRtc -> sfuSpeaking "Emits audio levels to"
        sfuForwarder -> sfuRooms "Looks up subscribers in"
        sfuForwarder -> sfuRtc "Writes rewritten packets to subscribers"
        sfuRtcp -> sfuForwarder "Updates bandwidth estimates and requests keyframes"
        sfuControl -> sfuRooms "Creates/closes sessions, sets sink wants"
        sfuControl -> sfuRtc "Creates"
        sfuSpeaking -> sfuControl "Emits speaking events through"
        sfuStats -> sfuRtc "Samples"
        sfuControl -> voiceSignaling "Replies with session_created, speaking, stats" "NDJSON"

        # ---- C4: SFU forwarder ----
        fwForwarder -> fwRoom "Looks up subscriptions in"
        fwForwarder -> fwPacket "Routes"
        fwRoom -> fwSubscription "Holds"
        fwSubscription -> fwSelector "Chooses layer with"
        fwSubscription -> fwRewriter "Rewrites seq/timestamp with"
        fwSelector -> fwWants "Reads desired quality from"
        fwSelector -> fwBwe "Caps by"
        fwRewriter -> fwPacket "Produces rewritten"
        sfuRtc -> fwForwarder "on_packet"

        # ---- C3: admin-web / admin-bff ----
        awPages -> awCharts "Renders"
        awPages -> awApi "Loads data via"
        awApi -> adminBff "Calls /admin-api" "HTTPS/JSON"
        abHttp -> abAuth "Guarded by"
        abHttp -> abUseCases "Invokes"
        abUseCases -> abAudit "Records actions in"
        abUseCases -> abRepo "Queries rollups and flags"
        abUseCases -> abStats "Proxies admin stats"
        abUseCases -> abMetrics "Queries metrics"
        abUseCases -> abNodes "Lists voice nodes"
        abAudit -> abRepo "Writes admin_audit"
        abAggregator -> abRepo "Upserts rollups"
        abRepo -> postgres "discordy_admin" "SQL"
        abAggregator -> redpanda "Consumes" "Kafka"
        abStats -> api "Calls" "HTTP /internal/v1"
        abStats -> messages "Calls" "HTTP /internal/v1"
        abStats -> gateway "Calls (stats, drain)" "HTTP /internal/v1"
        abMetrics -> victoria "Queries" "HTTP"
        abNodes -> etcd "Reads" "gRPC"

        # ==================================================================
        # Deployment: gen-serv (production)
        # ==================================================================
        deploymentEnvironment "gen-serv" {

            deploymentNode "User workstation" "Windows 11 (primary), macOS, Linux" "" {
                containerInstance client
            }

            deploymentNode "Cloudflare edge" "Anycast edge, Universal SSL for *.voics.nl" "Cloudflare" {
                cfTunnelEdge = infrastructureNode "Tunnel edge" "Terminates TLS for every one-level discordy-*.voics.nl hostname." "Cloudflare Tunnel"
                cfAccess = infrastructureNode "Access" "Protects discordy-admin and discordy-headlamp." "Cloudflare Access"
                cfDns = infrastructureNode "DNS" "voics.nl zone; proxied CNAMEs to the tunnel, DNS-only A records for region UDP." "Cloudflare DNS"
            }

            deploymentNode "Home network" "" "LAN 192.168.1.0/24" {
                homeRouter = infrastructureNode "Router" "Port forwards UDP 50000 and UDP/TCP 3478 to 192.168.1.212." "Consumer router"

                deploymentNode "Proxmox host" "" "Proxmox VE" {
                    deploymentNode "gen-serv" "192.168.1.212, 7.6 GB RAM (16 GB recommended)" "Ubuntu VM, microk8s 1.35" {

                        deploymentNode "flux-system" "" "Kubernetes namespace" {
                            flux = infrastructureNode "Flux" "Reconciles discordy-voics/gitops; image automation on semver tags." "Flux v2"
                        }

                        deploymentNode "voics-system" "" "Kubernetes namespace" {
                            cloudflared = infrastructureNode "cloudflared" "Outbound tunnel connector." "cloudflared"
                            ingress = infrastructureNode "ingress-nginx" "Routes hostnames and paths to services." "ingress-nginx"
                            openbao = infrastructureNode "OpenBao" "KV v2 at kv/discordy/<service>." "OpenBao"
                            eso = infrastructureNode "External Secrets Operator" "Syncs OpenBao into Kubernetes Secrets." "ESO"
                            arc = infrastructureNode "Actions Runner Controller" "Self-hosted runner scale set labelled discordy." "ARC"
                            headlamp = infrastructureNode "Headlamp" "Cluster UI at discordy-headlamp.voics.nl." "Headlamp"
                            deploymentNode "coturn" "hostNetwork" "Deployment" {
                                containerInstance coturn
                            }
                        }

                        deploymentNode "voics-apps" "" "Kubernetes namespace" {
                            deploymentNode "api" "" "Deployment" {
                                containerInstance api
                            }
                            deploymentNode "messages" "" "Deployment" {
                                containerInstance messages
                            }
                            deploymentNode "gateway" "Erlang distribution via headless service" "StatefulSet" {
                                containerInstance gateway
                            }
                            deploymentNode "admin" "" "Deployment" {
                                containerInstance adminBff
                                containerInstance adminWeb
                            }
                        }

                        deploymentNode "voics-voice" "" "Kubernetes namespace" {
                            deploymentNode "voice-nl-home" "hostNetwork, one pod per node" "Deployment (region nl-home)" {
                                containerInstance voiceSignaling
                                containerInstance sfu
                            }
                        }

                        deploymentNode "voics-data" "" "Kubernetes namespace" {
                            deploymentNode "postgres" "" "CloudNativePG Cluster" {
                                containerInstance postgres
                            }
                            deploymentNode "scylla" "--smp 1, ~1.5 GB" "StatefulSet" {
                                containerInstance scylla
                            }
                            deploymentNode "redpanda" "--smp 1 --memory 1G" "StatefulSet" {
                                containerInstance redpanda
                            }
                            deploymentNode "valkey" "AOF on" "StatefulSet" {
                                containerInstance valkey
                            }
                            deploymentNode "etcd" "" "StatefulSet" {
                                containerInstance etcd
                            }
                            deploymentNode "minio" "" "StatefulSet" {
                                containerInstance minio
                            }
                        }

                        deploymentNode "observability" "" "Kubernetes namespace" {
                            deploymentNode "victoria-metrics" "" "VMSingle" {
                                containerInstance victoria
                            }
                            grafana = infrastructureNode "Grafana" "Dashboards." "Grafana"
                            otel = infrastructureNode "OpenTelemetry collector" "Receives OTLP traces/metrics from every service." "otelcol"
                        }
                    }
                }
            }

            cfTunnelEdge -> cloudflared "Proxies requests through the tunnel" "QUIC/HTTP2"
            cloudflared -> ingress "Forwards" "HTTP"
            homeRouter -> coturn "Forwards" "UDP/TCP 3478"
            flux -> openbao "Deploys"
            eso -> openbao "Reads secrets from" "HTTPS"
            arc -> openbao "secrets-sync writes to" "HTTPS"
            grafana -> victoria "Queries" "HTTP"
            otel -> victoria "Remote-writes metrics" "HTTP"
        }

        # ==================================================================
        # Deployment: voice-region template
        # ==================================================================
        deploymentEnvironment "region-template" {

            deploymentNode "User workstation" "" "Windows / macOS / Linux" {
                containerInstance client
            }

            deploymentNode "Cloudflare" "" "Cloudflare" {
                rtCfEdge = infrastructureNode "Tunnel edge" "discordy-rtc-<region>.voics.nl (proxied) for the voice WebSocket." "Cloudflare Tunnel"
                rtCfDns = infrastructureNode "DNS" "Created by regionctl through the Cloudflare API." "Cloudflare DNS"
            }

            deploymentNode "Control plane (gen-serv)" "Shared by every region" "microk8s 1.35" {
                deploymentNode "voics-apps" "" "Kubernetes namespace" {
                    containerInstance gateway
                }
                deploymentNode "voics-data" "" "Kubernetes namespace" {
                    containerInstance etcd
                    containerInstance redpanda
                }
            }

            deploymentNode "Region site <region>" "Any location with a public IPv4 and a forwardable UDP port" "" {
                rtRouter = infrastructureNode "Site router / firewall" "UDP 50000 -> region node; TCP 443 outbound only." "Router"

                deploymentNode "Region node <node>" "2 vCPU, 2 GB RAM, >=100 Mbit/s symmetric (sizing in runbook)" "Ubuntu 24.04, microk8s (joined or standalone)" {
                    rtCloudflared = infrastructureNode "cloudflared" "Tunnel connector for discordy-rtc-<region> (standalone clusters only)." "cloudflared"
                    deploymentNode "voics-voice" "" "Kubernetes namespace" {
                        deploymentNode "voice-<region>" "hostNetwork, UDP 50000; rendered from gitops/regions/_template" "Deployment" {
                            containerInstance voiceSignaling
                            containerInstance sfu
                        }
                    }
                }
            }

            rtCfEdge -> rtCloudflared "Proxies voice WebSocket" "QUIC/HTTP2"
        }
    }

    views {

        # ---------------- C1 ----------------
        systemContext discordy "C1-SystemContext" "Who uses Discordy and which external systems it depends on." {
            include *
            include botDeveloper onePassword
            autolayout lr
        }

        # ---------------- C2 ----------------
        container discordy "C2-Containers" "Deployable units and data stores of Discordy." {
            include *
            exclude cloudflare router github notion onePassword
            autolayout lr
        }

        # ---------------- C3 ----------------
        component client "C3-Client" "Desktop client components." {
            include *
            autolayout lr
        }

        component api "C3-api" "api components (Clean Architecture layers)." {
            include *
            exclude "element.tag==Code"
            autolayout lr
        }

        component messages "C3-messages" "messages components." {
            include *
            exclude "element.tag==Code"
            autolayout lr
        }

        component gateway "C3-gateway" "gateway components." {
            include *
            exclude "element.tag==Code"
            autolayout lr
        }

        component voiceSignaling "C3-voice-signaling" "voice-signaling components." {
            include *
            autolayout lr
        }

        component sfu "C3-sfu" "SFU components." {
            include *
            exclude "element.tag==Code"
            autolayout lr
        }

        component adminBff "C3-admin-bff" "admin-bff components." {
            include *
            autolayout lr
        }

        component adminWeb "C3-admin-web" "admin-web components." {
            include *
            autolayout lr
        }

        # ---------------- C4 (code) ----------------
        component api "C4-PermissionCalculator" "Code view: Discord-compatible permission computation (api domain; mirrored in gateway)." {
            include "element.tag==CodePermissions"
            include apiGuildsUc
            autolayout tb
        }

        component messages "C4-RequestCoalescer" "Code view: request coalescing of identical concurrent history reads." {
            include "element.tag==CodeCoalescer"
            include msgUseCases
            autolayout tb
        }

        component sfu "C4-SfuForwarder" "Code view: SFU forwarding, layer selection and RTP rewriting." {
            include "element.tag==CodeForwarder"
            include sfuRtc
            autolayout tb
        }

        component gateway "C4-VoiceAllocator" "Code view: guild-scoped voice-server allocation." {
            include "element.tag==CodeVoiceAllocator"
            include gwGuild etcd valkey
            autolayout tb
        }

        # ---------------- Deployment ----------------
        deployment discordy "gen-serv" "Deployment-gen-serv" "Production on the owner's Proxmox VM gen-serv (microk8s), behind Cloudflare." {
            include *
            autolayout lr
        }

        deployment discordy "region-template" "Deployment-RegionTemplate" "A voice region rendered from gitops/regions/_template by regionctl." {
            include *
            autolayout lr
        }

        # ---------------- Styles ----------------
        styles {
            element "Element" {
                fontSize 22
            }
            element "Person" {
                shape Person
                background #4f46e5
                color #ffffff
            }
            element "Software System" {
                background #5865f2
                color #ffffff
            }
            element "External" {
                background #6b7280
                color #ffffff
            }
            element "Container" {
                background #3b82f6
                color #ffffff
            }
            element "Desktop" {
                shape Window
            }
            element "WebApp" {
                shape WebBrowser
            }
            element "Database" {
                shape Cylinder
                background #0e7490
            }
            element "Queue" {
                shape Pipe
                background #0e7490
            }
            element "Component" {
                background #93c5fd
                color #0b1020
            }
            element "Domain" {
                background #fde68a
            }
            element "Application" {
                background #bbf7d0
            }
            element "Infrastructure" {
                background #e9d5ff
            }
            element "Interface" {
                background #bae6fd
            }
            element "Code" {
                shape Component
                background #f1f5f9
                color #0b1020
            }
            element "Infrastructure Node" {
                background #e5e7eb
                color #111827
            }
        }
    }
}
