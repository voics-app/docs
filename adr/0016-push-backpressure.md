# 0016 — Push delivery with bounded back-pressure

- Status: proposed
- Date: 2026-10-18
- Deciders: @oussamaelhajoui (pending)
- Technical story: [docs#9](https://github.com/discordy-voics/docs/issues/9), [api#20](https://github.com/discordy-voics/api/issues/20)
- Related: [research note, post 6](../research/discord-engineering-comparison.md)

## Context and Problem Statement

Discordy has no push delivery to offline devices. The API publishes events through the outbox to Kafka-compatible topics (`api/crates/infrastructure/src/events/kafka.rs`). When push is built, bursts such as a popular event or a large mention storm will arrive faster than a push provider accepts requests. Discord's GenStage post shows the failure mode: the sender stalls, the queue grows, and then the whole system fails. Discord chose demand-driven consumers, a bounded buffer and a deliberate drop policy. What should Discordy do?

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

Proposed: **option 2.**

- **Demand.** Each provider connection has an in-flight cap (Discord uses 100). A consumer requests more only after the provider acknowledges.
- **Buffer.** A bounded buffer sits in front of the consumers. Its size comes from the environment and is validated at startup.
- **Drop policy.** When the buffer is full, new notifications are dropped and counted, rather than blocking the event consumer. The drop is recorded as a metric and shown on the admin dashboard.
- **Retry.** Provider failures are retried with backoff, then recorded. Unrecoverable failures are not retried.
- **Scope.** Push is only sent to users who are not active in the app, as Discord does.

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

api#20 requires a test that the in-flight cap is never exceeded, and a load test at ten times the expected burst that shows no crash and a reported drop count.
