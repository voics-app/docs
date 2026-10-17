# Voice failover

How Discordy voice recovers from each kind of failure, what happens automatically, and what you must do by hand. The design follows Discord's: the SFU rebuilds its own state, and node loss leads to reallocation by the guild process ([spec §7](../../specs/2026-10-16-voics-platform-design.md#7-voice-video-and-screen-share), [ADR-0004](../../adr/0004-custom-sfu.md)).

| Failure | Automatic? | User impact | Section |
|---|---|---|---|
| SFU process crash | Yes | Audio gap under 3 s, no rejoin | [SFU crash](#sfu-crash) |
| voice-signaling crash | Yes (pod restart + reallocation) | 2–15 s gap, client reconnects | [Signaling crash](#voice-signaling-crash) |
| Node or pod loss | Yes (lease expiry + reallocation) | 10–15 s gap, client reconnects | [Node loss](#node-loss) |
| Whole region down | **No** | Calls fail until guilds are moved | [Region loss](#region-loss) |
| DDoS on a region IP | Partly | Degraded audio, then reconnects | [DDoS](#ddos-on-a-voice-ip) |
| etcd unavailable | Partly | Existing calls continue; new allocations fail | [etcd outage](#etcd-outage) |
| Gateway unavailable | Partly | Existing media continues; joins and leaves fail | [Gateway outage](#gateway-outage) |
| Cloudflare / tunnel down for `discordy-rtc-*` | No | New voice WS connections fail; media continues | [Tunnel outage](#tunnel-outage) |

## SFU crash

**Detection**:

- The `sfu` container restarts: `kubectl -n voics-voice get pods` shows the `RESTARTS` count going up.
- voice-signaling logs `sfu down, restarting` followed by `replayed N sessions`.

**What happens automatically**:

1. The SFU supervisor in voice-signaling notices that the control socket (`127.0.0.1:4101`) has closed.
2. If Kubernetes restarted the container, signaling reconnects to it. Otherwise signaling restarts the process itself.
3. For **every live session**, signaling replays `create_session` with the same ICE ufrag/pwd and remote fingerprint, followed by `set_sink_wants`.
4. Clients keep their voice WebSocket open. ICE consent checks resume, DTLS re-handshakes and media flows again, without any client involvement.

The same mechanism gives zero-downtime SFU upgrades.

**Manual action**: none, unless the container restarts repeatedly.

- If `RESTARTS` keeps climbing (crash loop), read the previous logs with `kubectl -n voics-voice logs <pod> -c sfu --previous`.
- Then [drain the node](draining-a-region.md) and open an incident. A known-bad image can be rolled back with [release → rollback](../release.md#rollback).

**Verify**: audio flows in a test call, and the client debug panel shows `dtls: connected` with no rejoin.

## voice-signaling crash

**Detection**: the pod restarts, or `voice-signaling` returns failures on `/readyz`.

**What happens**:

1. Clients' voice WebSockets drop.
2. If the pod is down longer than the lease (10 s), the etcd key disappears and the gateway reallocates the guild. Otherwise the restarted pod re-registers under the same node ID.
3. Clients ask the gateway again. They either get the same node back or a new one, then reconnect.

**Manual action**: none, unless the pod crash-loops. In that case, drain the node and inspect `kubectl logs <pod> -c voice-signaling --previous`. Typical causes are a wrong `VOICE_TOKEN_SECRET`, an unreachable etcd, or a bad config value.

## Node loss

Causes include power loss, a kernel panic, a network partition, or the pod being evicted.

**Detection**:

- The alert `VoiceNodeLeaseMissing` fires.
- The admin Regions page shows the node as missing.
- `regionctl list` no longer lists it.

**What happens automatically**:

1. The node's etcd lease expires within at most **10 s**, and the key `/discordy/voice/nodes/<region>/<node_id>` is deleted.
2. The gateway's etcd watcher sees the delete. VoiceAllocator reallocates every guild whose `voice:alloc:<srv_id>` pointed at the node to the least-loaded remaining node in the region.
3. The gateway sends a fresh VOICE_SERVER_UPDATE to the connected users. It carries a new voice token, endpoint and region.
4. Clients reconnect to the new node.

**Manual action**:

- **Multi-node region**: none for users. Investigate the node, and [drain](draining-a-region.md) it before bringing it back if it is unstable.
- **Single-node region**: there is nowhere to reallocate to. Go to [Region loss](#region-loss).

**Verify**:

```bash
kubectl -n voics-apps exec deploy/admin-bff -- sh -c \
  'curl -fsS -H "X-Internal-Token: $INTERNAL_SERVICE_TOKEN" http://gateway.voics-apps.svc.cluster.local:4000/internal/v1/admin/stats' | jq '.voice_allocations'
```

No allocation may reference the lost node.

## Region loss

Causes include a site power or ISP outage, router failure, or the only node in the region going down.

Cross-region failover is **not automatic in v1**. The allocator only considers the guild's region, so guilds in a dead region cannot start calls. Users see "no voice server available".

**Procedure**:

1. **Confirm the region is down**, not just one node:
   - `regionctl list` shows no nodes for the region.
   - A request to `https://discordy-rtc-<region>.voics.nl/voice` fails.
2. **Decide whether to wait or move.**
   - If the outage is expected to last less than 15 minutes, for example a router reboot, waiting is fine.
   - Otherwise, move the guilds.
3. **Move the guilds** to a healthy region, normally `nl-home`, with the bulk PATCH loop in [draining → whole region](draining-a-region.md#drain-a-whole-region).
4. **If the dead region is `DEFAULT_VOICE_REGION`**, change the default in `gitops/apps/gateway/production/config.env`. Use the fast path: commit to a `hotfix/*` branch, merge, then run `flux reconcile kustomization apps --with-source`.
5. **Post a status notice** in the Discordy announcement channel.
6. **When the region recovers**:
   1. The nodes re-register by themselves.
   2. Move the guilds back. Keep the list from step 3.
   3. Restore `DEFAULT_VOICE_REGION` if you changed it.

## DDoS on a voice IP

Voice UDP bypasses Cloudflare, so a region's public IP is exposed by design.

**Detection**:

- Inbound traffic spikes on the router.
- Loss on the node goes above 5 %.
- Clients in that region report robotic audio.
- `VoiceNodeHighIngress` fires.

**Actions**:

1. **Drain the node or region** so new calls go elsewhere. Moving the guilds out of the region is the fastest relief.
2. **Rotate the public IP**, if your ISP allows it: reboot the modem, or request a new IP.
   1. Update `VOICE_PUBLIC_IP` and `SFU_PUBLIC_IP` in `regions/<region>/config.env`.
   2. Merge and reconcile.
   3. Then undrain. Clients receive the new IP in the next READY payload.
3. **Filter at the router**:
   - Rate-limit UDP 50000 per source IP.
   - Drop non-DTLS/RTP/STUN payloads, if the router supports DPI.
4. **Contact the ISP**, if the attack saturates the uplink.
5. **Afterwards**, consider an additional region, so traffic can be moved quickly next time.

## etcd outage

**Effects**:

- Voice nodes cannot refresh their leases.
- The gateway cannot watch or list nodes.
- **Existing calls continue.** Media never touches etcd.
- **New allocations fail.** Existing `voice:alloc` entries in Valkey still route joins to running calls.

**Actions**:

1. Check etcd with `kubectl -n voics-data get pods -l app=etcd`, then `kubectl -n voics-data exec etcd-0 -- etcdctl endpoint health`.
2. Fix or restart etcd. If its data is corrupt, restore it from a snapshot ([backup-restore → etcd](../backup-restore.md#etcd)). The contents are only leased keys, so an empty etcd is acceptable: nodes re-register within 3 s of etcd's return.
3. After recovery, check that every node is listed with `regionctl list`.
4. The gateway reconciles its watch. A guild whose node vanished during the outage is reallocated on its next join.

## Gateway outage

**Effects**:

- Media continues between clients and the SFU.
- Joins, leaves, VOICE_STATE_UPDATE and reallocation stop working until the gateway returns.

**Actions**: follow the gateway service runbooks, starting from [release → rollback](../release.md#rollback). Voice recovers automatically once the gateway is back.

## Tunnel outage

**Effects**:

- New voice WebSocket connections to `discordy-rtc-<region>` fail.
- Established WebSockets may drop. Media keeps flowing until the client needs signaling again.

**Actions**:

1. Check the `cloudflared` pods (`kubectl -n voics-system get pods -l app=cloudflared`) and the tunnel health in the Cloudflare dashboard.
2. Restart `cloudflared`. If the tunnel credentials are invalid, rotate them ([secret rotation → Cloudflare tunnel credentials](../secret-rotation.md#cloudflare-tunnel-credentials)).
3. If Cloudflare itself is down, there is nothing to do locally. Watch cloudflarestatus.com.

## Post-incident checklist

- [ ] All regions and nodes are listed and healthy (`regionctl list`, admin Regions page).
- [ ] Guilds that were moved temporarily are moved back, and `DEFAULT_VOICE_REGION` is restored.
- [ ] Every drained node is undrained, or the drain is intentional and documented.
- [ ] An incident note is written, with a timeline, impact and follow-ups. File it in the `docs` repository under `incidents/YYYY-MM-DD-<slug>.md` if the impact lasted more than 15 minutes.
