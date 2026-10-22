# 0009 — Redpanda as the Kafka-API event bus

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §3.1](../specs/2026-10-16-voics-platform-design.md#31-communication-rules), master plan P6

## Context and Problem Statement

State changes are published as events. The events must be ordered per guild or channel, delivered at least once, and consumed idempotently by the gateway, the admin aggregator and future services. Which broker should carry them, given a single 7.6 GB VM?

## Decision Drivers

- The Kafka API: partitions keyed by `guild_id` or `channel_id`, consumer groups, and mature clients for Rust and Elixir (brod)
- A small memory footprint and a single binary
- Simple operations: no ZooKeeper, no JVM tuning
- A local dev setup identical to production

## Considered Options

1. Redpanda (Kafka API, C++, no JVM)
2. Apache Kafka in KRaft mode
3. NATS JetStream
4. RabbitMQ streams
5. Postgres LISTEN/NOTIFY only

## Decision Outcome

Chosen option: **1**, Redpanda 25.x, run with `--smp 1 --memory 1G` on the VM and in compose.

- **Topics.** The bus carries six topics: `discordy.{guild,message,user,interaction,telemetry,audit}.v1`. Their keys follow P6.
- **Envelope.** Every event is a JSON envelope with a UUIDv7 `id`, so consumers can deduplicate. The gateway keeps an LRU of the last 10k IDs.
- **Producers.** `api` publishes through a transactional outbox with an idempotent producer. `messages` publishes after the ScyllaDB write succeeds.

### Consequences

- Good, because it speaks the Kafka wire protocol. Moving to Apache Kafka or a managed Kafka later needs only a config change (`KAFKA_BROKERS`).
- Good, because one binary with a 1 GB footprint fits the VM, and the admin API on 9644 simplifies health checks.
- Bad, because Redpanda's licence is BSL for some enterprise features. Only the community features are used.
- Bad, because a single broker means no replication. This is accepted for a single-node v1, and the outbox lets `api` replay unsent events.

### Confirmation

- Every Kafka client is configured only through `KAFKA_BROKERS`.
- The integration tests use a Redpanda testcontainer.
- No code depends on Redpanda-specific APIs other than the admin health probe.

## Pros and Cons of the Options

### Option 2 — Apache Kafka (KRaft)

- Good, because it is the reference implementation.
- Bad, because a JVM heap plus the page cache pressures the 7.6 GB VM.

### Option 3 — NATS JetStream

- Good, because it is very light.
- Bad, because it is not the Kafka API, the Elixir and Rust clients are less mature for consumer-group semantics, and it diverges from the reference architecture.

### Option 4 — RabbitMQ streams

- Good, because it is familiar.
- Bad, because its partitioned, ordered consumption is weaker than Kafka's.

### Option 5 — Postgres only

- Good, because it adds no new component.
- Bad, because it does not fan out to many consumers and has no replay. It also couples ScyllaDB writes to Postgres.
