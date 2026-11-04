# Capacity baseline, 2026-11-04 (gitops#72)

Target: gen-serv (192.168.1.212, one node, 8 vCPU, 11 GB, microk8s). Generator: the owner's Windows PC
(Ryzen 7 9700X) over the LAN, through `kubectl port-forward` to the ingress (the ingress is a ClusterIP
Service, nothing listens on the node's LAN ports 80 and 443). Harness: `gitops/loadtest/`
([runbook](../runbooks/load-testing.md)).

## Headline

The cluster is **memory-limited long before it is CPU-limited**. Node CPU never exceeded 30 % and node
memory stayed near 50 %, but pod memory limits are 128 to 256 Mi and two pods were OOM-killed:

| Pod | Limit | Killed by | Restarts caused |
|---|---|---|---|
| gateway | 256 Mi | about 100 msg/s sent to 50 connected receivers (about 5k deliveries/s), and about 500 concurrent sessions (twice) | 3 |
| api | 192 Mi | 4 concurrent registrations (argon2), later cleanup logins and deletes | 4 |

- **Max sustained messages/s with p95 under 500 ms: none measurable.** Even at 10 msg/s the end-to-end
  delivery latency has a floor of p50 about 420 ms, p95 about 890 ms, p99 about 1 s (bottleneck 2).
  REST send latency alone is excellent (p95 12 ms up to 100 msg/s).
- **Max with zero loss and delivery p95 under 1 s: 50 msg/s to 50 receivers (2.5k deliveries/s).**
- **Breaking point: about 100 msg/s to 50 receivers.** The gateway was OOM-killed 16 s into that step.
  The owner's 250k and 1M msg/s targets were not attempted: the gateway cannot hold them and each
  attempt takes production down.
- **Max concurrent sessions: about 480 to 550 before the gateway OOM.** Roughly 0.2 MiB per session
  (147 Mi at rest, 256 Mi limit). The 2,000 scenario fails; 18,000 and 19,000 were not run.
- **Calls (WebRTC to the SFU): not measured.** The SFU limit is 128 Mi and signaling 192 Mi, the gateway
  cannot sustain the sessions needed, and the headless simulator is not built yet.

## Messages: ramp (REST send, 50 gateway receivers, 8 channels, 100 sender accounts)

| Target msg/s | Sent msg/s | Errors / 429 | Send p50/p95/p99 ms | Delivered per s (ratio) | Delivery p50/p95/p99 ms |
|---|---|---|---|---|---|
| 10 | 9.9 | 0 / 0 | 7 / 10 / 15 | 496 (100 %) | 437 / 899 / 993 |
| 25 | 24.9 | 0 / 0 | 7 / 10 / 14 | 1,243 (100 %) | 412 / 894 / 956 |
| 50 | 49.8 | 0 / 0 | 6 / 12 / 18 | 2,488 (100 %) | 405 / 886 / 1080 |
| 100 | 99.2 | 0 / 0 | 6 / 12 / 17 | 3,263 (66 %, cut short) | 426 / 828 / 905 |

Step 100 stopped after about 16 s: the guard saw the gateway restart (OOMKilled, exit 137). Steps were
30 s instead of 60 to 120 s to limit exposure. The generator was nowhere near its ceiling.

Pod CPU and memory per step (kubectl top, about 15 s resolution):

| Step | Node CPU avg / max | gateway CPU avg / max (m) | gateway mem peak | messages CPU max (m) | postgres CPU max (m) | nginx CPU max (m) |
|---|---|---|---|---|---|---|
| 10 | 10 / 12 % | 102 / 171 | 229 Mi | under 50 | 68 | n/a |
| 25 | 12 / 17 % | 200 / 363 | 194 Mi | 54 | 91 | n/a |
| 50 | 18 / 27 % | 430 / 723 | 223 Mi | 77 | n/a | 124 |
| 100 | 21 / 30 % | 723 / 723 | 223 Mi (killed at 256) | 70 | 222 | 207 |

The gateway (Elixir, no CPU limit) uses by far the most CPU per message because it fans each event out
to every connected member of the guild. messages, api and Redpanda stay small.

## Concurrent users (pass/fail scenario, 1 msg/user/min, 50 channels)

200 accounts reused as 2,000 sessions (10 per account; the gateway accepts many sessions per account),
50 guilds of 4 accounts (40 sessions each, so the fan-out is 40 per message).

| Scenario | Result | Breach | Send p95 / p99 | Delivery p95 / p99 | Error % | Notes |
|---|---|---|---|---|---|---|
| 2,000 (500 / 1000 ms, 1 %) | FAIL after 7 s | delivery p95 973 ms | not reached | 973 ms / n/a | n/a | the delivery latency floor, not load |
| 2,000 (relaxed to 3000 / 5000 ms) | FAIL after 32 s | error rate 33.8 % | not reached | not reached | 33.8 | gateway OOM-killed at about 550 open sessions; 40 connects got 502 |
| 2,000 (relaxed, repeat) | FAIL after 35 s | error rate 33.6 % | not reached | not reached | 33.6 | gateway OOM-killed again at about 490 sessions |
| 18,000 | not run | | | | | the gateway cannot hold 2,000; also the PC's dynamic TCP port range is 16,384 |
| 19,000 | not run | | | | | same |

The 5 minute steady window was never reached, so steady-state percentiles at 2,000 sessions are
unmeasured. At the breach the gateway was at its 256 Mi limit.

## Bottleneck analysis

1. **Memory limits (first and decisive).** gateway 256 Mi, api 192 Mi, messages 224 Mi, minio 192 Mi (169 Mi
   idle), SFU 128 Mi, signaling 192 Mi, etcd 96 Mi, valkey 128 Mi. A gateway session costs about 0.2 MiB
   and the gateway idles at 147 Mi, leaving room for roughly 500 sessions. The api needs about 50 MB
   per argon2 hash (register, login, delete confirmation), so 2 to 4 concurrent password operations
   exceed 192 Mi. Node memory is only about 50 % used, so raising limits is the cheapest large gain. It
   needs the owner's approval (production config), so it was not done.
2. **Delivery latency floor of 0.4 to 1 s, independent of load.** Send returns in 7 ms but MESSAGE_CREATE
   arrives p50 about 420 ms and p99 about 1 s even at 10 msg/s. The spread is roughly uniform over 0 to
   1 s, which matches brod's consumer `sleep_timeout` (default 1000 ms between fetches when a fetch
   returns empty) in the gateway: `gateway/lib/discordy_gateway/infrastructure/kafka/topic_consumer.ex`
   sets only `begin_offset`. This is a hypothesis from reading code, not verified by instrumentation.
   It makes any 500 ms p95 target unreachable until fixed.
3. **Gateway fan-out CPU.** Gateway CPU grows with deliveries (peaking 723 m at about 3k to 5k
   deliveries/s). It has no CPU limit, so it takes node CPU rather than hitting a cap.
4. **Not bottlenecks at the tested rates:** api (44 m CPU peak), messages and Scylla (under 80 m), Redpanda,
   Postgres (222 m at 100 msg/s), nginx (207 m), node CPU (30 %), disk (31 %). The api rate limit (50
   requests per 5 s per user and route) was never hit because sends were spread over 100 accounts.
5. **Unauthenticated rate limit is per source address:** all load-test accounts share one 10 req/s budget on
   register, login and refresh. A refresh loop over 200 accounts returned 429.
6. **Generator.** The PC was far from saturated (highest rate 100 msg/s plus 50 sockets). All traffic went
   through `kubectl port-forward`; its ceiling was not reached but it would cap anything near thousands
   of requests per second, so a route to the Service CIDR is needed for the high-rate targets.

## Cleanup and data left behind

All 200 accounts were deleted via `POST /users/@me/delete` (anonymized after the retention window) and 51
guilds deleted. The runner VM was cleaned (macvlan network, images, directory). Messages written: about
5,500 in the ramp, about 600 in the session runs, a few dozen test messages. There is no delete-message
API, so they stay in ScyllaDB until the platform purges deleted guilds. All pods are 1/1 Ready after
the runs; restart counts are higher (gateway 3, api 4) from the OOM kills above.

## Recommended follow-ups (for tickets)

1. Raise memory limits (gateway at least 1 Gi, api 512 Mi, messages 512 Mi, minio 384 Mi, SFU 512 Mi) and set
   CPU requests, then re-run this baseline. Needs owner approval.
2. Fix the delivery latency floor: tune brod consumer `sleep_timeout`, `max_wait_time` and `min_bytes` in the
   gateway topic consumers, verify with timestamps, target p95 under 200 ms.
3. Add gateway memory-per-session instrumentation and a connection cap with a graceful refusal instead of
   an OOM; document the per-session budget (about 0.2 MiB today).
4. Limit concurrency of argon2 hashing in the api (semaphore) so password bursts cannot OOM it.
5. Add alerts for pod memory near limit and OOMKilled on the app and data pods.
6. Build the headless voice simulator (str0m client from `voice/sfu/crates/sfu-core/tests/common`, flow in
   `docs/protocols/voice.md`) and measure calls once memory limits are raised.
7. Expose the ingress on a LAN-reachable address (or approve a route) so generators bypass the kubectl
   tunnel; widen the generator PC's TCP dynamic port range before the 18k and 19k session tests.
8. Add a guild purge or message-delete path for load-test data and a documented test-account purge.
9. Verify the api uses the real client IP behind Cloudflare for the per-address unauthenticated rate limit.
10. Re-run with 60 to 120 s steps once a step above 100 msg/s is survivable, to find the CPU limit.
