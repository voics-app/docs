# Draining a voice node or region

| | |
|---|---|
| Audience | Platform admin |
| When | Before node maintenance (OS upgrade, reboot, hardware work), when decommissioning a node or region, or when a node misbehaves but still has calls |
| Risk | Low for a single node in a multi-node region. Medium for a whole region, because guilds must be moved, otherwise their new calls fail. |
| Related | [Adding a region](adding-a-region.md) · [Failover](failover.md) · [Troubleshooting](troubleshooting.md) |

## What draining does

1. The gateway marks the node as draining (`POST /internal/v1/voice/nodes/{node_id}/drain`, P4). voice-signaling then publishes `draining: true` in its etcd value at `/discordy/voice/nodes/<region>/<node_id>`.
2. The gateway's VoiceAllocator **skips draining nodes** for new allocations.
3. **Existing calls continue.** Guilds already allocated to the node (Valkey `voice:alloc:<srv_id>`) stay there until their last participant leaves. The node also keeps accepting **new joins to calls already running on it**, so a guild's channels never split across nodes.
4. Once `users` reaches 0, the node is idle and safe to stop.

Draining never disconnects anyone. To move live calls immediately, use a [forced migration](#forced-migration) instead.

## Drain a single node

### 1. Check where the node's users would go

```bash
regionctl list
# or straight from etcd:
kubectl -n voics-data exec etcd-0 -- etcdctl get --prefix /discordy/voice/nodes/<region>/ --print-value-only \
  | jq -c '{node_id, users, cpu_pct, draining}'
```

If this is the **only** non-draining node in its region, read [Drain a whole region](#drain-a-whole-region) first.

### 2. Drain it

Use any one of these three methods:

- **Admin portal**: Voice Regions → node → **Drain**. The action is recorded in the admin audit log.
- **CLI**: `regionctl drain <node_id>`
- **Raw API**, from inside the cluster:

  ```bash
  kubectl -n voics-apps exec deploy/admin-bff -- sh -c \
    'curl -fsS -X POST -H "X-Internal-Token: $INTERNAL_SERVICE_TOKEN" \
     http://gateway.voics-apps.svc.cluster.local:4000/internal/v1/voice/nodes/<node_id>/drain'
  ```

### 3. Confirm

```bash
kubectl -n voics-data exec etcd-0 -- etcdctl get /discordy/voice/nodes/<region>/<node_id> --print-value-only | jq '.draining'
# true
```

Then start a call in a test guild of that region. It must land on another node, or fail if no other node exists.

### 4. Wait for the node to empty

```bash
watch -n 10 "kubectl -n voics-data exec etcd-0 -- etcdctl get /discordy/voice/nodes/<region>/<node_id> --print-value-only | jq '.users'"
```

Calls usually end within a few hours. **Set a deadline** (for example 2 hours, or the next low-traffic window), and use a forced migration if users remain when it passes.

### 5. Do the maintenance

- **Joined node**: run `kubectl drain <k8s-node> --ignore-daemonsets --delete-emptydir-data`. This evicts the voice pod, which is safe at 0 users. Then do the work, and `kubectl uncordon <k8s-node>` when done.
- **Standalone node**: do the work, then `microk8s status --wait-ready`.

### 6. Undrain

After maintenance, undrain the node:

- **Admin portal**: **Undrain**
- **CLI**: `regionctl undrain <node_id>`
- **Raw API**: `POST /internal/v1/voice/nodes/<node_id>/undrain`

Then confirm `draining: false` in etcd, and run a test call in that region. A restarted pod always registers with `draining: false`. Still run the undrain call afterwards, because the gateway keeps its own drain set and must forget the node.

## Drain a whole region

The allocator only picks nodes **in the guild's region**. If every node in a region is draining, **new calls for guilds in that region fail** with "no voice server available". Before draining the last node:

1. **Pick a target region**, normally `nl-home`.
2. **Move the guilds.**
   - **Few guilds**: in the admin portal, filter guilds by `voice_region = <region>` and change each guild's region.
   - **Many guilds**: use the API with a platform-admin token:

     ```bash
     for gid in $(cat guilds-in-region.txt); do
       curl -fsS -X PATCH "https://discordy-api.voics.nl/api/v1/guilds/$gid" \
         -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
         -d '{"voice_region":"nl-home"}'
     done
     ```

   - **Channel overrides** (`voice_region` on a channel) must be changed too. Search for them in the same admin view.
   - The change affects **new** allocations. Calls in progress stay on their current node until they end.
3. **If the region is `DEFAULT_VOICE_REGION`**, change the gateway's default first: edit `DEFAULT_VOICE_REGION` in `gitops/apps/gateway/production/config.env`, open a PR and reconcile.
4. **Drain each node** in the region as above.
5. **Wait** for every node in the region to report `users: 0`.

To bring the region back, undrain its nodes. Guilds you moved **do not move back automatically**. Keep the list from step 2 and PATCH them back if needed.

## Forced migration

Use this when a node must be emptied now: a security issue, a failing NIC, or a deadline that has passed.

1. **Drain the node first**, so reconnecting clients cannot land on it again.
2. **Restart or delete the voice pod**:

   ```bash
   kubectl -n voics-voice delete pod -l discordy.voics.nl/voice-node-id=<node_id>
   ```

3. **What clients experience:**
   1. Their voice WebSocket drops.
   2. The lease expires within 10 s, or immediately on a clean shutdown.
   3. The gateway reallocates the guild to the least-loaded node in the region and re-sends VOICE_SERVER_UPDATE.
   4. The client reconnects automatically. Expect a **2–15 second** audio gap.
4. If the node is the last one in its region, move the guilds first ([Drain a whole region](#drain-a-whole-region)). Otherwise reconnection fails.

## Verification

- [ ] `regionctl list` / the admin portal shows the expected drained or undrained state.
- [ ] No alert `VoiceAllocationFailures` is firing for the region.
- [ ] After undrain: a test call lands on the node, and its `users` count increases.
