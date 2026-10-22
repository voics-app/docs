# Voice regions

Summary: what a region is, joined versus standalone, how clients land on a node, and where the add, drain, failover and troubleshooting procedures are.

## What a region is

A **region** is a named placement target for voice, such as `nl-home` or `de-fra` (name pattern `^[a-z]{2}-[a-z0-9]{2,12}$`). A **voice node** is one pod per Kubernetes node running `voice-signaling` and the SFU with `hostNetwork` ([voice](02-app-voice.md)). A region has one or more nodes.

## How a client ends up on a node

1. Each guild has a `voice_region`, and a channel can override it. If neither is set, the gateway's `DEFAULT_VOICE_REGION` (`nl-home`) applies.
2. Each node registers `/discordy/voice/nodes/<region>/<node_id>` in etcd under a 10-second lease refreshed every 3 seconds, with its load (`users`, `cpu_pct`, `egress_bps`, `draining`).
3. When the first user joins voice in a guild, the gateway picks the non-draining node of the region with the fewest users (ties by CPU) and remembers it in Valkey, so **all voice channels of a guild share one node**.
4. The client connects to `wss://discordy-rtc-<region>.voics.nl/voice` through Cloudflare. Media goes straight to the node's public IP over UDP (port 50000), because UDP cannot pass Cloudflare's proxy.

A region needs a node that reaches the central etcd and Redpanda, a public UDP port, a Cloudflare hostname for port 4100 and a `gitops/regions/<region>/` overlay.

## Joined or standalone

| | Joined | Standalone |
|---|---|---|
| What | Worker node in the gen-serv microk8s cluster | Separate microk8s cluster at the site |
| Use when | The site is on the home LAN or has a reliable private link (WireGuard) | The site is remote or you want failure isolation |
| Secrets, tunnel | gen-serv ESO and `cloudflared` | Local ESO reading the central OpenBao over WireGuard, own tunnel |

Rule of thumb: joined for anything on the home LAN, standalone for every other site. Never stretch a microk8s control plane across the internet.

## Networking: LAN candidate, hairpin and TURN

The SFU is ICE-lite and offers up to two host candidates: the node LAN IP (`VOICE_LAN_IP`, from `status.hostIP`) and the public IP. Clients on the node's own LAN connect directly (routers rarely hairpin UDP to their own public address); external clients use the public candidate. Clients also receive TURN servers from the gateway (`TURN_URLS`, time-limited credentials) and relay through coturn when UDP to the SFU is blocked. See [troubleshooting](../runbooks/voice-regions/troubleshooting.md#lan-clients-nat-hairpin).

## Procedures

| Task | Runbook |
|---|---|
| Add a region or another node (2 to 4 hours for a new site, about 30 minutes for an extra node) | [Adding a region](../runbooks/voice-regions/adding-a-region.md): hardware, network, WireGuard, `regionctl add`, Cloudflare, merge and reconcile, verification |
| Maintenance on a node or region | [Draining](../runbooks/voice-regions/draining-a-region.md): drain, wait for empty, maintain, undrain; forced migration |
| SFU crash, node loss, region loss, DDoS, etcd, gateway or tunnel outage | [Failover](../runbooks/voice-regions/failover.md) |
| Symptoms: no audio, one-way audio, poor quality, black screen share, token rejected | [Troubleshooting](../runbooks/voice-regions/troubleshooting.md) |

`regionctl` (in the `voice` repository) has `add`, `list`, `drain` and `undrain`; the admin portal's Voice regions page can drain and resume nodes too.

## Diagrams and protocol

[Region template deployment diagram](../c4/README.md) and the [voice protocol](../protocols/voice.md) (allocation, etcd discovery, WebSocket opcodes, SFU control, voice token).
