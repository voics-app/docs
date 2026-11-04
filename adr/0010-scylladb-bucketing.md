# 0010 — ScyllaDB message store with 10-day buckets and request coalescing

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §6.2](../specs/2026-10-16-voics-platform-design.md#62-standard-message-storage-scylladb), master plan P5

## Context and Problem Statement

Standard messages are written once, read mostly as recent history per channel, and grow without bound. Hot channels attract many identical concurrent reads. Where and how should messages be stored?

## Decision Drivers

- Partitions of bounded size regardless of channel age or activity
- History reads that walk backwards from the newest message
- Protection against thundering herds on hot channels
- Following Discord's published design (Cassandra, then ScyllaDB, with Rust data services)
- Something that fits the VM today and scales out later

## Considered Options

1. ScyllaDB with the partition key `(channel_id, bucket)`, 10-day buckets, a consistent-hash data service and request coalescing
2. Postgres, partitioned by time
3. ScyllaDB with the partition key `channel_id` only
4. MongoDB or another document store

## Decision Outcome

Chosen option: **1**.

- **Schema.** The messages table is `PRIMARY KEY ((channel_id, bucket), message_id)` with `CLUSTERING ORDER BY (message_id DESC)`. The bucket is computed as `bucket = floor((snowflake >> 22) / 864_000_000)`, which is 10 days of milliseconds since the Voics epoch (2026-01-01). Reactions and pins use the same partition key.
- **History reads** walk buckets backwards until they reach `limit` or the channel's creation bucket.
- **Routing.** The `messages` service routes by consistent hash on `channel_id`, so one instance owns each channel's hot path.
- **Request coalescing.** A `Coalescer<K, V>` built on a `DashMap` of shared futures merges identical concurrent reads into a single in-flight query. See the [C4 code view](../c4/rendered/structurizr-C4-RequestCoalescer.svg).
- **Sizing.** On the single VM, ScyllaDB runs in developer mode with 1 core and about 1.5 GB.

### Consequences

- Good, because partition size is bounded by time, so a 10-year-old busy channel never creates a giant partition.
- Good, because coalescing turns N identical reads into one, which is the main protection for hot channels.
- Bad, because a quiet channel's history read can touch many empty buckets. This is mitigated by `channel_last_message` and by stopping at the creation bucket.
- Bad, because ScyllaDB in developer mode on one node has no replication. This is accepted for v1, and backups are covered in [backup and restore](../runbooks/backup-restore.md).

### Confirmation

- The unit tests in `messages` cover the bucket math and the backwards walk.
- A test asserts that 100 concurrent identical calls result in exactly one repository call.

## Pros and Cons of the Options

### Option 2 — Postgres partitioning

- Good, because it is a single database to operate.
- Bad, because its write amplification and vacuum behaviour don't suit an append-heavy workload at Discord scale.

### Option 3 — `channel_id` only

- Good, because the queries are simpler.
- Bad, because partitions are unbounded, the exact failure Discord documented.

### Option 4 — Document store

- Good, because the schema is flexible.
- Bad, because it is weaker for wide-row time-series access and diverges from the reference architecture.

## More Information

- Discord: "How Discord Stores Billions of Messages" (2017)
- Discord: "How Discord Stores Trillions of Messages" (2023)
