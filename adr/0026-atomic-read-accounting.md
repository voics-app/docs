# 0026 — Atomic mention accounting in a companion Scylla keyspace

- Status: proposed
- Date: 2026-11-18
- Deciders: Voics maintainer review
- Technical story: [messages#23](https://github.com/discordy-voics/messages/issues/23), [contracts#44](https://github.com/discordy-voics/contracts/pull/44), [api#146](https://github.com/discordy-voics/api/pull/146)

## Context and Problem Statement

The old message writer reads an aggregate mention count and writes the incremented value. Concurrent creates lose increments, a normal ACK clears newer mentions, and replay counts the same message twice. Direct mentions also bypass current recipient preferences, while role, broadcast and ordinary DM mentions are omitted.

The current Scylla 2025.1 deployment uses tablets, which cannot execute the required conditional batches. Existing keyspaces and message data must remain intact. This design does not provision or join a second server.

## Decision Drivers

- Preserve read markers, existing aggregate counts, replication policy and message data.
- Serialize ACK, manual unread and per-message accounting across independent replicas.
- Resolve permitted recipients without depending on device or push-token ownership.
- Fail visibly on dependency errors without inventing exactly-once message delivery.

## Considered Options

1. Conditional batches in a distinct vnode keyspace on the existing Scylla cluster.
2. Unconditional counters or application read-modify-write in the existing table.
3. Upgrade Scylla, recreate the existing keyspace, or introduce another database owner.

## Decision Outcome

Proposed option: **1**. `SCYLLA_READ_STATE_KEYSPACE` defaults to `<SCYLLA_KEYSPACE>_reads` and must be a distinct valid identifier. Bootstrap copies the main keyspace's complete replication map, explicitly disables tablets only for the new keyspace, and rejects an existing companion with a different replication map. A real conditional write validates LWT support before serving. The service never converts, drops or recreates the original keyspace. Readiness reads both the original discovery table and authoritative companion table at quorum.

Metadata, deduplication rows and active-generation contributions share one `(user_id, channel_id)` partition in `read_state_accounting`. Every authoritative write is a conditional batch with `SERIAL` and `QUORUM`, fenced by a fresh metadata revision. A mention transaction inserts a per-message ledger row only if absent and increments once. A normal ACK retains contributions newer than its marker. A manual ACK replaces the visible marker/count and active generation, while retaining the monotonic acknowledged watermark and unacknowledged delivery ledger. Cleanup belongs to the same transaction as the metadata change.

The original `read_states` table remains the per-user channel discovery index. Discovery is written before lazy metadata initialization. Existing aggregate counts become an untracked baseline; their historic message IDs and preferences cannot be reconstructed. An advancing normal ACK clears that baseline, preserving newly tracked mentions above the marker. Authoritative metadata supersedes legacy count columns in both individual and READY reads.

Recipient policy comes from the uncached, token-independent directory in contracts#44/API#146. Ordinary guild messages make no directory request. Direct-only mentions seek the exact user with a one-candidate page; roles, broadcasts and DMs follow all advancing pages, including empty filtered pages. Mutes and level 2 suppress counts. Direct users, matching roles and allowed broadcasts deduplicate; `@here` requires the observed online fact. Level 0 does not turn a plain guild message into a mention. System, ephemeral, silent and author messages remain excluded. A suppressed implicit reply ping does not remove explicit mentions. Preferences apply when the request is evaluated, not retroactively.

### Consequences

- No second cluster or database is required; legacy data and replication are preserved.
- LWT adds quorum latency. There are two live ledger/contribution rows per unacknowledged unique delivery plus metadata; ACK counting scans remaining contributions. Partition growth and contention require measurement and monitoring.
- The writer retries revision conflicts at most 64 times. Exhaustion is an error, not an unconditional fallback. `read_state_cas_conflicts_total` and `read_state_cas_exhausted_total` expose contention.
- Message persistence and recipient accounting remain separate best-effort steps. A crash, failed policy page or failed Scylla operation can leave missing counts. Existing logging exposes failure, but there is no durable accounting outbox or automatic reconciliation claim.
- Old unconditional writers cannot overlap the new writer. Both keyspaces become one backup/restore unit. Switching to the old binary after new writes exposes stale legacy counts; a coherent restore or reviewed state conversion is required.

### Confirmation

Use-case regressions cover the real CreateMessage/ACK seams. Real isolated Scylla 2025.1 tests exercise independent repositories, concurrent increments, ACK races, replay, manual unread, lazy legacy initialization, schema rejection and companion readiness. HTTP tests verify current-policy fetching and malformed/private-page rejection. These are local proofs; no deployment, device-delivery or production load claim is implied.

## Pros and Cons of the Options

Unconditional counters cannot atomically combine deduplication, ACK and manual unread. Application locks do not coordinate independent replicas. Recreating the main keyspace risks existing data; upgrading the server changes the deployment prerequisite. Moving read-state ownership to a second database adds coordination and restore dependencies. The companion keyspace keeps ownership local while making its operational cost explicit.

## More Information

- [Read-accounting rollout, backup and rollback](../runbooks/read-accounting.md).
- [Scylla conditional batches and linearizability](https://docs.scylladb.com/manual/stable/features/lwt.html).
- [Scylla 2025.1 keyspace replication and tablet options](https://docs.scylladb.com/manual/branch-2025.1/cql/ddl.html).

Revisit this design if measured unread partitions or quorum latency exceed the service budget, or when introducing a durable message/accounting outbox. A future tablet migration requires its own tested procedure; changing the configured keyspace to an empty one would lose authoritative read state.
