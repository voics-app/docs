# Read-state accounting: coordinated rollout and recovery

This is the procedure for the proposed [ADR 0026](../adr/0026-atomic-read-accounting.md) writer. It is not evidence that the writer or backups are live. Root release coordination owns execution. No new server, cluster join, database reset or live migration is authorized by this document.

## Before rollout

1. Land the recipient contract and compatible API runtime before the messages writer. Verify `/internal/v1/channels/{id}/notification-recipients` against controlled permitted, muted, hidden and private-mode cases. A missing or failing endpoint produces missing counts; the writer never falls back to raw mentions or push-token holders.
2. Record the effective `SCYLLA_KEYSPACE`, proposed `SCYLLA_READ_STATE_KEYSPACE`, complete replication map, Scylla version and exact old/new image digests. The default companion is `<main>_reads`; explicitly configure a distinct identifier if the default exceeds the 48-character CQL limit. Do not change the name after initialization without migrating its data.
3. Confirm credentials can create/read/write the companion schema and execute LWT. Bootstrap copies replication from the main keyspace and rejects mismatch. It does not alter either replication policy. Future replication changes must update and repair both keyspaces together.
4. Prepare a maintenance window. Fence new requests, stop/drain **all** old messages writers and wait for in-flight CreateMessage/ACK operations to finish. Prevent automation from restarting an old writer. Old and new writer versions may not overlap, even when ordinary message storage is otherwise compatible.
5. While fenced, capture a verified recovery set: the original keyspace, companion keyspace if it exists, schema, migration tables, manifest, versions and exact names. Follow [backup-restore](backup-restore.md). An old local snapshot or an untested offsite copy is not sufficient evidence of recovery.

## Enable and verify

Start the reviewed writer against the existing cluster and recorded keyspace names. Startup creates only the companion vnode schema; any replication mismatch, invalid name or unsupported LWT blocks readiness. `/readyz` includes both read-state tables as well as the existing service dependencies.

Use synthetic accounts/data in isolated QA first. Verify concurrent mentions from independent processes, ACK of an older message while a newer mention arrives, duplicate accounting delivery, manual unread and reconnect/READY counts. Check silent posts, suppressed reply ping, tokenless users, mutes, role/everyone suppression, offline `@here`, ordinary DMs, permission-denied recipients and private delivery modes. Verify the client consumes the preserved count in MESSAGE_ACK.

Observe failed-accounting warnings by message/channel, `read_state_cas_conflicts_total`, `read_state_cas_exhausted_total`, request latency and unread partition size. A policy-page failure may occur after earlier pages were applied; a failed write may have an unknown outcome. Retrying the same eligible message ID cannot add a second contribution. The current creation path has no durable retry/outbox guarantee, and events or logs alone do not reconstruct historical preferences.

Stored counts and event publication are not one transaction. Include in-flight/reordered MESSAGE_ACK snapshots versus MESSAGE_CREATE in client QA: applying a snapshot before an already-included create can temporarily diverge until reconciliation. The unchanged payload has no accounting revision or snapshot-delivery watermark. Database tests alone do not establish exactly-once live UI state.

The separate proposed [ADR 0027](../adr/0027-versioned-read-state-snapshots.md) closes that inference gap with versioned authoritative snapshots, actual gateway READY hydration and a fresh snapshot during resume. Roll out its compatible messages writer under the same old-writer fence, then gateway, then client. Never overlap writers that increment the version with writers that leave it unchanged. The additive wire protocol retains legacy operation until certified hydration succeeds; it does not repair failed accounting before a commit or provide durable publication. QA must prove reordered/duplicate snapshots and lost-event recovery, not just stored counts.

## Data semantics and limits

- The old `read_states` table remains the channel discovery index and preserved migration baseline. READY resolves companion metadata for every initialized channel, with at most 16 concurrent reads.
- Legacy aggregate counts have no message-ID ledger. Initialization preserves the old count once. The first advancing normal ACK clears that untracked baseline and retains newer tracked mentions. Stale/duplicate normal ACKs do not clear newer counts or move the marker backward.
- Manual unread sets the requested marker/count, starts a new contribution generation and retains delivery deduplication plus the acknowledged high watermark. It does not recount already acknowledged history. Future unique messages add to its explicit baseline.
- At most 16 recipient writes run concurrently per page. Direct-only guild posts seek each exact mentioned user; roles, broadcasts and DMs follow all pages. No device token is required. Policy is current per page, not an atomic snapshot of an entire guild.
- Unacknowledged deliveries retain one ledger row and one contribution row; manual unread removes obsolete contributions but retains needed ledger rows. ACK removes acknowledged ranges in its conditional batch. There is no TTL that silently re-enables duplicates. Large unread partitions remain a scaling concern; local measurements are not production capacity certification.
- Local admission gates are cached with a 4096-partition cap and 60-second idle expiry. They reduce self-contention without replacing distributed CAS. The 1024-message load regression checks live rows of 2049, 1025, 513 and 1 after initial deliveries, half ACK, manual unread and full ACK; it also asserts actual cross-repository CAS conflicts and zero retry exhaustion.

## Backup and restore

Treat the original keyspace and the configured companion as **one recovery unit**. Back up schema, replication/durable-write settings, every table's SSTable components, both migration tables and the configured-name manifest. A complete restore must include discovery rows and authoritative metadata/ledger from a compatible point in time. A companion-only or original-only restore can hide channels, revive counts or permit duplicate contributions.

Fence all messages writers before a coherent recovery checkpoint and throughout restore. Restore into an isolated version-compatible cluster first; verify both-keyspace readiness, representative legacy/initialized channels, concurrent writes, ACK and replay before using the procedure live. Keep the paired backup immutable until that proof completes. Do not drop or recreate the original keyspace to disable tablets. Snowflake reservations have a separate restore barrier in [backup-restore](backup-restore.md#id-reserveringen-na-databaseherstel).

When versioned snapshots are enabled, invalidate all existing gateway sessions and resume buffers before reopening a restored database: restored versions may be smaller than client-held versions. Require fresh identification/READY to establish the restored baseline. Include version columns in the coherent backup; do not reset them in place while clients remain connected.

## Rollback

Before the new writer has accepted writes, keep writers fenced, restore the old effective configuration/image and verify the captured original state. Preserve the companion and backup evidence for investigation.

After new writes, a binary-only rollback is **not safe**: legacy read-state counts are stale. Prefer rolling forward with a compatible fix. Otherwise keep all writers fenced and either restore the complete pre-change recovery set, explicitly accepting all intervening message/read-state data loss, or implement and verify a deliberate companion-to-legacy conversion under the fence. No automatic conversion tool is provided. Keep the new writer disabled after an old writer resumes; a later retry of the migration needs another coordinated checkpoint, not reuse of conflicting old/new state.
