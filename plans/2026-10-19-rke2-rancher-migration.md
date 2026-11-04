# Plan: migrate gen-serv from microk8s to RKE2 + Rancher

- Status: proposed (2026-10-19)
- Owner decision: pending (see docs#10)
- Related:
  - gitops#20: dqlite → etcd on microk8s
  - gitops#21: 3-node cluster

## 1. Why

- **microk8s keeps failing.** On microk8s, the dqlite/kine datastore stalled repeatedly (gitops#20). Switching microk8s to etcd fixes the datastore, but then microk8s cannot run HA, so the extra nodes could only join as workers.
- **More nodes are coming.** The owner will add 2 nodes, and we want a control plane that survives losing one node.
- **The owner wants a management UI.** Rancher provides one.

## 2. Choice: RKE2 vs upstream kubeadm

| | **RKE2** (recommended) | Upstream kubeadm |
|---|---|---|
| Is it upstream Kubernetes? | Yes. It is a CNCF-certified distribution with unmodified upstream components. | Yes |
| Datastore | Embedded etcd, managed by RKE2, with automatic snapshots | Stacked etcd that you operate yourself |
| 3-node HA | Native. Join 2 more `server` nodes and etcd forms a quorum of 3. | Possible, but needs a load balancer or VIP and manual certificate and etcd handling |
| Install / upgrade | One binary plus `config.yaml`. Upgrades are one command per node, or the system-upgrade-controller. | kubeadm init/join/upgrade, plus CNI and containerd setup |
| Security defaults | CIS-hardened profile available, SELinux/AppArmor ready | DIY |
| Rancher fit | Rancher's own distribution, so the compatibility matrix is published for it | Supported, but more moving parts |
| Ops effort | Low | High |

**Recommendation: RKE2, with Rancher installed on the same cluster** (the Rancher `local` cluster). kubeadm gives the same Kubernetes with more manual work and no benefit for a 1–3 node home cluster.

## 3. Target architecture

**Now: gen-serv, 1 node**
- RKE2 `server`: etcd, control plane and workloads
- Canal CNI (RKE2 default)
- local-path storage
- Flux, then all Voics layers
- Rancher and cert-manager (Flux HelmReleases)
- Headlamp, kept as a lightweight UI

**Later: 3 nodes, all RKE2 `server`**
- gen-serv, gen-serv-2, gen-serv-3
- etcd quorum of 3, so the cluster survives losing 1 node
- Longhorn for replicated volumes
- Replication raised for Scylla, CNPG, Redpanda and MinIO
- Rancher at 3 replicas

Rancher is exposed at `discordy-rancher.voics.nl` through the existing Cloudflare tunnel. It is IP-locked to the owner's IP, with Cloudflare Access added once Zero Trust is enabled (gitops#14).

## 4. Resources

| | gen-serv now | Needed on a single node with Rancher | Per node at 3 nodes |
|---|---|---|---|
| vCPU | 8 | 8 | 8 |
| RAM | 8 GB | **16 GB** | 16 GB |
| Disk | 98 GB | 150 GB SSD | 150 GB SSD (Longhorn keeps replicas) |

Rancher itself needs about 1.5–2 GiB (Rancher, cert-manager, webhooks and fleet), and the RKE2 server about 1.5 GiB. **8 GB cannot hold Voics plus Rancher, so raise gen-serv to 16 GB before migrating.**

## 5. Version pinning (must check at execution time)

Rancher supports only specific Kubernetes minors. Pick the newest Rancher release, then pin RKE2 to the newest minor in **that release's support matrix**. Do not pick the newest RKE2 first. Record both versions in `infrastructure/configs/cluster-config` and `bootstrap/`.

## 6. Changes in gitops

| Area | Change |
|---|---|
| `bootstrap/10-prepare-node.sh` | Replace with `10-install-rke2.sh`. It writes `/etc/rancher/rke2/config.yaml`, installs a pinned RKE2, enables `rke2-server` and sets up the kubeconfig for `karma`. It is idempotent and supports `ROLE=server JOIN=<url> TOKEN=...` for extra nodes. |
| RKE2 config | `disable: [rke2-ingress-nginx]`, because we deploy ingress-nginx through Flux. Also set `write-kubeconfig-mode: "0640"`, `tls-san: [192.168.1.212, gen-serv]`, `etcd-snapshot-schedule-cron: "0 */6 * * *"` and `etcd-snapshot-retention: 20`. |
| `cluster-config.yaml` | `STORAGE_CLASS: microk8s-hostpath` becomes `local-path`, and later `longhorn` at 3 nodes. |
| `infrastructure/controllers/` | Add `local-path-provisioner` now and `longhorn` later. Add `cert-manager` if it is not present, and `rancher` (HelmRelease, `hostname: discordy-rancher.voics.nl`, `tls: external` because Cloudflare terminates TLS, `replicas: 1`, later 3). |
| Secrets | `RANCHER_BOOTSTRAP_PASSWORD` becomes a GitHub org secret, synced via OpenBao to an ExternalSecret, and added to `secrets/inventory.yaml`. |
| Ops portal | Add a Rancher link card. |
| `bootstrap/lib.sh`, `00-inventory.sh`, `scripts/memory-budget.sh` | Drop the microk8s assumptions. The kubectl is `/var/lib/rancher/rke2/bin/kubectl`, and the memory budget is recalculated for 16 GB. |
| `regions/_template/voice.yaml` | No change. hostNetwork and hostPort work the same on RKE2/Canal. |
| Docs | Update the C4 deployment diagram, `bootstrap/README.md`, and the runbooks (etcd snapshot restore, node join, RKE2 upgrade). |

Everything else (Flux layers, ExternalSecrets, OpenBao, cloudflared, the apps) is Kubernetes-generic and moves over unchanged.

## 7. Migration steps

The gen-serv cluster holds no user data yet: production is not live, and the owner's data is in the local stack. OpenBao is refilled from GitHub secrets. That allows a clean reinstall instead of an in-place migration.

1. **Prep.** Merge the gitops changes from section 6 to `develop`, then cut a release to `main`. Raise gen-serv to 16 GB RAM and 150 GB disk. Take a Proxmox snapshot of gen-serv.
2. **Remove microk8s.** Run `sudo snap remove --purge microk8s`, then confirm no leftover CNI interfaces or iptables rules (reboot).
3. **Install RKE2.** Run `bootstrap/10-install-rke2.sh`. Expect the node Ready and a working etcd snapshot.
4. **Flux.** Run `30-flux.sh`. The layers reconcile, and `infra-configs` waits for OpenBao.
5. **OpenBao.** Run `20-openbao.sh` (DPAPI keystore): init, unseal, configure.
6. **Tunnel and secrets.** Recreate the cloudflared credentials secret. Add the DNS record `discordy-rancher` (create only, never overwrite). Run the `secrets-sync` workflow.
7. **Rancher.** Log in with the bootstrap password, set the admin password and store it (DPAPI and org secret), then disable the bootstrap password.
8. **Verify.**
   - `60-verify.sh`
   - all Flux layers Ready
   - public URLs return 200 or 302
   - voice probe from the LAN
   - ops portal works, and returns 403 from a non-owner IP
   - a 24h soak with no stalls
9. **Rollback** (only if the migration fails at steps 3–8). Restore the Proxmox snapshot to get microk8s back.

## 8. Adding the 2 nodes later (replaces options A–D in gitops#21)

1. Create the VMs (8 vCPU, 16 GB RAM, 150 GB SSD with SSD emulation, Ubuntu 24.04, static IPs).
2. Run `ROLE=server JOIN=https://192.168.1.212:9345 TOKEN=<from OpenBao> 10-install-rke2.sh` on each. etcd grows to 3 members.
3. Optionally add a kube-vip VIP for the API, so `kubectl` and Rancher don't depend on gen-serv's IP.
4. Install Longhorn (replica count 3) and migrate PVCs. Raise replication: Scylla RF=3, CNPG 3 instances, Redpanda 3 replicas, MinIO distributed, OpenBao raft with 3 peers, Valkey with sentinel.
5. Run Rancher and cloudflared with 3 and 2 replicas, with anti-affinity.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Rancher's memory use on 8 GB | Raise to 16 GB first (blocker) |
| Rancher / RKE2 version mismatch | Pin from Rancher's support matrix (section 5) |
| Rancher UI exposed | Tunnel only, IP lock, Cloudflare Access, and no NodePort |
| hostNetwork voice on a different CNI | Covered by the voice probe in step 8. Canal allows hostNetwork. |
| Single node until the 2 extra nodes arrive | etcd snapshots every 6h plus the Proxmox snapshot |

## 10. What happens to the microk8s etcd switch (gitops#20)

If this plan is approved, the gen-serv microk8s rebuild is skipped and we go straight to RKE2. gitops#20 then closes as superseded, and its analysis stays as the reason for the move.
