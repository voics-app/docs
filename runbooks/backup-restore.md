# Backup and restore

Discordy runs on a single VM (`gen-serv`), so backups are the only protection against losing data. This runbook defines what is backed up, where and how often, and how to restore each store.

## Policy

| Store | What | Method | Frequency | Retention | RPO | RTO |
|---|---|---|---|---|---|---|
| [Postgres](#postgres) (`discordy`, `discordy_admin`) | All relational data | CloudNativePG barman: base backups + continuous WAL archiving to the MinIO bucket `discordy-backups`, mirrored off-site | Base daily 02:00, WAL continuous | 14 days PITR | ≤ 5 min | 1 h |
| [ScyllaDB](#scylladb) (`discordy` keyspace) | Messages, reactions, pins, read states | `nodetool snapshot` + upload of the SSTables to `discordy-backups` | Daily 03:00 | 14 days | 24 h | 2 h |
| [MinIO](#minio) | Assets, attachments, update feed, backups | `mc mirror` to the off-site target | Hourly | 30 days of versions | 1 h | 4 h |
| [OpenBao](#openbao) | Secrets (encrypted at rest) | Raft snapshot | Daily 01:30 + before any change | 30 days | 24 h | 30 min |
| [etcd](#etcd) | Leased voice registrations only | Snapshot (optional) | Daily | 3 days | n/a | 5 min |
| [Valkey](#valkey) | Resume buffers, presence, rate limits, E2EE inboxes | AOF on the PVC; RDB snapshot | Continuous | Last 2 RDBs | best effort | 10 min |
| [Redpanda](#redpanda) | Events in flight | Not backed up; producers replay | — | Topic retention 7 days | — | 15 min |
| gitops / docs / code | Everything declarative | GitHub | Every push | Forever | 0 | — |
| [Whole VM](#whole-vm) | Disk image of gen-serv | Proxmox `vzdump` (snapshot mode) to the Proxmox backup storage | Weekly, Sunday 04:00 | 4 weeks | 7 days | 2 h |

**Off-site target**: an S3-compatible bucket outside the house, configured in `gitops/infrastructure/data/minio/offsite.yaml`. Use Backblaze B2, Cloudflare R2 or a second location. Without an off-site copy, every backup shares the VM's fate.

> **Private-mode data is deliberately not backed up.** Ephemeral ciphertext in Valkey is transient by design (deleted on ACK, 7-day TTL), and P2P messages never reach the server ([ADR-0003](../adr/0003-delivery-modes.md)). Losing Valkey loses undelivered ephemeral messages, which is accepted.

## Verification drills

Test restores monthly. An untested backup is not a backup.

- [ ] **Postgres**: restore last night's PITR into a scratch cluster `postgres-restore-test`, then run `SELECT count(*) FROM users;`.
- [ ] **ScyllaDB**: restore one day's snapshot into a scratch keyspace `discordy_restore_test`, then read one channel's history.
- [ ] **OpenBao**: restore a snapshot into a throwaway OpenBao and unseal it with the current keys.
- [ ] **MinIO**: fetch a random object from the off-site target and compare its checksum.
- [ ] Record each result in `gitops/docs/restore-drills.md`.

## Postgres

CloudNativePG manages the backups. The cluster manifest `gitops/infrastructure/data/postgres/cluster.yaml` defines `spec.backup.barmanObjectStore` and a `ScheduledBackup`.

### Check backups

```bash
kubectl -n voics-data get backups.postgresql.cnpg.io
kubectl -n voics-data get cluster postgres -o jsonpath='{.status.firstRecoverabilityPoint}{"\n"}{.status.lastSuccessfulBackup}{"\n"}'
```

### Take an on-demand backup

Take one before migrations or releases:

```bash
kubectl cnpg backup postgres -n voics-data --backup-name pre-release-$(date +%Y%m%d%H%M)
```

### Point-in-time restore

CNPG restores **into a new cluster**:

1. **Pick a target time** (UTC) just before the incident.
2. **Create the restore cluster** `postgres-restore` with `bootstrap.recovery` from the same object store, with `recoveryTarget.targetTime: "2026-10-17 14:05:00+00"`. The template is `gitops/infrastructure/data/postgres/restore-template.yaml`.
3. **Wait** for `kubectl -n voics-data get cluster postgres-restore` to report `Cluster in healthy state`.
4. **Validate** with `kubectl cnpg psql postgres-restore -n voics-data -- -d discordy -c 'select max(id) from users'`.
5. **Cut over**:
   1. Scale `api` and `admin-bff` to 0.
   2. Point the `postgres-rw` service selector at the restore cluster, or rename the clusters using the gitops PR template.
   3. Scale both services back up.
6. **Clear the outbox backlog**. The restore may replay rows that were already published. Consumers are idempotent on the event `id` (P6), so duplicates are harmless.
7. **Decommission the old cluster** after 48 hours.

## ScyllaDB

ScyllaDB runs as a single node in developer mode.

### Back up

This step is automated by the CronJob `scylla-backup` in `voics-data`:

```bash
kubectl -n voics-data exec scylla-0 -- nodetool snapshot -t daily-$(date +%F) discordy
kubectl -n voics-data exec scylla-0 -- sh -c \
  'cd /var/lib/scylla/data/discordy && tar czf - */snapshots/daily-$(date +%F)' \
  | mc pipe discordy/discordy-backups/scylla/daily-$(date +%F).tar.gz
kubectl -n voics-data exec scylla-0 -- nodetool clearsnapshot -t daily-$(date +%F) discordy
```

The schema lives in `messages/migrations` (CQL), so it can always be recreated from git.

### Restore

1. Scale `messages` to 0.
2. Recreate the keyspace and tables with the `messages` migration job: `kubectl -n voics-apps create job --from=cronjob/messages-migrate messages-migrate-restore`.
3. Copy the snapshot into each table's `upload/` directory, then run `nodetool refresh discordy <table>`:

   ```bash
   mc cat discordy/discordy-backups/scylla/daily-YYYY-MM-DD.tar.gz | kubectl -n voics-data exec -i scylla-0 -- sh -c \
     'mkdir -p /tmp/restore && tar xzf - -C /tmp/restore'
   # for each table dir: cp /tmp/restore/<table>-*/snapshots/daily-*/* /var/lib/scylla/data/discordy/<table>-*/upload/
   kubectl -n voics-data exec scylla-0 -- nodetool refresh discordy messages
   ```

4. Scale `messages` back up. Messages created after the snapshot are lost, apart from the copies still in Redpanda (7-day retention). For a best-effort replay, re-consume `discordy.message.v1` MESSAGE_CREATE events through the `messages` replay tool, if it is available.

## MinIO

- **Buckets**: `discordy-assets` (api), `discordy-attachments` (messages), `updates` (client feed) and `discordy-backups` (backup sink).
- **Versioning** is enabled on every bucket, so accidental deletes can be undone within 30 days: `mc undo` or `mc cp --version-id`.
- **Off-site mirror**: a CronJob runs `mc mirror --overwrite --remove=false discordy/ offsite/`, hourly.

**Restore one bucket**:

```bash
mc mirror offsite/discordy-attachments discordy/discordy-attachments
```

## OpenBao

> gen-serv runs OpenBao on **pebbledb** storage, so `bao operator raft snapshot` does not apply. Take a consistent copy by scaling `sts/openbao` to 0, tarring the PVC from a helper pod (`tar czf - -C /data .`) and scaling back up (the pod unseals itself, [ADR-0021](../adr/0021-openbao-auto-unseal.md)). Keep the tar apart from the seal key; restoring needs the data plus the seal key Secret (`<KEYSTORE_PREFIX> seal key` in the key store). The pre-migration copy of 2026-10-22 is in `%USERPROFILE%\.discordy\openbao\backup\`. The Raft commands below apply if the storage backend is ever switched to Raft.

```bash
# Snapshot (daily CronJob; run by hand before upgrades)
kubectl -n voics-system exec openbao-0 -- sh -c 'BAO_TOKEN=$(cat /var/run/secrets/bao-snapshot-token) bao operator raft snapshot save /tmp/bao.snap'
kubectl -n voics-system cp openbao-0:/tmp/bao.snap ./bao-$(date +%F).snap
mc cp ./bao-$(date +%F).snap discordy/discordy-backups/openbao/ && rm ./bao-$(date +%F).snap
```

**Restore**:

1. Copy the snapshot into the pod.
2. Run `bao operator raft snapshot restore -force /tmp/bao.snap`. This needs a root token; see [OpenBao → root token](openbao-unseal.md#root-token).
3. Unseal it with the keys that were valid **when the snapshot was taken**.

Keep a note of rekey dates next to the snapshots. If OpenBao is lost and no snapshot exists, re-initialise it ([bootstrap](openbao-unseal.md#first-time-bootstrap)) and re-run `secrets-sync`. GitHub still holds every value.

## etcd

etcd holds only leased keys (`/discordy/voice/nodes/...`). Voice nodes re-register within 3 s, so **an empty etcd is a valid restore**.

```bash
kubectl -n voics-data exec etcd-0 -- etcdctl snapshot save /tmp/etcd.db     # optional
# Restore = delete the PVC and pod; nodes re-register.
kubectl -n voics-data delete pvc data-etcd-0 && kubectl -n voics-data delete pod etcd-0
```

## Valkey

AOF (`appendfsync everysec`) on the PVC survives pod restarts. If the data is corrupt:

1. Delete the PVC and restart the pod.
2. The effects are as follows:

| Data | Effect of losing it |
|---|---|
| Resume buffers | Sessions re-IDENTIFY instead of resuming |
| Presence | Rebuilt from live sessions |
| Rate limits | Reset |
| `voice:alloc:*` | Reallocated on the next join |
| E2EE inboxes | **Undelivered ephemeral messages are lost** |

Announce the loss of undelivered ephemeral messages if it happens.

## Redpanda

Redpanda is not backed up:

- `api` keeps unsent events in the Postgres outbox, and the relay republishes them.
- `messages` publishes after the ScyllaDB write. Events lost in a broker crash mean that some live dispatches are missed. Clients catch up through history and READY.

To recover a broken broker:

1. Delete the PVC and restart the pod.
2. The init job recreates the P6 topics.
3. Consumers restart from their committed offsets, or from latest when the offsets are gone.

## Whole VM

The Proxmox weekly `vzdump` of gen-serv is the last-resort recovery path.

1. Restore the VM image from the Proxmox backup storage. **Restore it under a new VMID first, with the network disconnected**, to avoid an IP conflict.
2. Boot it and stop the old VM, then attach the network.
3. Unseal OpenBao ([routine unseal](openbao-unseal.md#routine-unseal)).
4. Run `flux reconcile kustomization flux-system --with-source`. Flux converges everything that changed after the image was taken.
5. Restore the data stores that are newer than the image (Postgres PITR, Scylla, MinIO) as described above.

### Full disaster recovery order

Use this order when the VM is lost entirely:

1. A new VM with microk8s 1.35 (see [ADR-0008](../adr/0008-microk8s-reuse.md) and WS9).
2. `flux bootstrap`, which brings back the infrastructure controllers.
3. OpenBao: snapshot restore and unseal, or re-init and `secrets-sync`.
4. ESO syncs the secrets.
5. MinIO, mirrored back from off-site, which also brings back `discordy-backups`.
6. Postgres PITR, from barman in MinIO.
7. ScyllaDB snapshot restore.
8. The apps reconcile.
9. The Cloudflare tunnel reconnects, using the same credentials (`CLOUDFLARED_CREDENTIALS_JSON`).
10. Voice regions re-register.
