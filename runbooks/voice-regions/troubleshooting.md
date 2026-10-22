# Voice troubleshooting

This runbook is organised by symptom. Each section moves from the most likely cause to the least likely. The [toolbox](#toolbox) at the end collects the commands used throughout.

## Symptom index

| Symptom | Go to |
|---|---|
| Client stuck on "Connecting to voice" / RTC connecting | [Voice WebSocket fails](#voice-websocket-fails) |
| "No voice server available" | [No allocation](#no-allocation) |
| Connected (green) but nobody hears anything | [No audio after connect](#no-audio-after-connect) |
| One-way audio | [One-way audio](#one-way-audio) |
| Robotic, choppy or delayed audio | [Poor quality](#poor-quality) |
| Video black, frozen or stuck at low resolution | [Video problems](#video-problems) |
| Screen share is black | [Black screen share](#black-screen-share) |
| A new node never receives calls | [Node not receiving allocations](#node-not-receiving-allocations) |
| Voice token rejected / 4004-style close on IDENTIFY | [Token rejected](#token-rejected) |
| SFU restarts repeatedly | [SFU crash loop](#sfu-crash-loop) |
| P2P DMs never connect | [P2P / coturn](#p2p--coturn) |
| Stuck on "Connecting", only the public IP candidate, same router as the node | [LAN clients: NAT hairpin](#lan-clients-nat-hairpin) |
| `etcd registration failed: request timed out` in voice-signaling | [etcd request timeouts](#etcd-request-timeouts) |

## Voice WebSocket fails

The client receives VOICE_SERVER_UPDATE but cannot open `wss://discordy-rtc-<region>.voics.nl/voice`.

1. **DNS**: `dig +short discordy-rtc-<region>.voics.nl` must return Cloudflare IPs. If it returns nothing, the record is missing. Re-run [adding a region → step 8.1](adding-a-region.md#step-8-cloudflare-dns-and-tunnel-route).
2. **Tunnel route**: a Cloudflare 404 or 502, or error 1033, means the tunnel has no ingress rule for the hostname, or `cloudflared` is down.
   - Check the tunnel configuration with step 8.2.
   - Check the connector pods with `kubectl -n voics-system get pods -l app=cloudflared`.
3. **Service**: `kubectl -n voics-voice get svc voice-<region>` must exist and have endpoints (`kubectl -n voics-voice get endpoints voice-<region>`).
4. **Upgrade blocked**: in the Cloudflare zone, **WebSockets** must be enabled (Network → WebSockets). It is on by default.
5. **Hostname depth**: a two-level name such as `rtc.discordy.voics.nl` fails TLS on Universal SSL. Use `discordy-rtc-<region>.voics.nl` ([ADR-0005](../../adr/0005-cloudflare-tunnel.md)).
6. **Wrong URL sent to clients**: `VOICE_PUBLIC_WS_URL` in `regions/<region>/config.env` must match the DNS name exactly. Check the etcd value's `ws_url`.

## No allocation

The gateway found no eligible node.

1. Run `regionctl list`. Look for at least one node in the guild's region with `draining: false`.
2. **Region mismatch**: the guild's `voice_region`, or the channel override, names a region with no nodes. This is often a typo or a removed region. Fix the guild, or add the region.
3. **Everything is draining**: undrain a node ([draining](draining-a-region.md#6-undrain)).
4. **etcd unreachable from the gateway**: look for `etcd` errors in `kubectl -n voics-apps logs sts/gateway | grep -i etcd`. See [failover → etcd outage](failover.md#etcd-outage).
5. **Stale allocation**: `voice:alloc:<srv_id>` points at a node that no longer exists, and reallocation didn't happen. Clear it, and the next join reallocates:

   ```bash
   kubectl -n voics-data exec valkey-0 -- valkey-cli -a "$VALKEY_PASSWORD" DEL voice:alloc:<srv_id>
   ```

## No audio after connect

The voice WebSocket is up and READY was received, but no media flows. This is almost always UDP reachability.

1. **Correct public IP**: the READY payload's `ip` (shown in the client debug panel) must equal the site's current WAN IP. Compare it with `curl -4 ifconfig.me` run on the node.
   - If the IP changed (dynamic IP), update `VOICE_PUBLIC_IP` and `SFU_PUBLIC_IP` and reconcile.
2. **Port forward**: test from outside with the `nc -u` probe in [adding a region → step 6](adding-a-region.md#step-6-router-and-firewall). Stop the SFU first, or probe a temporary port.
3. **Host firewall**: `sudo ufw status | grep 50000` must show `ALLOW`.
4. **SFU bound**: `sudo ss -ulpn | grep 50000` on the node must show the sfu process on `0.0.0.0:50000`.
5. **Hairpin NAT**: the client is on the same LAN as the node and the router has no NAT loopback. Test from mobile data. If that works, enable NAT loopback or accept the limitation.
6. **Client network blocks UDP**: some corporate, hotel or school networks do this. v1 has no TURN fallback for voice ([ADR-0004](../../adr/0004-custom-sfu.md)). Ask the user to try another network.
7. **ICE ufrag mismatch after an SFU restart**: check the signaling logs for `replay failed`. Restart the pod, which forces clients to reconnect.

## One-way audio

1. **The muted side**: check self-mute and server mute, the SPEAK permission bit and the push-to-talk configuration.
2. **The client sends no RTP**: the client debug panel shows outbound packets at 0. The cause is a microphone permission or device issue (Windows privacy settings → Microphone).
3. **Asymmetric NAT**: some routers rewrite the source port inconsistently. The SFU demultiplexes by ICE ufrag and then by source address. Look for `unknown source` drops in the SFU logs. Disabling "SIP ALG" or "UDP session randomisation" on the client's router fixes most cases.
4. **DTX misread as silence**: with Opus DTX, silence sends no packets, which is normal. Confirm that SPEAKING (op 5) events arrive while the user talks.

## Poor quality

1. **Loss and jitter**: the admin Regions dashboard shows client telemetry per region (loss %, jitter, RTT).
   - **One user only**: their Wi-Fi or ISP.
   - **Everyone on one node**: the node or its uplink.
2. **Node saturation**: `cpu_pct` above 80 or `egress_bps` near the uplink capacity means the node is overloaded. Add a node, or move guilds ([capacity worksheet](adding-a-region.md#appendix-a-capacity-worksheet)).
3. **UDP buffer drops**: run `netstat -su | grep -i 'receive buffer errors'` on the node. A climbing count means the sysctls from [adding a region → step 3.5](adding-a-region.md#step-3-prepare-the-os) are missing.
4. **CPU steal on a VM**: `top` shows `st` above 5 %. Move the VM, or give it dedicated cores.
5. **Clock drift**: affects RTCP timing and token validity. Check `chronyc tracking`.

## Video problems

- **Black or frozen video for one viewer**: the viewer's layer switch is waiting for a keyframe. The SFU sends PLI. Check the SFU logs for repeated `pli` without a following keyframe, which points to a sender encoder issue. Ask the sender to toggle the camera.
- **Always low resolution**: the viewer's bandwidth estimate (REMB/TWCC) is low, or MEDIA_SINK_WANTS requests a low quality because the tile is small. This is expected. Enlarge the tile or use pop-out.
- **Simulcast layers missing**: the sender's GPU or encoder does not support simulcast for the chosen codec. The client falls back to a single layer. Check the codec selection in the client debug panel (VP9, AV1 or H.264).
- **Camera limit**: at most 25 cameras per channel (Discord parity). The 26th is refused.

## Black screen share

- **DRM-protected content** (Netflix and similar) is black by design ([ADR-0011](../../adr/0011-no-drm-capture-watch-together.md)). Suggest Watch Together.
- **A hardware-accelerated app on Windows** shows black: try "Window" capture instead of "Screen", or turn off hardware acceleration in that app.
- **No app or system audio**: the Windows loopback option must be selected in the capture picker.

## Node not receiving allocations

1. **Registered?** Run `kubectl -n voics-data exec etcd-0 -- etcdctl get --prefix /discordy/voice/nodes/ --keys-only`.
   - **The key is missing**: check the signaling logs for etcd errors, check `ETCD_ENDPOINTS`, and check the WireGuard link for remote nodes (`ping 10.77.0.1`, `nc -zv 10.77.0.1 2379`).
2. **Lease flapping**: the key appears and disappears. Causes are a clock skew of more than 1 s, a WireGuard link with loss, or etcd under memory pressure. Check `etcdctl lease timetolive`.
3. **`draining: true`** after maintenance: undrain the node.
4. **Wrong region label**: the etcd value's `region` must match the guild's `voice_region` exactly.
5. **It is simply not the least-loaded node**: allocation picks the fewest users, so an empty new node receives the next new guild call in that region. Test with a fresh test guild set to that region.

## Token rejected

voice-signaling verifies the HS256 voice token from VOICE_SERVER_UPDATE (60 s lifetime). It checks `sub`, `sid`, `srv`, `chn`, `node` and `e2ee`.

1. **Secret mismatch**: the gateway and voice nodes must hold the same `VOICE_TOKEN_SECRET`.
   - **After a rotation**: a node that wasn't restarted still holds the old secret. Restart it ([secret rotation](../secret-rotation.md#voice-token-secret)).
   - **Standalone region**: its ESO may be out of sync. Check `kubectl get externalsecret -n voics-voice`.
2. **`node` claim mismatch**: the token names another node ID. Either `VOICE_NODE_ID` differs from the ID registered in etcd, or the client connected to the wrong `ws_url`.
3. **Expired token**: the client took longer than 60 s to connect, or the node's clock is skewed. Check `chronyc tracking`.

## SFU crash loop

1. Read the previous logs with `kubectl -n voics-voice logs <pod> -c sfu --previous`.
2. **Port in use**: `address already in use` on 50000 means another process, or a second voice pod on the same host network, holds the port. Only one voice pod is allowed per node, enforced by the template's anti-affinity and `hostPort`.
3. **Bad configuration**: `SFU_PUBLIC_IP` is not an IPv4 literal.
4. **Panic in the forwarder**: capture the log and the image version, drain the node, and roll back the image ([release → rollback](../release.md#rollback)). Then open an issue in `voice`.

## LAN clients: NAT hairpin

Symptom: both clients (or the owner at home) stay "Connecting", then the session closes after about 15 s; the SFU logs `session opened` but no DTLS. Cause: the client is behind the same router as the node and the only candidate is `PUBLIC_IP:50000`, which the router does not hairpin.

1. In `prod-smoke.spec.ts` the `voice-diag` / `voice-selected-pair` lines show the remote candidates and the selected pair (or `chrome://webrtc-internals`).
2. The remote candidates must include the node LAN IP. If not, check `VOICE_LAN_IP` in the pod env (`kubectl -n voics-voice exec deploy/voice-nl-home -c voice-signaling -- printenv VOICE_LAN_IP`) and that voice-signaling is 0.1.4 or later.
3. From an external network (mobile hotspot) the public candidate must work: confirm the router forwards UDP 50000 to the node.
4. If UDP to the SFU is blocked entirely, the client relays through coturn (`typ relay` local candidate in the selected pair).

## etcd request timeouts

`etcd registration failed: ... etcdserver: request timed out` comes from slow disk fsync on the VM (`slow fdatasync` of 1-4 s in `kubectl -n voics-data logs etcd-0`), not from the client or network. voice-signaling 0.1.4 treats the failed call as a retry on the next 3 s tick (and no longer crashes `NodePresence` on late replies). If it persists, move the etcd data dir to a faster disk or reduce competing I/O on the VM; the 3-node etcd plan (gitops#20/#21) removes the single-disk dependency.

## P2P / coturn

P2P DMs use WebRTC data channels. coturn (UDP/TCP 3478 on gen-serv) relays only when a direct path fails. Voice calls use the same gateway-issued TURN credentials as a fallback when UDP to the SFU is blocked.

1. **"Peer offline"**: the other device isn't connected to the gateway. This is expected, because P2P requires both peers online.
2. **The relay is needed but fails**:
   - Check that coturn is running (`kubectl -n voics-system get pods -l app=coturn`).
   - Check that the router forwards 3478 UDP and TCP to 192.168.1.212.
   - Check that the TURN credentials (from the static auth secret) are valid. Test with trickle-ice: <https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>.
3. **Identity signature failure**: the DTLS fingerprint signature doesn't verify against the peer's device identity key. Ask the user to re-verify the safety number. If it persists, treat it as a possible MITM and do **not** bypass the check.

## Toolbox

```bash
# All registered voice nodes, compact
kubectl -n voics-data exec etcd-0 -- etcdctl get --prefix /discordy/voice/nodes/ --print-value-only | jq -c '{node_id,region,users,cpu_pct,draining,version}'
regionctl list

# Watch a node's lease
kubectl -n voics-data exec etcd-0 -- etcdctl get /discordy/voice/nodes/<region>/<node_id> -w json | jq '.kvs[0].lease'
kubectl -n voics-data exec etcd-0 -- etcdctl lease timetolive <lease-hex-as-decimal>

# Allocation of a guild
kubectl -n voics-data exec valkey-0 -- valkey-cli -a "$VALKEY_PASSWORD" GET voice:alloc:<guild_id>

# Gateway voice stats
kubectl -n voics-apps exec deploy/admin-bff -- sh -c 'curl -fsS -H "X-Internal-Token: $INTERNAL_SERVICE_TOKEN" http://gateway.voics-apps.svc.cluster.local:4000/internal/v1/admin/stats' | jq

# Logs
kubectl -n voics-voice logs deploy/voice-<region> -c voice-signaling --since=15m
kubectl -n voics-voice logs deploy/voice-<region> -c sfu --since=15m

# Node-level UDP health
sudo ss -ulpn | grep 50000
netstat -su | grep -iE 'packet receive errors|buffer errors'
sudo tcpdump -ni any udp port 50000 -c 50
```
