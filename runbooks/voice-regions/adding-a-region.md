# Adding a voice region

> **This is the authoritative procedure** for bringing a new voice region (or another node in an existing region) into service. Spec §7.1 refers to it, and the [region-template deployment diagram](../../c4/rendered/structurizr-Deployment-RegionTemplate.svg) shows the result.

| | |
|---|---|
| Audience | Platform admin |
| Duration | 2–4 hours for a new site, about 30 minutes for an extra node in an existing region |
| Risk | Low. A region receives no traffic until a guild or channel is set to it, unless it becomes `DEFAULT_VOICE_REGION`. |
| Related | [Draining](draining-a-region.md) · [Failover](failover.md) · [Troubleshooting](troubleshooting.md) · [Cloudflare setup](../cloudflare-setup.md) |

## Contents

1. [Concepts](#concepts)
2. [Choose a topology: joined or standalone](#choose-a-topology-joined-or-standalone)
3. [Prerequisites](#prerequisites)
4. [Step 1: Size the hardware](#step-1-size-the-hardware)
5. [Step 2: Network requirements](#step-2-network-requirements)
6. [Step 3: Prepare the OS](#step-3-prepare-the-os)
7. [Step 4: Private link to gen-serv (WireGuard)](#step-4-private-link-to-gen-serv-wireguard)
8. [Step 5a: Join the gen-serv cluster](#step-5a-join-the-gen-serv-cluster)
9. [Step 5b: Standalone microk8s](#step-5b-standalone-microk8s)
10. [Step 6: Router and firewall](#step-6-router-and-firewall)
11. [Step 7: Generate the region with regionctl](#step-7-generate-the-region-with-regionctl)
12. [Step 8: Cloudflare DNS and tunnel route](#step-8-cloudflare-dns-and-tunnel-route)
13. [Step 9: Merge and reconcile](#step-9-merge-and-reconcile)
14. [Step 10: Verification checklist](#step-10-verification-checklist)
15. [Step 11: Put the region into service](#step-11-put-the-region-into-service)
16. [Rollback](#rollback)
17. [Appendix A: Capacity worksheet](#appendix-a-capacity-worksheet)
18. [Appendix B: What regionctl writes](#appendix-b-what-regionctl-writes)

## Concepts

| Term | Meaning |
|---|---|
| **Region** | A named placement target for voice, such as `nl-home` or `de-fra`. Each guild has a `voice_region`, and a channel can override it. When neither is set, the gateway's `DEFAULT_VOICE_REGION` (`nl-home`) applies. |
| **Voice node** | One pod per Kubernetes node, running `voice-signaling` (Elixir, WS `:4100`) and `sfu` (Rust, UDP `:50000`) with `hostNetwork`. A region has one or more nodes. |
| **Registration** | Each node writes `/discordy/voice/nodes/<region>/<node_id>` to the central etcd under a **10-second lease, refreshed every 3 seconds**. The value is `{node_id, region, ws_url, public_ip, udp_port, users, cpu_pct, egress_bps, draining, version}`. |
| **Allocation** | When the first user joins voice in a guild, the gateway picks the **non-draining node in the guild's region with the fewest `users`**, breaking ties by `cpu_pct`. It stores the choice at Valkey `voice:alloc:<srv_id>`, and **every voice channel of that guild shares the node**. |
| **Public endpoints** | The voice WebSocket goes over Cloudflare at `wss://discordy-rtc-<region>.voics.nl/voice`. Media goes **directly** to `VOICE_PUBLIC_IP:VOICE_UDP_PORT` over UDP, because UDP cannot pass through Cloudflare's proxy. |

A region therefore needs four things:

1. A node that can reach the central etcd, plus Redpanda for telemetry.
2. A public UDP port that reaches the node's SFU.
3. A Cloudflare hostname that reaches the node's port 4100.
4. A `gitops/regions/<region>/` overlay that Flux reconciles.

## Choose a topology: joined or standalone

| | **Joined** (worker node in the gen-serv microk8s cluster) | **Standalone** (separate microk8s cluster at the site) |
|---|---|---|
| Use when | The site is on the same LAN as gen-serv, or there is a reliable low-latency private link (WireGuard) to it | The site is remote, or the link is unreliable, or you want failure isolation |
| Flux | The existing `clusters/gen-serv/regions.yaml` | A new `clusters/region-<region>/` bootstrapped separately |
| Secrets | Already available through the gen-serv External Secrets Operator | A local ESO that reads the central OpenBao over WireGuard |
| Tunnel for the voice WebSocket | The gen-serv `cloudflared` routes `discordy-rtc-<region>` to the node | A local `cloudflared` with its own locally managed tunnel and credentials JSON |
| etcd / Redpanda | In-cluster service DNS | The gen-serv WireGuard address (`10.77.0.1:2379`, `10.77.0.1:19092`) |
| Failure mode | Losing the control plane takes the region down too | The region survives control-plane loss for existing calls, but no new allocations happen without etcd and the gateway |
| Effort | Lower | Higher |

> Rule of thumb: **use joined for anything on the home LAN** (for example a second Proxmox VM), and **standalone for every other site**. Never stretch a microk8s (dqlite) control plane across the internet. Remote sites join as **workers only**, if they join at all.

## Prerequisites

- [ ] **Region name chosen**, of the form `<iso-country>-<site>`: lowercase, matching `^[a-z]{2}-[a-z0-9]{2,12}$`, for example `nl-home`, `de-fra` or `nl-ams2`. It becomes part of a hostname (`discordy-rtc-<region>`) and of etcd keys, and it can't be renamed later without a re-add.
- [ ] **Node ID chosen**, of the form `<region>-<n>`, for example `de-fra-1`. It must be unique across all regions.
- [ ] **A public IPv4** at the site that is static, or at least stable. Note it as `PUBLIC_IP`. IPv6-only is not supported in v1.
- [ ] **Router admin access** at the site, to forward UDP.
- [ ] **Workstation tools**: `kubectl` (with a context for gen-serv), `flux` 2.x, `gh`, `jq`, `curl`, `wg`, `etcdctl` 3.6 and `regionctl` from the latest `voice` release.
- [ ] **Credentials**:
  - The `CLOUDFLARE_API_TOKEN` scope (see [secrets](../../secrets/README.md#cloudflare-api-token)).
  - Write access to `discordy-voics/gitops`.
  - `op` signed in to the Discordy vault.
- [ ] For **standalone**: the region's locally managed tunnel exists, and its credentials secret is in the [inventory](../../secrets/README.md) and in gitops (see [region tunnels](../cloudflare-setup.md#region-tunnels-standalone-clusters)).

## Step 1: Size the hardware

The SFU forwards packets; it does not mix or transcode. Cost therefore scales with **packets out**, which is roughly **egress bandwidth**, not with the number of rooms.

### Minimum and recommended specs per node

| Profile | vCPU | RAM | Disk | Uplink (symmetric) | Typical capacity |
|---|---|---|---|---|---|
| Minimum (audio-first) | 2 | 2 GB | 20 GB SSD | 100 Mbit/s | about 300 concurrent voice users, little video |
| Recommended | 4 | 4 GB | 40 GB SSD | 500 Mbit/s | about 800 voice users, or about 60 concurrent 720p streams |
| Large | 8 | 8 GB | 40 GB SSD | 1 Gbit/s | about 1,500 voice users, or about 150 concurrent 720p streams |

Treat the capacity figures as planning numbers. Confirm them with the admin dashboard's per-node `egress_bps` and `cpu_pct` during the first busy week, and add a node before either one passes **70 %** sustained.

- **CPU**: modern x86-64 (AVX2) or ARM64 (Graviton/Ampere-class). Expect roughly **1 vCPU per 250–400 Mbit/s** of forwarded SRTP, because DTLS-SRTP encryption dominates.
- **RAM**: a node needs about 300 MB, plus about 100 KB per session, plus the microk8s overhead (about 700 MB for a worker and about 1.2 GB standalone).
- **Disk**: holds container images and logs only. Voice nodes are stateless.
- **Virtualisation**: a VM is fine. Give it a **dedicated virtio NIC**, disable CPU ballooning, and pin it to a NUMA node if you can.

### Bandwidth formula

For one guild's call with *N* participants all speaking now and then (Opus with DTX, about 40 kbit/s per active stream including overhead):

```text
ingress ≈ N × 40 kbit/s × activity
egress  ≈ N × (N − 1) × 40 kbit/s × activity        (activity ≈ 0.3 with DTX)
```

For video, each viewer receives one simulcast layer, chosen per subscriber from MEDIA_SINK_WANTS and their bandwidth estimate:

| Layer | Approximate bitrate |
|---|---|
| 180p | 0.15 Mbit/s |
| 360p | 0.5 Mbit/s |
| 720p30 | 1.5 Mbit/s |
| 1080p60 screen share | 4–6 Mbit/s |
| 1440p60 screen share | 8–10 Mbit/s |

```text
video egress ≈ Σ over streams ( viewers × chosen-layer bitrate )
```

Fill in the [capacity worksheet](#appendix-a-capacity-worksheet) before ordering hardware.

## Step 2: Network requirements

**LAN clients and NAT hairpin.** Most home routers do not hairpin UDP: a client on the same LAN as the node cannot reach the node through the router's own public IP. The SFU therefore offers two ICE host candidates in SESSION_DESCRIPTION: the node's LAN address (`VOICE_LAN_IP`, set from the Kubernetes downward API `status.hostIP` in `regions/_template/voice.yaml`) first, then the public `VOICE_PUBLIC_IP`. LAN clients connect directly to the LAN candidate and external clients use the public one; ICE picks whichever pair works. If both addresses are equal (a node with a public IP) the list is deduplicated. Clients also get TURN servers (`TURN_URLS`, time-limited credentials from the gateway); coturn exempts the node IP from its private-range peer deny list so a relay can reach the SFU.

| Direction | Port / protocol | From → to | Why |
|---|---|---|---|
| Inbound | **UDP 50000** (or the region's `VOICE_UDP_PORT`) | Internet → node | SFU media (ICE-lite, DTLS-SRTP) |
| Inbound | UDP/TCP **3478** and UDP **49160-49170** (gen-serv: coturn) | Internet → node | TURN relay fallback for clients whose UDP to the SFU is blocked; the voice client uses the TURN servers from the gateway READY payload |
| Outbound | TCP 443 | Node → internet | GHCR image pulls, Cloudflare tunnel (standalone), GitHub (Flux) |
| Outbound | UDP 7844 / TCP 7844 | Node → Cloudflare | Tunnel transport for `cloudflared` (standalone only) |
| Outbound | UDP 51820 | Node → gen-serv public IP | WireGuard to the control plane (remote sites) |
| Over WireGuard | TCP 2379 | Node → gen-serv etcd | Registration lease |
| Over WireGuard | TCP 19092 | Node → gen-serv Redpanda | Voice-quality telemetry |
| Over WireGuard | TCP 8200 | Node → gen-serv OpenBao | Standalone ESO only |
| Over WireGuard | TCP 16443, 25000, 10250, UDP 4789 | Node ↔ gen-serv | Joined workers only (API server, join, kubelet, VXLAN) |

Further requirements:

- **No inbound TCP is required.** The voice WebSocket arrives through the Cloudflare tunnel.
- **No CGNAT.** The site's public IP must be the router's own WAN address. If the WAN address is in `100.64.0.0/10`, the site is behind CGNAT and cannot host a region. Ask the ISP for a public IPv4 instead.
- **Several nodes behind one public IP**: give each node a **distinct UDP port** (`50000`, `50001`, …) and forward each port to its node. Set `VOICE_UDP_PORT` for each node in [step 7](#step-7-generate-the-region-with-regionctl).

## Step 3: Prepare the OS

Target **Ubuntu Server 24.04 LTS** (minimal install). Run everything as a sudo-capable user, here `karma`.

```bash
# 3.1 Identity
sudo hostnamectl set-hostname de-fra-1          # = node ID
sudo timedatectl set-timezone UTC

# 3.2 Time sync: voice tokens live 60 s and etcd leases 10 s, so clock skew breaks both
sudo apt-get update && sudo apt-get install -y chrony
sudo systemctl enable --now chrony
chronyc tracking | grep -E 'System time|Leap status'   # expect offset < 50 ms, "Normal"

# 3.3 Updates and base tools
sudo apt-get -y full-upgrade
sudo apt-get install -y unattended-upgrades wireguard jq curl ufw
sudo dpkg-reconfigure -plow unattended-upgrades

# 3.4 No swap (kubelet requirement)
sudo swapoff -a && sudo sed -i '/ swap / s/^/#/' /etc/fstab

# 3.5 UDP and network tuning for the SFU
cat <<'EOF' | sudo tee /etc/sysctl.d/90-discordy-voice.conf
net.core.rmem_max = 26214400
net.core.wmem_max = 26214400
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576
net.core.netdev_max_backlog = 5000
net.ipv4.udp_rmem_min = 16384
net.ipv4.udp_wmem_min = 16384
net.ipv4.ip_forward = 1
EOF
sudo sysctl --system

# 3.6 Host firewall: default deny inbound, allow SSH from the LAN, voice UDP, WireGuard
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp     # adjust to the site LAN
sudo ufw allow 50000/udp
sudo ufw allow 51820/udp
sudo ufw allow in on wg0
sudo ufw allow in on vxlan.calico      # joined workers only
sudo ufw allow in on cali+             # joined workers only
sudo ufw enable

# 3.7 microk8s 1.35 (same channel as gen-serv)
sudo snap install microk8s --classic --channel=1.35/stable
sudo usermod -aG microk8s karma
mkdir -p ~/.kube && sudo chown -R karma ~/.kube
newgrp microk8s
microk8s status --wait-ready
```

> **Proxmox VMs**: use the `host` CPU type and a `virtio` NIC with multiqueue equal to the vCPU count. Leave the guest agent installed.

## Step 4: Private link to gen-serv (WireGuard)

Skip this step only when the node sits on the **same LAN** as gen-serv (192.168.1.0/24).

The WireGuard overlay is `10.77.0.0/24`:

| Address | Host |
|---|---|
| `10.77.0.1` | gen-serv |
| `10.77.0.<n>` | Each region node (record the assignment in `gitops/regions/README.md`) |

```bash
# On the region node
wg genkey | tee /tmp/wg.key | wg pubkey > /tmp/wg.pub
sudo install -m 600 /tmp/wg.key /etc/wireguard/wg0.key && rm /tmp/wg.key
cat <<EOF | sudo tee /etc/wireguard/wg0.conf
[Interface]
Address = 10.77.0.11/24
PostUp = wg set %i private-key /etc/wireguard/wg0.key

[Peer]
# gen-serv
PublicKey = <gen-serv wg public key>
Endpoint = <home public IP>:51820
AllowedIPs = 10.77.0.1/32
PersistentKeepalive = 25
EOF
sudo systemctl enable --now wg-quick@wg0

# On gen-serv: append the peer, then reload
sudo tee -a /etc/wireguard/wg0.conf <<EOF

[Peer]
# de-fra-1
PublicKey = $(cat /tmp/wg.pub)   # paste the node's public key
AllowedIPs = 10.77.0.11/32
EOF
sudo systemctl reload wg-quick@wg0

# Verify from the node
ping -c3 10.77.0.1
nc -zv 10.77.0.1 2379
nc -zv 10.77.0.1 19092
```

On gen-serv, etcd and Redpanda must be reachable on the WireGuard address. The gitops infrastructure exposes them as `NodePort`/`hostPort` bound to `10.77.0.1` only, through the `voice-remote-access` component. Check that `gitops/infrastructure/data/etcd` includes it before continuing. Never expose 2379 or 19092 on the public interface.

## Step 5a: Join the gen-serv cluster

Use this for **joined** topologies.

```bash
# On gen-serv
microk8s add-node --token-ttl 600
# Copy the printed "microk8s join <ip>:25000/<token> --worker" line.
# For a remote node, replace <ip> with 10.77.0.1 (the WireGuard address).

# On the region node
microk8s join 10.77.0.1:25000/<token> --worker

# On your workstation (gen-serv context)
kubectl get nodes -o wide                      # new node is Ready
kubectl label node de-fra-1 \
  discordy.voics.nl/voice-region=de-fra \
  discordy.voics.nl/voice-node-id=de-fra-1
kubectl taint node de-fra-1 discordy.voics.nl/voice=true:NoSchedule
```

The taint keeps every other workload off the node. The region template's Deployment tolerates it and selects on `discordy.voics.nl/voice-node-id`.

## Step 5b: Standalone microk8s

Use this for **standalone** topologies.

```bash
# On the region node
microk8s enable dns
microk8s config > ~/.kube/config        # copy this kubeconfig to your workstation as context "region-de-fra"
```

From the workstation:

1. **Add the cluster entry to gitops** (in the same PR as step 7).
   - `clusters/region-de-fra/regions.yaml` is a Flux `Kustomization` with `path: ./regions/de-fra`.
   - `clusters/region-de-fra/infrastructure.yaml` contains only `external-secrets`, `cloudflared` and the ClusterSecretStore, with OpenBao at `https://10.77.0.1:8200`.
2. **Bootstrap Flux**:

   ```bash
   flux bootstrap github \
     --context=region-de-fra \
     --owner=discordy-voics --repository=gitops --private \
     --branch=main --path=clusters/region-de-fra
   ```

3. **Let ESO authenticate to OpenBao.** Create an OpenBao Kubernetes auth mount for this cluster, `auth/k8s-de-fra`, with a role bound to the ESO service account and the `discordy-voice-read` policy. That policy can read only `kv/discordy/shared` and `kv/discordy/ghcr`, plus the region's own path once gitops has one. See [OpenBao bootstrap](../openbao-unseal.md#first-time-bootstrap) for the command pattern.
4. **Create the region tunnel** as a locally managed tunnel. Follow [Cloudflare setup → region tunnels](../cloudflare-setup.md#region-tunnels-standalone-clusters). Its credentials reach the cluster only after gitops and the inventory name them, so this step blocks the standalone cluster's voice ingress until then.

## Step 6: Router and firewall

At the **site router**:

1. **Reserve the node's LAN IP.** Use a DHCP reservation, or a static IP on the node.
2. **Forward UDP `50000`** (or the chosen port) from WAN to `<node LAN IP>:50000`. Forward **UDP only**; the SFU never needs TCP inbound.
3. If the router has "SIP ALG", "UDP flood protection" or "DoS protection" with low thresholds, **disable them for this rule**. They drop RTP bursts.
4. **Check hairpin NAT** (NAT loopback) if clients on the same LAN will use this region. Clients receive the public IP, so without hairpin NAT, LAN clients cannot reach the SFU. Enable NAT loopback, or accept that LAN users use another region.
5. **Remote sites only:** forward nothing else. WireGuard dials out from the node, so gen-serv's router needs UDP 51820 forwarded to gen-serv, once, for all regions.

**At home (gen-serv)**, the forwards from spec §17 stay as they are: UDP 50000 and UDP/TCP 3478 to 192.168.1.212. A **second node behind the home IP** needs its own port, for example UDP 50001 → that node.

**Verify from outside the site** (for example from a phone hotspot):

```bash
# On the node: listen temporarily (the SFU must NOT be running yet)
sudo nc -ulkp 50000
# From outside
echo ping | nc -u -w1 <PUBLIC_IP> 50000      # "ping" should appear on the node
```

## Step 7: Generate the region with regionctl

`regionctl` ships in the `voice` repository. Its pinned interface is:

```text
regionctl add <name> --public-ip <ip> --public-host <host> --gitops-dir <path>
regionctl list
regionctl drain <node_id>
regionctl undrain <node_id>
```

| Env var | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Creates the DNS record (see [secrets](../../secrets/README.md#cloudflare-api-token)) |
| `CLOUDFLARE_ZONE_ID` | The `voics.nl` zone ID |

`regionctl add` does three things:

1. Copies `regions/_template/` into `regions/<name>/` inside the **local gitops checkout** given by `--gitops-dir`, filling in the region's values.
2. Adds the overlay to the regions kustomization.
3. Creates the proxied `discordy-rtc-<name>` DNS record through the Cloudflare API.

You then commit the change and open the PR yourself.

```bash
export CLOUDFLARE_API_TOKEN="$(op read 'op://Discordy/Cloudflare API token/credential')"
export CLOUDFLARE_ZONE_ID="$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"   'https://api.cloudflare.com/client/v4/zones?name=voics.nl' | jq -r '.result[0].id')"

gh repo clone discordy-voics/gitops ~/src/gitops -- --branch main
git -C ~/src/gitops switch -c feature/region-de-fra

regionctl add de-fra   --public-ip <PUBLIC_IP>   --public-host discordy-rtc-de-fra.voics.nl   --gitops-dir ~/src/gitops

regionctl list                       # the new region is listed (from the gitops dir / etcd)

cd ~/src/gitops
git add regions/ && git commit -m "feat(regions): add de-fra"
git push -u origin feature/region-de-fra
gh pr create --base main --title "feat(regions): add de-fra" --body "Adds voice region de-fra (runbook: docs/runbooks/voice-regions/adding-a-region.md)"
```

| Argument | Meaning |
|---|---|
| `<name>` | The region name, which becomes `VOICE_REGION` |
| `--public-ip` | The **public IPv4** that clients send UDP to (`VOICE_PUBLIC_IP` / `SFU_PUBLIC_IP`) |
| `--public-host` | The one-level hostname for the voice WebSocket (`VOICE_PUBLIC_WS_URL` = `wss://<host>`). It **must** be `discordy-rtc-<region>.voics.nl` or another single label under the zone ([ADR-0005](../../adr/0005-cloudflare-tunnel.md)). |
| `--gitops-dir` | Path to a local checkout of `discordy-voics/gitops` on a feature branch |

`regionctl` has no flags for the node ID, the UDP port, the standalone cluster files or the tunnel ingress rule. Before committing, edit them by hand:

- **Node ID and UDP port**: set them in `regions/<name>/config.env` (`VOICE_NODE_ID`, `VOICE_UDP_PORT`, `SFU_UDP_BIND`) and in `patch-node.yaml`, when they differ from the template defaults.
- **Standalone clusters**: add `clusters/region-<name>/` as described in [step 5b](#step-5b-standalone-microk8s).
- **Tunnel ingress rule**: add it as shown in [step 8.2](#step-8-cloudflare-dns-and-tunnel-route).

[Appendix B](#appendix-b-what-regionctl-writes) lists every value.

**Review the PR** against this checklist:

- [ ] `VOICE_REGION`, `VOICE_NODE_ID`, `VOICE_PUBLIC_IP`, `VOICE_UDP_PORT` and `VOICE_PUBLIC_WS_URL` are correct.
- [ ] `SFU_PUBLIC_IP` equals `VOICE_PUBLIC_IP`, and `SFU_UDP_BIND` is `0.0.0.0:<port>`.
- [ ] `ETCD_ENDPOINTS` points to in-cluster etcd (joined) or `http://10.77.0.1:2379` (standalone).
- [ ] `nodeSelector` is `discordy.voics.nl/voice-node-id: <node id>`, and the toleration is present.
- [ ] `SNOWFLAKE_WORKER_ID` is unique within 192–255. Check the other regions' `config.env`.
- [ ] The image tag policy is inherited from the template, with no pinned `:latest`.

## Step 8: Cloudflare DNS and tunnel route

`regionctl add` creates the DNS record (8.1). You always add the **tunnel ingress rule** (8.2) yourself. Run 8.1 by hand only if `regionctl` reported a Cloudflare error.

```bash
CF=https://api.cloudflare.com/client/v4
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
ZONE_ID=${CLOUDFLARE_ZONE_ID}
ACCOUNT_ID=$(curl -s -H "$AUTH" "$CF/zones/$ZONE_ID" | jq -r '.result.account.id')
TUNNEL_ID=<gen-serv tunnel id, or the region tunnel id for standalone>

# 8.1 Proxied CNAME for the voice WebSocket
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' "$CF/zones/$ZONE_ID/dns_records" \
  --data "{\"type\":\"CNAME\",\"name\":\"discordy-rtc-de-fra\",\"content\":\"$TUNNEL_ID.cfargotunnel.com\",\"proxied\":true,\"comment\":\"discordy voice region de-fra (regionctl)\"}" | jq '.success'

```

**8.2 Tunnel ingress rule (gitops, not the API).** The tunnel is locally managed, so its ingress rules live in the `cloudflared` ConfigMap in gitops (`infrastructure/controllers/cloudflared/cloudflared.yaml`). Add this rule before the catch-all `http_status:404` rule, in the same PR as step 7, and let Flux apply it:

```yaml
- hostname: discordy-rtc-de-fra.voics.nl
  service: http://voice-de-fra.voics-voice.svc.cluster.local:4100
```

Notes:

- **Don't create an A record for the UDP endpoint.** Clients receive `VOICE_PUBLIC_IP` in the voice READY payload, so no DNS name is needed for UDP.
- **The tunnel `service` target** is the region's ClusterIP Service that the template creates (`voice-<region>`, port 4100).
- **Never edit or delete** records that don't start with `discordy`. `voics.nl` and `app.voics.nl` belong to another product.

## Step 9: Merge and reconcile

```bash
gh pr merge --repo discordy-voics/gitops <PR#> --squash      # after review
flux reconcile source git flux-system
flux reconcile kustomization regions --with-source            # joined
# standalone: flux --context=region-de-fra reconcile kustomization regions --with-source

kubectl -n voics-voice rollout status deploy/voice-de-fra --timeout=5m
kubectl -n voics-voice get pods -o wide -l discordy.voics.nl/voice-region=de-fra
```

## Step 10: Verification checklist

Complete **every** item before putting the region into service. Paste the output into the PR as a comment for the record.

### Kubernetes

- [ ] The pod is `Running` with 2/2 containers (`voice-signaling`, `sfu`) on the intended node.
- [ ] `kubectl -n voics-voice logs deploy/voice-de-fra -c voice-signaling | grep -i registered` shows the etcd registration.
- [ ] `kubectl -n voics-voice logs deploy/voice-de-fra -c sfu | grep -i listening` shows `0.0.0.0:50000`.
- [ ] Both containers return 200 from `/healthz` and `/readyz` (port-forward or exec).

### Discovery

- [ ] The etcd key exists and carries the right values:

  ```bash
  kubectl -n voics-data exec etcd-0 -- etcdctl get --prefix /discordy/voice/nodes/de-fra/ --print-value-only | jq
  # expect node_id=de-fra-1, region=de-fra, public_ip=<PUBLIC_IP>, udp_port=50000, draining=false
  ```

- [ ] The lease is refreshing: `etcdctl lease timetolive <lease-id>` stays between 7 and 10 s when checked repeatedly.
- [ ] The admin portal's **Voice Regions** page shows `de-fra-1` as healthy with 0 users.
- [ ] `GET https://discordy-api.voics.nl/api/v1/voice/regions` lists `de-fra`.

### Voice WebSocket path

- [ ] DNS: `dig +short discordy-rtc-de-fra.voics.nl` returns Cloudflare anycast IPs (proxied).
- [ ] TLS and upgrade:

  ```bash
  curl -sv -o /dev/null --http1.1 \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    https://discordy-rtc-de-fra.voics.nl/voice 2>&1 | grep -E '^< HTTP|subject:'
  # expect "HTTP/1.1 101 Switching Protocols" and a *.voics.nl certificate
  ```

- [ ] After the upgrade, the server sends HELLO (op 8) with `heartbeat_interval: 13750`. Check with `websocat wss://discordy-rtc-de-fra.voics.nl/voice`.

### Media path

- [ ] From **outside** the site, run a test call:
  1. Create a test guild and set its region to `de-fra`:

     ```bash
     curl -X PATCH https://discordy-api.voics.nl/api/v1/guilds/<id> \
       -H "Authorization: Bearer $TOKEN" -d '{"voice_region":"de-fra"}'
     ```

  2. Join voice with two clients on different networks.
- [ ] Both clients hear each other. The client's voice debug panel shows the candidate `<PUBLIC_IP>:50000`, DTLS `connected` and RTT below 150 ms.
- [ ] Video at 720p and a screen share at 1080p60 reach the other client. Switch the viewer to a small tile and confirm the layer drops (MEDIA_SINK_WANTS).
- [ ] The etcd value shows `users: 2` during the call and `0` after it.
- [ ] Client telemetry (op 23) for the call appears in the admin **Regions** dashboard within 1 minute.

### Resilience

- [ ] **SFU restart**: during a test call, run `kubectl -n voics-voice exec deploy/voice-de-fra -c sfu -- kill 1`. Audio resumes within 3 s without either client rejoining (signaling replays the sessions).
- [ ] **Drain and undrain**: drain `de-fra-1` with `regionctl drain de-fra-1` or from the admin portal. The etcd value shows `draining: true`, and a new call in the test guild is refused, or goes to another node in the region if one exists. Undrain it again (see [draining](draining-a-region.md)).
- [ ] **Node loss** (multi-node regions): stop one node's pod. Within about 10 s, clients on that node reconnect to another node in the region (see [failover](failover.md)).

### Observability

- [ ] VictoriaMetrics has the series `up{job="voice-signaling",region="de-fra"}` and `up{job="sfu",region="de-fra"}`.
- [ ] The Grafana **Voice** dashboard lists the node.
- [ ] Alerts `VoiceNodeLeaseMissing` and `VoiceNodeHighEgress` include the new node (check the alert rule labels).

## Step 11: Put the region into service

1. **Announce it.** The region now appears in the client's region picker for guild owners.
2. **Optionally move specific guilds** with `PATCH /api/v1/guilds/{id} {"voice_region":"de-fra"}`, or set per-channel overrides.
3. **Only if this region should become the default for new guilds**, change `DEFAULT_VOICE_REGION` in `gitops/apps/gateway/production/config.env` in a separate PR. Keep `nl-home` as the default unless you have a reason to change it.
4. **Record the region** in `gitops/regions/README.md`: name, node IDs, site, public IP, WireGuard address, UDP ports, hardware and date added.

## Rollback

Use this to remove a region that failed verification, or one that is being decommissioned.

1. **Stop new allocations.** Drain every node in the region with `regionctl drain <node_id>` or the admin portal (see [draining](draining-a-region.md)) and wait for `users` to reach 0, or for the agreed deadline.
2. **Move guilds away.** List the guilds with `voice_region = <region>` in the admin portal's Trust & Safety → Guilds view, filtered by region. PATCH each one back to `nl-home`, or to another region.
3. **Remove the gitops overlay** with a PR that deletes `regions/<region>/` and its entry in the regions kustomization. For standalone regions, also delete `clusters/region-<region>/`.

   ```bash
   gh pr create --repo discordy-voics/gitops --base main \
     --title "chore(regions): remove <region>" --body "Rollback of region <region>"
   flux reconcile kustomization regions --with-source
   ```

4. **Remove the Cloudflare entries**:
   - Delete the `discordy-rtc-<region>` DNS record.
   - Remove the tunnel ingress rule (the reverse of step 8.2).
   - For standalone regions, delete the region tunnel.
5. **Check that the etcd key is gone.** It expires within 10 s once the pod stops:

   ```bash
   kubectl -n voics-data exec etcd-0 -- etcdctl get --prefix /discordy/voice/nodes/<region>/
   ```

6. **Remove the node**:
   - **Joined:** run `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data`, then `microk8s remove-node <node>` on gen-serv, then `microk8s leave` on the node.
   - **Standalone:** run `flux uninstall --context=region-<region>`, then wipe the machine.
7. **Remove the network configuration**:
   - The router's UDP forward.
   - The WireGuard peer on gen-serv (`/etc/wireguard/wg0.conf`, then reload).
   - The OpenBao auth mount `auth/k8s-<region>`.
   - The region tunnel, and its credentials secret if one was added to gitops.
   - The entry in [`secrets/inventory.yaml`](../../secrets/inventory.yaml), if region-specific entries were added.
8. **Update the record** in `gitops/regions/README.md`.

> The [failover](failover.md) runbook covers partial rollbacks, such as a bad image on the new region only. Reverting the gitops PR is the usual first step.

## Appendix A: Capacity worksheet

| Input | Value |
|---|---|
| Expected peak concurrent voice users in the region | U = |
| Average participants per call | N = |
| Fraction of users with camera on | c = |
| Concurrent screen shares | s = |
| Average viewers per screen share | v = |

| Output | Formula | Result |
|---|---|---|
| Audio egress | `U × (N − 1) × 40 kbit/s × 0.3` | |
| Camera egress | `U × c × (N − 1) × 0.5 Mbit/s` (360p tiles) | |
| Screen-share egress | `s × v × 4 Mbit/s` | |
| **Total egress** | sum × 1.3 headroom | |
| Nodes needed | `total egress ÷ (0.7 × node uplink)`, rounded up, minimum 1 (minimum 2 for redundancy) | |

## Appendix B: What regionctl writes

```text
gitops/
  regions/
    kustomization.yaml            # + "- ./de-fra"
    de-fra/
      kustomization.yaml          # resources: ../_template ; namePrefix/labels ; configMapGenerator
      config.env                  # the values below
      patch-node.yaml             # nodeSelector + toleration for the node
  clusters/region-de-fra/         # standalone only, written by hand (step 5b)
    flux-system/ (created by flux bootstrap)
    infrastructure.yaml
    regions.yaml
```

`config.env` contains:

```dotenv
VOICE_REGION=de-fra
VOICE_NODE_ID=de-fra-1
VOICE_PUBLIC_WS_URL=wss://discordy-rtc-de-fra.voics.nl
VOICE_PUBLIC_IP=<PUBLIC_IP>
VOICE_UDP_PORT=50000
SFU_UDP_BIND=0.0.0.0:50000
SFU_PUBLIC_IP=<PUBLIC_IP>
SFU_CONTROL_BIND=127.0.0.1:4101
SFU_CONTROL_ADDR=127.0.0.1:4101
ETCD_ENDPOINTS=http://etcd.voics-data.svc.cluster.local:2379     # standalone: http://10.77.0.1:2379
KAFKA_BROKERS=redpanda.voics-data.svc.cluster.local:9092         # standalone: 10.77.0.1:19092
SNOWFLAKE_WORKER_ID=193
DISCORDY_ENV=production
LOG_LEVEL=info
```

The secret values (`VOICE_TOKEN_SECRET`, `INTERNAL_SERVICE_TOKEN`, `JWT_PUBLIC_KEY`) come from the `voice-secrets` ExternalSecret in the template. They are never written to the overlay.
