# 0013 — Search index topology for guild message search

- Status: superseded by [ADR-0018](0018-message-search-postgres-fts.md). Was: proposed, applies when ADR-0012 is revisited.
- Date: 2026-10-18
- Deciders: @oussamaelhajoui (pending)
- Technical story: [docs#9](https://github.com/discordy-voics/docs/issues/9), [messages#10](https://github.com/discordy-voics/messages/issues/10)
- Related: [research note, posts 1 and 2](../research/discord-engineering-comparison.md)

## Context and Problem Statement

ADR-0012 defers search and names the likely engine (Tantivy or Quickwit). It does not fix how messages are split into indexes, when indexing happens or when the index is refreshed. Discord's posts show that these choices decide cost and blast radius more than the engine does. Discord runs Elasticsearch with one shard per index for most guilds, a persisted guild-to-shard mapping, lazy indexing on first search and application-controlled refresh. Which of these should Discordy adopt before search is built?

## Decision Drivers

- The VM has no spare RAM (ADR-0012). Index count and refresh cost must stay small.
- Message content lives in ScyllaDB and is the source of truth.
- Ephemeral and P2P messages never reach the server in plaintext and must never be indexed (ADR-0012).
- Failure of one index must not take down search for other guilds.
- Events on `discordy.message.v1` are the input.

## Considered Options

1. Single global index with a `guild_id` field
2. One index per guild, created on demand
3. Application-managed shards: a persisted mapping from guild to one of N shared indexes, allocated by load (Discord's model)
4. Index every guild eagerly on message create

## Decision Outcome

Proposed: **option 3, with lazy indexing and application-controlled refresh.**

- **Mapping.** The guild-to-shard mapping is stored in Postgres (or ScyllaDB) as the source of truth and cached in Valkey for ingest. Allocation prefers the least-loaded shard, measured by indexed volume.
- **Lazy indexing.** A guild is indexed on its first search, in two passes: the last 7 days first, then full history. Indexing for live messages starts once a guild is indexed.
- **Refresh.** The engine's automatic refresh is set to a long interval. After each bulk write the service marks the guild dirty with an expiry. A search on a dirty guild refreshes its shard first. This keeps the cost of small segments out of the write path. Discord's hourly backstop is adopted as the maximum staleness.
- **Content.** Only metadata is indexed (message, channel and guild IDs, and the tokens needed for matching). Results are hydrated from ScyllaDB, and highlighting is done by the client or the hydration step.
- **Privacy.** Ephemeral and P2P messages are never sent to the search pipeline.
- **Engine.** Not chosen here. The ADR-0012 candidates still apply. This ADR only fixes the topology so the engine can be swapped behind a `search` port.

### Consequences

- Good, because one shard serves many small guilds, so the number of indexes stays low and RAM stays within budget.
- Good, because a failed shard affects only its guilds, and a failed shard can be dropped and re-indexed lazily.
- Good, because refresh cost is controlled by the application.
- Bad, because search results can be up to the staleness bound behind when the mapping cache is lost.
- Bad, because a heavy guild on a shared shard needs a migration path. This is future work, as it is for Discord.
- Bad, because a mapping store and a dirty-flag cache are extra state to operate.

## Pros and Cons of the Options

### Option 1 — Single global index

- Good, because it is simplest.
- Bad, because every search touches all data, and one bad write affects everyone.

### Option 2 — One index per guild

- Good, because isolation is perfect and deletion is cheap.
- Bad, because the number of indexes grows with guilds and each costs RAM and master-state overhead, which the VM cannot pay.

### Option 3 — Application-managed shards (chosen)

- Good, because the index count is bounded and allocation is explicit.
- Bad, because the application owns the mapping and rebalancing.

### Option 4 — Eager indexing

- Good, because search is always fresh.
- Bad, because it spends CPU and storage on guilds nobody searches. Discord avoids this for the same reason.

## Validation

Before implementation, a load test plan must show search latency and index size at the target guild count, and a dropped-shard drill must show lazy recovery. Both are part of issue messages#10.
