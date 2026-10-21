# 0012 — Full-text message search is deferred

- Status: superseded by [ADR-0018](0018-message-search-postgres-fts.md) (the owner requested search). Was: accepted (deferred), revisit when the VM reaches 16 GB or a second node joins.
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §1 non-goals](../specs/2026-10-16-voics-platform-design.md#non-goals)

## Context and Problem Statement

Discord offers full-text search across a guild's messages. Doing the same well needs an inverted-index engine, which Discord runs on Elasticsearch. The VM has 7.6 GB of RAM, which is already committed to Postgres, ScyllaDB, Redpanda, Valkey, MinIO, the services and observability. Should v1 ship search?

## Decision Drivers

- RAM budget: an Elasticsearch-class engine needs 2–4 GB to be useful
- Delivering the core parity features first
- Privacy: only Standard messages could ever be indexed
- Keeping the design open so search can be added without migrations

## Considered Options

1. Defer search, and design the event stream so an indexer can be added later
2. OpenSearch or Elasticsearch now
3. A light engine now (Meilisearch, Tantivy or Quickwit)
4. A ScyllaDB `LIKE` / SASI-style secondary index

## Decision Outcome

Chosen option: **1**. v1 has no full-text search.

- **Design hook.** `discordy.message.v1` already carries MESSAGE_CREATE, MESSAGE_UPDATE and MESSAGE_DELETE with full Standard content. A future `search` service can consume it from the earliest offset, or backfill from ScyllaDB, without changing any producer.
- **Privacy rule.** Ephemeral and P2P messages never reach the server in plaintext, so they will never be searchable server-side. Client-side search over the local SQLCipher store is the path for them.

### Consequences

- Good, because the RAM goes to the components v1 needs, and the scope stays deliverable.
- Bad, because there is a visible parity gap. Users can only scroll history, plus pins.

### Revisit when

- The VM has at least 16 GB, or a second node is available, **and**
- the core parity list has shipped. The likely choice is then Tantivy or Quickwit (Rust, small footprint), behind a `search` service fed from Redpanda.

## Pros and Cons of the Options

### Option 2 — OpenSearch or Elasticsearch

- Good, because it is what Discord uses and the most capable option.
- Bad, because it needs too much memory for the current VM.

### Option 3 — Light engine

- Good, because it is feasible in about 500 MB.
- Bad, because it is still extra scope and memory in v1. It is the preferred option when this ADR is revisited.

### Option 4 — Database-side matching

- Good, because it adds no new component.
- Bad, because it gives poor relevance and performance, and full scans hurt the hot path.
