# 0025 — Probe voice media before allocating required-health nodes

- Status: proposed
- Date: 2026-11-18
- Deciders: project owner
- Technical story: [voice#7](https://github.com/discordy-voics/voice/issues/7)

## Context and Problem Statement

A current etcd registration proves that signaling can refresh a lease. It does not prove that a client can reach the advertised WebSocket and UDP endpoint, complete ICE and DTLS, or receive forwarded media. New allocations need an independent media observation without allowing a probe to enter a user's call or a stale observer to change a replacement node's eligibility.

## Decision Drivers

- Exercise the public voice handshake and bidirectional media forwarding.
- Preserve node ownership, endpoint affinity, user-call E2EE and rolling upgrades.
- Distinguish transport health, draining and manual allocation exclusion.
- Prepare the daemon and rollout without activating another server or changing production.

## Considered Options

1. Keep registration/readiness as the only health signal.
2. Probe local SFU control sockets and trust their process health.
3. Run an independent synthetic client pair through each discovered node's advertised endpoints.

## Decision Outcome

Choose **3**. A separate `voice-prober` daemon discovers nodes, authenticates two synthetic peers, completes ICE/DTLS and sends a short Opus-like RTP echo exchange. It measures returned packet loss and round-trip time. Each peer follows the str0m input/output drain invariant. No real call payload or key enters the probe.

Probe tokens use HS256 and a 60-second lifetime, with a separate `VOICE_PROBE_TOKEN_SECRET`. The daemon never receives the gateway's call-signing key. A probe key cannot sign ordinary call tokens, and the call key cannot authorize probes. Without a configured probe key signaling rejects probes. Tokens add `purpose: "probe"`, the exact `node_lease` and a random `probe_id`; verifiers select the stricter `ProbeVoiceTokenClaims` contract after checking the purpose-specific signature. Signaling checks its live registration lease and derives a private room namespace from that lease and probe ID. Configured synthetic user/server/channel IDs cannot select an ordinary user room. Probes are audio-only and use DTLS-SRTP without DAVE; this exception applies only inside their isolated synthetic room. Drained nodes may still be probed, while ordinary joins remain refused.

One observer owns `/discordy/voice/probers/<node_id>` under a short lease. Every result write atomically compares both that ownership claim and the node registration's lease. `/discordy/voice/health/<node_id>` carries the observed registration lease and shares the observer lease. The result disappears within two probe intervals if the observer stops renewing. Replaced registrations require new observations. Timestamp fields serve diagnostics; allocation freshness does not depend on synchronized clocks.

The health state starts unknown. Two consecutive failures make it unhealthy; two consecutive passes make it healthy. Thresholds are configurable positive integers. A healthy node tolerates fewer than the failure threshold, and an unhealthy node needs the full recovery threshold. Probe timeout is shorter than the interval; independent node tasks prevent a slow node delaying another node's checks.

Persistent keys under `/discordy/voice/blacklist/nodes/<node_id>` and `/discordy/voice/blacklist/regions/<region>` override probe success. Key presence excludes new allocations even when its value is malformed. The daemon never clears these keys. Clearing a blacklist does not bypass health, identity or drain checks. Existing calls continue; a missing node registration keeps its existing failover behavior.

`probe_required` is an additive discovery flag, default false. A required-health node needs a matching fresh healthy result. Legacy nodes preserve their old behavior when no result exists, but a matching unhealthy result or manual blacklist excludes them. Gateway discovery failure must not continue trusting a cached required-health result. Roll out readers and signaling support first, then the independently placed prober, verify its metrics, and only then opt nodes into required health.

### Consequences

- A functioning signaling process with broken UDP/media is excluded from new allocations.
- Observer ownership and node incarnation are fenced independently; duplicate daemons do not race to publish contradictory results.
- Probing uses two short-lived synthetic sessions per node and a separately scoped probe-signing secret. Network placement must exercise the client route; a prober behind the same broken NAT route can correctly mark that route unhealthy.
- A prober outage blocks required-health nodes once results expire. Deploying and enabling enforcement are separate operator actions.

### Confirmation

Before rollout, isolated tests must prove the real WebSocket/ICE/DTLS/RTP exchange, packet-loss and RTT accounting, N-failure exclusion within two default intervals, M-pass recovery, manual-blacklist dominance, observer and node-lease fencing, room isolation, and gateway behavior when discovery stops. Publish Prometheus result/loss/RTT/eligibility metrics. This ADR and its contracts alone do not claim those implementation tests have passed.

## Pros and Cons of the Options

### Registration only

Lowest cost, but cannot detect media-path failures or degraded forwarding.

### Local control probe

Easy to run beside the SFU, but bypasses the externally advertised endpoint and does not validate the client route.

### Independent synthetic peers

Exercises the route users depend on and provides packet-level evidence. It requires an additional prepared service and careful credential, room and lease boundaries.

## More Information

- [etcd transactions and leases](https://etcd.io/docs/v3.6/learning/api/)
- [etcd JSON gRPC gateway](https://etcd.io/docs/v3.6/dev-guide/api_grpc_gateway/)
- [str0m run loop](https://docs.rs/str0m/0.24.1/str0m/struct.Rtc.html)
- [Discord's voice-health design](https://discord.com/blog/we-care-about-your-voice-engineering-special)
- [Troubleshooting](../runbooks/voice-regions/troubleshooting.md)

No prober, app replica, server, VM or failover path is activated by this design change. The owner reviews executable evidence and deployment changes separately.
