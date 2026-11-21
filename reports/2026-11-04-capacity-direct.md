# Capacity on the direct path, 2026-11-04 (gateway 0.7.0 and 0.7.1)

Follow-up to the [capacity re-run](2026-11-04-capacity-rerun.md). The harness ran from the owner's Windows PC straight
to the ingress over a route to the cluster service range (`LT_INGRESS=10.152.183.178:80`), without port-forward tunnels.
The target was gen-serv (one node, 8 vCPU) with gateway 0.7.0 or 0.7.1, api 0.13.0, and Valkey at 512 Mi. Steps were
60 s in one guild with 50 receivers, 8 channels and 100 senders. A message is one send; a delivery is one copy pushed to
one online receiver.

## Headline

- **Safe sustained rate: 190 msg/s (about 9,500 deliveries/s).** The direct baseline on gateway 0.6.0 was 90 msg/s.
- **Highest rate within the thresholds: 225 msg/s (about 11,200 deliveries/s).** The thresholds are p95 500 ms and
  p99 1,000 ms.
- **200 msg/s is not stable yet:** it failed one of three runs, and the cause of that failure is unknown.
- **The gateway no longer runs out of memory under message load.** It stayed under about 365 MiB at 300 msg/s with no
  restarts. On 0.6.0 it was OOM-killed at 200 msg/s.
- **Concurrent users:** 2,000 pass with small guilds. Admission stops new connections at about 2,890 sessions.
- **Calls were not measured**, and 18,000 or 19,000 users were not run.

## Messages

Fan-out latency, send to `MESSAGE_CREATE` at the receiver. Every row delivered 100 % unless stated. Send p99 stayed at
22 ms or less throughout.

| msg/s | deliveries/s | Gateway | p95 ms | p99 ms | Result |
| --- | --- | --- | --- | --- | --- |
| 90 | 4,490 | 0.7.0 | 16 | 24 | pass |
| 125 | 6,238 | 0.7.0 | 17 | 27 | pass |
| 140 | 6,985 | 0.7.0 | 17 | 102 | pass |
| 150 | 7,486 | 0.7.0 | 16 | 30 | pass |
| 160 | 7,982 | 0.7.0 | 19 | 36 | pass |
| 170 | 8,482 | 0.7.0 | 23 | 44 | pass |
| 180 | 8,981 | 0.7.0 | 30 | 105 | pass |
| 190 | 9,480 | 0.7.0 | 32 | 78 | pass |
| 190 | 9,479 | 0.7.1 | 35 | 79 | pass |
| 200 | 9,979 | 0.7.0, first run | 4,245 | 5,838 | fail |
| 200 | 9,978 | 0.7.0, second run | 55 | 155 | pass |
| 200 | 9,979 | 0.7.1 | 49 | 87 | pass |
| 210 | 10,477 | 0.7.0 | 67 | 157 | pass |
| 225 | 11,226 | 0.7.0 | 181 | 378 | pass |
| 225 | 11,225 | 0.7.1 | 112 | 209 | pass |
| 250 | 12,474 | 0.7.0 | 682 | 944 | fail |
| 250 | 12,473 | 0.7.1 | 3,152 | 3,330 | fail, run stopped |
| 300 | 13,453 (89.9 % delivered) | 0.7.0 | 17,123 | 19,772 | fail, run stopped |

Direct baseline on gateway 0.6.0 and api 0.11.0: 90 msg/s p95 27 ms and p99 254 ms, 125 msg/s p95 691 ms and p99
1,036 ms, and 200 msg/s delivered 53.5 % before an OOM kill.

## Concurrent users

One message per user per minute, 50 channels, 2 min ramp, 3 min hold, gateway 0.7.0.

| Users | Guild setup | Delivery p95 / p99 ms | Result |
| --- | --- | --- | --- |
| 500 | also in one large guild | 9 / 22 | pass |
| 1,000 | also in one large guild | 10 / 17 | pass |
| 2,000 | also in one large guild | not reached | fail at about 1,144 sessions: delivery p95 704 ms, 6 closed with 4015 |
| 2,000 | small guilds only | 14 / 19 | pass |
| 4,000 | small guilds only | not reached | fail at 2,888 sessions: 104 closed with 4015, error rate 1.33 % |

The 4015 closes are admission working as designed: the gateway refuses new connections at 75 % of its 1 GiB limit
instead of crashing. No gateway restart happened in any run.

## Bottleneck

- At 300 msg/s the gateway consumed about 250 events/s, so a backlog grew. About 50 events/s of excess over 60 s at
  250 events/s is roughly 12 s of delay, which fits the measured delivery latency.
- This is not hardware: the gateway used 2 to 3 of 8 cores, and Valkey stayed under 0.25 core.
- Separate resume connections (gateway#54, in 0.7.1) did not move the limit. They were based on a wrong assumption:
  dedup is an in-memory process and never used those Valkey connections. Lower latency at 200 and 225 msg/s on 0.7.1
  rests on single runs and may be noise.
- Dedup is a cheap in-memory call, yet it rises from 0.2 ms to 4 to 7 ms under load, and every stage slows at once. So
  the time is spent waiting, not working. Scheduler contention or full-sweep garbage collection are candidates, but the
  limiter is still unknown ([gateway#53](https://github.com/voics-app/gateway/issues/53)).
- Session memory on the cluster is about 210 KiB per session, against 7 to 15 KiB in the local benchmark
  ([gateway#56](https://github.com/voics-app/gateway/issues/56)).

## Gateway CPU request raised to 1000m

The run queue (`vm_total_run_queue_lengths_total`) read 60 to 100 at 250 msg/s and close to 0 below 225, while the pod
used 2 to 3 of 8 cores. Raising the gateway's CPU request from 50m to 1000m (gitops 0.18.1) gave these results on 0.7.1:

| msg/s | deliveries/s | p95 ms | p99 ms | Result |
| --- | --- | --- | --- | --- |
| 200 | 9,978 | 72 | 240 | pass |
| 225 | 11,227 | 47 | 84 | pass |
| 250 | 12,472 | 179 | 287 | pass, one run only |
| 300 | 14,602 (97.5 % delivered) | 8,164 | 8,925 | fail, run stopped |

A partial repeat gave p99 46 ms at about 188 msg/s and 60 ms at about 212 msg/s. Both repeats were stopped by the load
guard because the api reached 491 MiB of 512 MiB, not by the gateway
([api issue](https://github.com/voics-app/api/issues/119)). Send p99 rose to 24 to 36 ms, from about 15 ms. The run queue still reaches about 100
at 300 msg/s, so the limiter is not fully explained.

## Limits of these results

- Each rate had one to three runs of 60 s, so a long soak could give a lower number.
- All message load went to one guild with 50 receivers. Many guilds or larger guilds were not tested.
- The load generator ran on one PC. Its limits were not measured separately.
- All test accounts were deleted after each run.

## Update 2026-11-05: api 0.14.1, repeated runs

**Supported figure: 250 messages per second** into one server with 50 receivers, about 12,470 deliveries per second. This replaces the earlier 190 msg/s. It passed in all 5 repeated ramps. 275 is the edge and 300 fails.

The first run on api 0.14.0 failed at 225 msg/s (fan-out p95 3,885 ms), and the api pod was OOMKilled at its 512 MiB limit. The guard had crashed on a failed `kubectl` call shortly before, so it wasn't watching. Both were fixed before the runs below.

- **Cause of the OOM (api#119):** glibc malloc kept the 19 MiB Argon2 matrices in per-thread arenas. Message traffic added nothing. api#124 reuses a bounded pool of matrices, with unchanged Argon2 cost and hash format. Measured locally, 160 registrations at concurrency 16 went from 2,053 MiB to 62 MiB.
- **Guard (gitops#105):** retries a failed sample, aborts after 3 failures in a row, and the load generators stop without a fresh heartbeat.

Results on api 0.14.1, gateway 0.7.1, messages 0.9.0, 60 s steps, 100 senders, 50 receivers, 100 % delivered and no errors in every step:

| msg/s | Runs passed | Fan-out p95 (ms) | Fan-out p99 (ms) |
|---|---|---|---|
| 190 | 3 of 3 | 22 to 40 | 39 to 86 |
| 225 | 3 of 3 | 55 to 116 | 95 to 291 |
| 250 | 5 of 5 | 97 to 124 | 163 to 448 |
| 275 | 1 of 2 | 345 and 2,037 | 441 and 2,543 |
| 300 | 0 of 1 | 4,128 | 4,578 |

The api peaked at 176 MiB across 1,000 signups and deletions, with no restarts. Gateway memory peaked at 385 MiB and the run queue at 108.

Not proven: whether the api's memory trouble caused the slow delivery in the failed run. The gateway limit above 250 msg/s is still unexplained (gateway#53). All figures are for this one VM, one server and 50 receivers.
