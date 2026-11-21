# ScyllaDB maintenance

Use this runbook for any change to the ScyllaDB cluster: adding a node, a rolling restart, a repair, or draining a node before maintenance.

Today the cluster is one node in developer mode (`gitops/infrastructure/data/scylla/scylla.yaml`). Every procedure below is written for a multi-node cluster. Run them on a test cluster first. Scripted automation is tracked in [gitops#18](https://github.com/voics-app/gitops/issues/18) and is not built yet.

**Readiness correction, 18 November 2026:** the current manifest hardcodes the broadcast address to `scylla-0`. Increasing replicas does not create a valid multi-node Scylla cluster. First design distinct node identities/seeds, topology and keyspace replication, then prove backup/restore and join/failure behavior in an isolated test cluster. The present server request is prepare-only and the [backup document](backup-restore.md) is a plan, not a completed prerequisite. Do not run the add/restart/repair/drain procedures on production as part of worker preparation.

## Rules

- Change one node at a time, and never start the next step until the previous one reports normal.
- Check the cluster before every node action. If a check fails, stop and do not work around it.
- Keep enough replicas of every row available: never take more nodes out of service at once than the keyspace replication factor allows for quorum.
- Take a backup before a node is removed. See [backup and restore](backup-restore.md).

## Check the cluster

Run this before any procedure:

```sh
kubectl -n voics-data exec scylla-0 -- nodetool status
```

Every node must show `UN` (up, normal). If a node shows `DN`, `UJ` (joining) or `UL` (leaving), stop. Wait for it to settle, or follow the troubleshooting steps below.

## Add a node

1. Confirm the cluster is `UN` on all nodes (see above).
2. Add the new node to the ScyllaDB StatefulSet in `gitops/infrastructure/data/scylla/`. Keep the seed list unchanged.
3. Let Flux reconcile, then wait for the new node to show `UJ`.
4. Wait until it shows `UN`. Bootstrap can take hours on a large dataset. Do not restart it during bootstrap.
5. Run a repair on the new node: `nodetool repair -pr` (see below).
6. Only then start the next node.

## Rolling restart

Used after a configuration change or an image upgrade.

1. Check the cluster (`UN` on all nodes).
2. Drain the node you are about to restart:

   ```sh
   kubectl -n voics-data exec scylla-<n> -- nodetool drain
   ```

3. Restart the pod: `kubectl -n voics-data delete pod scylla-<n>`. The StatefulSet recreates it.
4. Wait for the node to show `UN` again.
5. Move to the next node only after the previous one has been `UN` for at least one minute.

## Repair

Run repairs after adding a node and on a regular schedule.

```sh
kubectl -n voics-data exec scylla-<n> -- nodetool repair -pr
```

Run one node at a time. Do not run a repair while a node is joining or restarting.

## Drain a node before maintenance

```sh
kubectl -n voics-data exec scylla-<n> -- nodetool drain
```

After the drain, the node stops accepting writes. Perform the maintenance, then restart it as in the rolling restart procedure.

## Troubleshooting

| Symptom | Action |
|---|---|
| A node shows `DN` | Check the pod with `kubectl -n voics-data describe pod scylla-<n>` and its logs. Do not remove it until the cause is known. |
| A node stays `UJ` for much longer than expected | Check disk space and network between nodes. Do not start another join. |
| Repair fails on one range | Re-run it on that node. If it fails again, record the error and stop the maintenance window. |
| The `fs.aio-max-nr` setting is wrong after a host change | Re-run `gitops/bootstrap/10-prepare-node.sh` on the host. |

## Who to tell

Record every node action in the change log with the time, the node name and the result of the status check. If a check fails and cannot be fixed inside the maintenance window, roll back and tell the owner.
