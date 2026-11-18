# 0016 — Push delivery with bounded back-pressure

- Status: accepted
- Date: 2026-10-18
- Decision recorded: 2026-11-18, implementation and operator review through the linked feature PRs
- Technical story: [docs#9](https://github.com/discordy-voics/docs/issues/9), [api#20](https://github.com/discordy-voics/api/issues/20)
- Related: [research note, post 6](../research/discord-engineering-comparison.md)

## Context and Problem Statement

Voics delivers APNs, FCM and PushKit notifications from `messages/bin/notifier`. Message events
arrive through `discordy.message.v1`; the API owns device tokens and resolves eligible recipients
and notification settings. Bursts can arrive faster than the providers accept requests. This
record confirms the bounded dispatcher already implemented and corrects the original proposal's
outdated no-push/offline-only assumptions. It does not claim that the original acceptance step
occurred before the earlier implementation or that local tests establish real-device delivery.

## Decision Drivers

- A push burst must not take down the API or the event consumers.
- Provider limits (for example a connection with a cap on pending requests) are hard limits.
- Losing some notifications under extreme load is acceptable. Losing the service is not.
- Every drop must be counted and visible.

## Considered Options

1. Unbounded in-memory queue, sending as fast as possible
2. Consumer pulls with demand, bounded buffer, drop when full, counted (Discord's model)
3. Synchronous push inside the event handler
4. Kafka consumer lag as the only buffer, with no in-process limit

## Decision Outcome

**Option 2: bounded demand with counted drops.**

- **Demand.** The dispatcher acquires a slot before removing a queued job. `PUSH_MAX_IN_FLIGHT`
  defaults to 100 across the notifier, including APNs and FCM together. This global bound also
  bounds every underlying provider connection; it is not 100 per connection. A job keeps its slot
  through retries and backoff, then releases it on completion. Reading before acquiring a slot
  would create an extra waiting job outside the configured queue; a regression locks this down.
- **Buffer.** A bounded buffer sits in front of the consumers. Its size comes from the environment and is validated at startup.
- **Drop policy.** Message submissions never wait. A full queue drops new work, increments
  `notifier_pushes_total{provider,outcome="dropped"}`, and does not block event consumption.
  A manually requested broadcast may wait up to 30s per device for queue space, using the same
  queue and send slots. It drops and counts on timeout. Queue depth excludes active jobs; total
  admitted jobs are bounded by queue capacity plus in-flight capacity. Queue/slot gauges and limits
  are exported, and admin Platform health shows provider drops over the preceding five minutes,
  queue depth and sends in flight. No-data remains distinct from zero drops.
- **Retry.** Provider failures are retried with backoff, then recorded. Unrecoverable failures are not retried.
- **Scope.** A live gateway socket does not suppress delivery: a desktop connection or lingering
  mobile background socket says nothing about the destination device's foreground state. The app
  handles foreground duplicates. Effective mute/level/mention/device preferences still apply;
  `@silent` messages do not push. Private/unknown modes never carry plaintext message previews.
  Encrypted message delivery currently bypasses this topic and does not produce ordinary push.

### Consequences

- Good, because a burst cannot exhaust memory or stall the event consumers.
- Good, because the in-flight cap respects provider limits by construction.
- Bad, because some notifications are lost under extreme bursts. The owner must accept this, and the metric makes it visible.
- Bad, because the buffer is a single point of pressure. It must be sized from load tests.

## Pros and Cons of the Options

### Option 1 — Unbounded queue

- Good, because nothing is dropped.
- Bad, because memory grows without limit until the process dies. Discord's post shows this path.

### Option 2 — Demand-driven, bounded, counted drops (chosen)

- Good, because it fails in a controlled way and the failure is measured.
- Bad, because drops are a product trade-off.

### Option 3 — Synchronous push

- Good, because it is simple.
- Bad, because a slow provider blocks event processing for every other feature.

### Option 4 — Kafka lag only

- Good, because Kafka already buffers.
- Bad, because the provider cap is still not enforced in-process, and lag hides the burst until it is too late.

## Validation

The engineered burst baseline is the default 10,000-job waiting buffer. This is an explicit sizing
assumption, not a measured production-arrival forecast. With 100 send slots held by a blocked
provider, the deterministic 10× burst submits 100,000 additional jobs: 10,000 queue, 90,000 drop,
peak send concurrency remains 100, and all 10,100 admitted jobs drain after the provider resumes.
APNs and FCM each export 45,000 drops. The real Prometheus recorder is checked as well as the
dispatcher results. This validates bounded retained jobs and recovery; it is not an RSS benchmark,
provider throughput measurement or proof of actual device delivery.

```sh
cargo test -p discordy-messages-notifier --lib application::dispatcher::tests::ten_times_capacity_burst_is_bounded_and_reports_drops -- --exact --nocapture
cargo test -p discordy-messages-notifier --lib application::dispatcher::tests
cargo test -p discordy-messages-notifier --test pipeline
```

Existing tests also cover startup rejection of invalid queue/in-flight settings, retry/backoff,
attempt limits, permanent failures and invalid-token deletion. The notifier remains a singleton
with `Recreate`; its topic reader has no durable group offset. Replica-safe API/messages IDs do
not make notifier consumption safe to scale. See the [push runbook](../runbooks/push-notifications.md).
