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
- Separate resume connections (gateway#54, in 0.7.1) lowered latency at 200 and 225 msg/s in single runs, but the limit
  did not move. Dedup still rises to 4 ms at 250 msg/s, so shared connections were not the main cause. The limiter is
  still unknown ([gateway#53](https://github.com/discordy-voics/gateway/issues/53)).
- Session memory on the cluster is about 210 KiB per session, against 7 to 15 KiB in the local benchmark
  ([gateway#56](https://github.com/discordy-voics/gateway/issues/56)).

## Limits of these results

- Each rate had one to three runs of 60 s, so a long soak could give a lower number.
- All message load went to one guild with 50 receivers. Many guilds or larger guilds were not tested.
- The load generator ran on one PC. Its limits were not measured separately.
- All test accounts were deleted after each run.
