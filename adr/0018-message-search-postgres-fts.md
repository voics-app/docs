# 0018 - Message search on PostgreSQL full-text, fed from the event bus

- Status: proposed (owner requested search; implemented in messages#11 and client#47)
- Date: 2026-10-21
- Deciders: @oussamaelhajoui
- Supersedes: [ADR-0012](0012-search-deferred.md) and [ADR-0013](0013-search-index-topology.md)
- Technical story: [messages#11](https://github.com/voics-app/messages/issues/11), [client#47](https://github.com/voics-app/client/issues/47)

## Context and Problem Statement

The owner now wants Discord-style message search. ADR-0012 deferred it because an Elasticsearch-class engine does not fit the single 12 GB VM, and ADR-0013 sketched a sharded topology for a dedicated engine. Messages live in ScyllaDB (source of truth) and every create, edit and delete is already published on `discordy.message.v1`. Which engine and topology give useful search with the least memory and the least to operate and back up?

## Decision Drivers

- No new memory-hungry component; the VM budget is tight (`scripts/memory-budget.sh` gates CI).
- Simple to operate, back up and rebuild.
- Permission-aware: only channels the caller can VIEW and READ_MESSAGE_HISTORY.
- Ephemeral and P2P content is end-to-end encrypted and never stored in plaintext, so it is never indexed.
- Reuse the existing event stream; edits and deletes must reach the index.

## Considered Options

1. PostgreSQL full-text (`tsvector` + GIN) in the existing CloudNativePG cluster, fed by a consumer inside the messages service.
2. Tantivy embedded in the messages service, persisted on a PVC.
3. Elasticsearch/OpenSearch, Meilisearch or Quickwit as a new service.
4. ScyllaDB secondary indexes or `LIKE`.

## Decision Outcome

Chosen: **option 1.**

- **Where.** A new database `discordy_search` on the existing Postgres cluster (same app role, no new secret). The messages service owns it. Table `search_messages(channel_id, message_id, guild_id, author_id, tsv, mentions[], has, edited_ms)` with a GIN index on `tsv` and on `mentions`, and btree indexes for guild/channel and author. The text is **indexed, not stored**: hits are hydrated from ScyllaDB, so the table is disposable and rebuildable, and no second copy of message text exists. Text search uses the `simple` configuration (no stemming, so mixed-language servers behave) with `websearch_to_tsquery` syntax (quoted phrases, `-exclusion`, `or`).
- **Why not Tantivy.** It would also work, but a PVC-resident index needs its own snapshot and backup story, a single-writer lock (blocks a second replica) and an index reload on every restart. Postgres is already backed up and monitored, gives transactions (rows and consumer offset commit together) and combines naturally with the filters. Ranking and stemming are weaker than Tantivy; that is acceptable for an MVP and revisited below.
- **Topology.** One table for all guilds and DMs. The shard mapping, lazy indexing and application-controlled refresh of ADR-0013 are not needed at this size and are dropped; Postgres makes rows visible at commit, so there is no refresh interval.
- **Feeding.** A consumer in the messages service reads every partition of `discordy.message.v1` (own client id, offsets stored in `search_offsets`, committed in the same transaction as the rows). MESSAGE_CREATE and MESSAGE_UPDATE upsert; MESSAGE_DELETE and MESSAGE_DELETE_BULK delete. At-least-once delivery is deduplicated by the primary key `(channel_id, message_id)` plus a version check: an upsert only replaces a row whose `edited_ms` is not newer. Messages flagged ephemeral (interaction relays) are skipped. Documented consistency lag: normally under 2 seconds.
- **Backfill and re-index.** `ReindexSearch` walks every channel in `channel_last_message`, skips non-Standard channels and upserts every stored message in 500-row batches. It runs automatically at startup while the stored state is not `complete` (`SEARCH_BACKFILL_ON_START`, default true) and on demand with `POST /internal/v1/search/reindex` (internal token). It is idempotent and safe next to the live consumer. While it is not complete, search responses carry `index_building: true`. To rebuild from scratch, delete the rows of `search_messages` and `search_state`, then restart or call the endpoint.
- **Permissions.** Guild search first asks the index which channels of the guild hold messages, then asks the api access endpoint (5 s cache, 16 in parallel) for each and keeps those with VIEW_CHANNEL and READ_MESSAGE_HISTORY in a Standard channel; the query runs only on that set. A caller who is a member of none gets 403. A channel search checks that one channel (409 with code 50160 for Ephemeral and P2P, so the client falls back to local history). Hits are re-read from ScyllaDB, so a message deleted but not yet de-indexed never appears and is dropped from the index on the spot. `pinned:` uses the channel pins from ScyllaDB (at most 50 per channel).
- **API.** `GET /guilds/{id}/messages/search` and `GET /channels/{id}/messages/search` with Discord parameters (`content`, `author_id`, `mentions`, `has`, `channel_id`, `min_id`, `max_id`, `pinned`, `sort_by`, `sort_order`, `offset`, `limit` 1-25) plus `context` (0-2 messages on either side of a hit). The response is `{total_results, messages: [[...]]}`; each group holds the hit (`hit: true`) and its context, oldest first. The client turns dates into snowflake bounds. `total_results` is capped at 10 000 and the offset at 9975. The ingress routes `/api/v1/guilds/*/messages/search` to messages.
- **Abuse controls.** 10 searches per user per 10 seconds (429 with `Retry-After`), text up to 512 characters, at most 10 users and 20 channels per filter, 5 s statement timeout, a 5-connection pool.
- **Ephemeral and P2P.** Never reach the server in plaintext and are never indexed. The client searches its local SQLCipher history for them.
- **Degradation.** Without `SEARCH_DATABASE_URL`, search is disabled (503) and messaging is unaffected. The index starts in the background and retries until Postgres is ready.

### Consequences

- Good, because there is no new component, memory stays inside the existing Postgres and a few MB in messages, and the index needs no backup (it is rebuildable).
- Good, because edits, deletes and permissions are exact (hydration from the source of truth).
- Bad, because ranking is plain `ts_rank_cd` without stemming or typo tolerance, and substring search (`hel` for `hello`) does not match.
- Bad, because `total_results` is approximate while the index lags, and a guild with very many channels pays one cached access call per channel that holds messages.
- Bad, because Postgres has a 384 Mi limit; a very large corpus would need more memory, `pg_trgm` or partitioning.

### Revisit when

- the corpus passes a few million messages or search p95 exceeds 300 ms: move to Tantivy or Quickwit behind the same `SearchIndex` port (the port hides the engine);
- the api gains a bulk "readable channels of a guild" endpoint, which would replace the per-channel access calls.

## Pros and Cons of the Options

### Option 2 - Tantivy on a PVC

- Good, because it ranks and stems better and is fast.
- Bad, because of the PVC backup, the single writer and a custom offset store.

### Option 3 - Separate engine

- Good, because it is the most capable.
- Bad, because of its memory and the new service to run.

### Option 4 - ScyllaDB indexes

- Good, because there is no new store.
- Bad, because there is no real full-text matching and scans hurt the hot path.
