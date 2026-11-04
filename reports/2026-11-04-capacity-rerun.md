# Capacity re-run, 2026-11-04 (after memory limits, argon2 bound, brod tuning)

Re-run of the [capacity baseline](2026-11-04-capacity-baseline.md) against gen-serv (one node, 8 vCPU, 11 GB) with the
same harness (`gitops/loadtest/`, [runbook](../runbooks/load-testing.md)) from the owner's Windows PC through four
`kubectl port-forward` tunnels to the ingress. Metrics came from VictoriaMetrics (production, port-forward) and the
harness guard (`kubectl top`, 5 s polling, about 15 s resolution).

What changed since the baseline: memory limits gateway 384 Mi request / 1 Gi limit, api 192 / 512 Mi, messages
192 / 512 Mi, SFU 128 / 512 Mi; api argon2 hashing bounded (`PASSWORD_HASH_CONCURRENCY=2`, 429 after a 5 s queue);
gateway brod consumer tuned (`max_wait_time` 500 ms, `sleep_timeout` 20 ms).

## Headline

- **The 420 ms delivery latency floor is gone.** Send-to-`MESSAGE_CREATE` p50 is 6 to 22 ms (baseline 405 to 437 ms) and
  p95 is 16 to 62 ms at 25 to 90 msg/s. The brod tuning worked.
- **Safe sustained rate: 80 msg/s to 50 receivers (4,000 deliveries/s)** with fan-out p95 25 ms and p99 98 ms. 90 msg/s
  (4,500 deliveries/s) also passed (p95 62 ms, p99 296 ms), but 100 msg/s showed p95 862 ms and p99 1,024 ms in the first
  ramp, so 90 is the practical edge. Baseline: none measurable under 500 ms.
- **Break point: 100 to 125 msg/s to 50 receivers (5,000 to 6,250 deliveries/s)** in a single guild. At 125 msg/s the
  fan-out p50 was 2.9 s (p95 3.5 s) while the node was at 44 % CPU, and at 200 msg/s the gateway was OOM-killed at its
  1 Gi limit (delivery ratio 30 %, p50 7 s). The first thing to break is the gateway's per-guild fan-out (a queue builds
  up), then its memory.
- **Max concurrent users passing thresholds: 350** (steady p95 16 ms, p99 29 ms, 0 errors over 300 s). 250 also passed.
  500 failed on one stall (see below), 2,000 failed on a gateway OOM.
- **Calls were not measured**: there is still no call simulator (not built, out of scope).
- **Restarts caused:** gateway 2 (both `OOMKilled`, exit 137, at the 1 Gi limit). api, messages and valkey did not restart.

## Before and after

| Metric | Baseline | Re-run |
|---|---|---|
| Delivery latency at 25 msg/s, p50 / p95 / p99 | 412 / 894 / 956 ms | 12 / 29 / 1,600 ms (see spikes) |
| Delivery latency at 50 msg/s | 405 / 886 / 1,080 ms | 9 / 16 / 637 ms |
| Delivery latency at 100 msg/s | 426 / 828 / 905 ms (gateway killed after 16 s) | 22 / 862 / 1,024 ms (survived 60 s) |
| Break point | about 100 msg/s (OOM at 256 Mi) | 100 to 125 msg/s (fan-out saturation), 200 msg/s OOM at 1 Gi |
| Max sustained, p95 under 500 ms | none | 90 msg/s, 4,500 deliveries/s |
| Gateway memory at idle | 147 Mi | 140 to 160 Mi |
| Gateway sessions before OOM | about 500 (256 Mi limit) | about 600 (1 Gi limit), in the 200-member guild |
| Max users passing | 0 | 350 |
| api OOM | 4 concurrent registrations | none; seeding 350 accounts and deleting them had no restarts |

## Messages: ramp (REST send, 50 gateway receivers, 8 channels, 100 sender accounts)

Run 1 (steps of 60 s, 50 receivers):

| Target msg/s | Sent msg/s | Errors / 429 | Send p50/p95/p99 ms | Deliveries/s (ratio) | Delivery p50/p95/p99 ms |
|---|---|---|---|---|---|
| 25 | 24.9 | 0 / 0 | 7 / 11 / 20 | 1,247 (100 %) | 12 / 29 / 1,600 |
| 50 | 49.9 | 0 / 0 | 6 / 8 / 11 | 2,494 (100 %) | 9 / 16 / 637 |
| 100 | 99.8 | 0 / 0 | 7 / 15 / 20 | 4,989 (100 %) | 22 / 862 / 1,024 |
| 200 | 199.3 | 0 / 0 | 8 / 22 / 33 | 2,949 (30 %) | 6,957 / 13,438 / 13,982 |

Run 2 (45 s step, 50 receivers): 125 msg/s sent 124.6/s, 6,232 deliveries/s (100 %), delivery p50/p95/p99
2,883 / 3,488 / 3,713 ms. Aborted by the harness (p95 above 2 s).

Run 3 (fresh guild, steps of 60 s, 50 receivers) to find the edge:

| Target msg/s | Sent msg/s | Errors / 429 | Send p50/p95/p99 ms | Deliveries/s (ratio) | Delivery p50/p95/p99 ms |
|---|---|---|---|---|---|
| 60 | 59.9 | 0 / 0 | 8 / 17 / 32 | 2,993 (100 %) | 13 / 28 / 69 |
| 70 | 69.8 | 0 / 0 | 8 / 20 / 32 | 3,492 (100 %) | 15 / 140 / 324 |
| 80 | 79.8 | 0 / 0 | 6 / 14 / 22 | 3,991 (100 %) | 11 / 25 / 98 |
| 90 | 89.8 | 0 / 0 | 5 / 10 / 14 | 4,490 (100 %) | 11 / 62 / 296 |

Run 4: 200 receivers at 10 msg/s sent 10 msg/s, 1,990 deliveries/s (100 %), fan-out p50/p95/p99 20 / 39 / 381 ms. The
guard then aborted the run (valkey 110 of 128 Mi, see bottlenecks), so 25 and 40 msg/s at 200 receivers were not run.

Pod CPU and memory per step (`kubectl top`):

| Step | Node CPU avg / max | gateway CPU avg / max (m) | gateway mem peak | other busiest |
|---|---|---|---|---|
| 25 | 18 / 22 % | 309 / 477 | 229 Mi | postgres 167 m |
| 50 | 22 / 29 % | 568 / 811 | 238 Mi | postgres 158 m |
| 60 | 36 / 43 % | 784 / 1,175 | 279 Mi | postgres 321 m, api 467 m |
| 70 | 33 / 47 % | 1,020 / 1,360 | 278 Mi | nginx 218 m |
| 80 | 39 / 51 % | 826 / 1,299 | 281 Mi | nginx 201 m |
| 90 | 35 / 49 % | 1,059 / 1,447 | 282 Mi | nginx 215 m |
| 100 | 41 / 60 % | 1,059 / 1,660 | 347 Mi | postgres 334 m, nginx 323 m, valkey 302 m |
| 125 | 44 / 68 % | 805 / 1,894 | 460 Mi | nginx 386 m |
| 200 | 37 / 67 % | 569 / 1,352 | 317 Mi sampled, killed at 1 Gi | messages 384 m |

## Concurrent users (1 msg/user/min, 50 channels, 2 min ramp, 5 min hold, 30 s rolling thresholds)

200 accounts reused as N sessions, groups of 4 accounts.

| Scenario | Result | Detail |
|---|---|---|
| 250 users | PASS | steady window 301 s: send p95 / p99 13 / 33 ms, delivery p95 / p99 18 / 37 ms, 0 failures, 0 missed heartbeats |
| 350 users | PASS | steady window 300 s: send p95 / p99 11 / 21 ms, delivery p95 / p99 16 / 29 ms, 0 failures, 0 missed heartbeats |
| 500 users | FAIL at 221 s | delivery p99 4,891 ms from one 5 s stall; steady-window p95 59 ms, p99 121 ms, 0 failures |
| 2,000 users (200-member main guild kept) | FAIL after 40 s | error rate 3.6 %; gateway OOM-killed at 1 Gi with about 600 open sessions, 40 connects got 502 |
| 18,000 / 19,000 users | not run | 2,000 cannot pass and each attempt OOM-kills production; the PC's dynamic TCP range is 16,384 ports and there is no route to the Service CIDR |

The 250, 350 and 500 runs used `--drop-main-guild` (sessions only in 4-account guilds).

## Bottleneck analysis

1. **Gateway per-guild fan-out (the message break point).** Gateway CPU peaks at 1.4 to 1.9 cores (no CPU limit) on an
   8-core node at 44 to 68 % total, yet delivery latency climbs once one guild passes about 5,000 deliveries/s. Every test
   sends to one guild, and one guild is one gateway process (`discordy_gateway_gauges_guild_processes` shows 1 per
   guild), so this looks like the ceiling of a single guild process, not of the node. This is a hypothesis from the
   metrics, not instrumented. Many guilds should scale further (not tested: the harness uses one guild for messages).
   A limit in the four port-forwards on the receiver side cannot be ruled out.
2. **Gateway memory, then OOM.** Memory went from 317 Mi to 723 Mi inside one 15 s window and the pod was killed at 1 Gi
   at 200 msg/s: the queue that builds when fan-out lags is held in memory. Per session it is about 0.26 MiB
   (140 to 270 Mi for 500 sessions in 4-member guilds) but about 1.6 MiB when sessions also belong to the 200-member guild
   (READY and presence state grow with guild size). The 2,000 scenario OOMed at about 600 such sessions.
3. **valkey at its 96 MB maxmemory (new finding).** `redis_memory_used_bytes` rose from 1.7 MB to 96 MB while 250
   sessions (200 receivers in the 200-member guild) were connected, and it was freed again when they closed: about
   0.2 MiB per session in small guilds and 0.4 to 0.5 MiB in a 200-member guild. At the maximum the api logged
   `rate limiter unavailable; request allowed ... OOM: command not allowed when used memory > maxmemory`, so **the rate
   limiter fails open when valkey is full.** The 128 Mi pod limit and 96 MB maxmemory cap the platform at roughly 250
   sessions in large guilds and about 500 in small ones (the 500-user run sat at 106 of 128 Mi, just under the guard's
   85 % trip). This is the next limit after gateway memory.
4. **The 500-user and early p99 spikes are a stall, not load.** The 500-user failure is one stall of about 5 s that hit
   both REST sends (client max 4,924 ms) and deliveries (max 5,804 ms) at once, while nginx p99 stayed at about 20 ms, no
   pod's CPU or memory moved and nothing restarted. The same shape shows in the 25 msg/s step (p99 1,600 ms) and the
   50 msg/s step (p99 637 ms). The cause points at the generator or the kubectl port-forward tunnel. A route to the
   Service CIDR would settle it; until then the p99 thresholds are noisy through the tunnel.
5. **Not bottlenecks:** api (467 m peak at 60 msg/s, no OOM, argon2 bound held), messages (384 m at 200 msg/s), Scylla,
   Redpanda, postgres (334 m), nginx (386 m), node CPU (68 % max), disk. REST send stays at p95 8 to 22 ms.

## Not measured

Calls (no simulator). 18k and 19k users. 200 receivers at 25 msg/s and above (guard abort at valkey 110 of 128 Mi).
Per-guild scaling with many guilds. Owner commands for the big scenarios: a route to the ingress without tunnels needs
`ip route add 10.152.183.0/24 via 192.168.1.212` as root on a Linux generator, and widening this PC's dynamic port range
needs `netsh int ipv4 set dynamicport tcp start=10000 num=55000` as administrator before any 18k run.

## Cleanup and data left behind

Both seeds (200 and 150 accounts) and all 51 guilds were deleted with `cleanup.mjs` (sequential, no failures, no restarts).
Messages remain in ScyllaDB (roughly 30,000). All pods are 1/1 Ready.

## Recommended next limits and changes

1. Raise valkey `maxmemory` and the pod limit (for example 512 MB and 640 Mi) and set an eviction policy so the api rate
   limiter cannot fail open; alert on valkey memory above 80 %.
2. Gateway: find why per-session state in valkey and in the gateway grows with guild size (presence payloads), and cap
   the backlog per connection (drop or disconnect slow consumers) so a fan-out queue cannot consume 1 Gi.
3. Gateway: measure fan-out with many guilds (add a multi-guild mode to `messages.mjs`) before sizing; one guild
   saturates at about 5,000 deliveries/s.
4. Keep the gateway limit at 1 Gi until the above is fixed, and do not run more than 350 concurrent sessions in
   production-like guilds.
5. Give the generator a route to the Service CIDR to remove the tunnel as a suspect, then re-run 500 users and the
   50-receiver ramp to 125 msg/s.
6. Build the call simulator once sessions are stable.
