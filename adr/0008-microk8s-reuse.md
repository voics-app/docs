# 0008 — Reuse the existing microk8s cluster on `gen-serv`

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §12](../specs/2026-10-16-voics-platform-design.md#12-infrastructure)

## Context and Problem Statement

The owner already runs microk8s 1.35 on the Proxmox VM `gen-serv` (192.168.1.212, 7.6 GB RAM), along with existing workloads and a host Prometheus snap. Should Discordy share that cluster, get a new one, or run somewhere else?

## Decision Drivers

- Hardware and budget that already exist
- No disruption to the existing workloads or the Prometheus snap
- GitOps (Flux) and Headlamp for operations
- A path to add more nodes or regions later
- A RAM budget of 7.6 GB, with 16 GB recommended

## Considered Options

1. Reuse microk8s on `gen-serv`, isolated by namespaces and managed by Flux
2. A second VM with k3s dedicated to Discordy
3. Managed Kubernetes in the cloud
4. docker compose on the VM

## Decision Outcome

Chosen option: **1**.

- **Inventory first.** Existing workloads are inventoried before anything is installed and are left untouched.
- **Isolation.** Discordy lives only in its own namespaces: `voics-apps`, `voics-data`, `voics-voice`, `voics-system`, `observability` and `flux-system`.
- **Add-ons.** Only `dns`, `hostpath-storage` and `metrics-server` are enabled.
- **Flux.** Flux is bootstrapped to `discordy-voics/gitops` at `clusters/gen-serv`. Infrastructure controllers and configs are applied before apps, and regions last.
- **Resource limits.** Every component sets requests and limits. ScyllaDB runs in developer mode with 1 core and about 1.5 GB, and Redpanda runs with `--smp 1 --memory 1G`.
- **Monitoring.** The host's Prometheus snap is not touched. Discordy brings VictoriaMetrics and Grafana into `observability`.

### Consequences

- Good, because it has no extra cost, and Flux makes the cluster reproducible from git.
- Good, because additional nodes or regions can join the same cluster (see the [adding-a-region runbook](../runbooks/voice-regions/adding-a-region.md)).
- Bad, because the cluster is tight on memory. The VM was raised to 12 GB (see the update below).
- Bad, because the control plane is a single node and a single VM. This is accepted for v1, and [backup and restore](../runbooks/backup-restore.md) covers recovery.

### Confirmation

- In `gitops` CI, kubeconform validates the manifests and a policy check rejects workloads without resource limits.
- Flux owns only the Discordy namespaces.

## Pros and Cons of the Options

### Option 2 — A second VM with k3s

- Good, because it gives full isolation.
- Bad, because the RAM would be split further on the same host.

### Option 3 — Managed cloud Kubernetes

- Good, because it is elastic and has a managed control plane.
- Bad, because of the recurring cost and the egress charges for voice.

### Option 4 — docker compose in production

- Good, because it is simple, and the same tooling already runs local development.
- Bad, because it has no reconciliation, rolling updates, External Secrets Operator or Headlamp, and it is not GitOps.

## Update 2026-10-19: what running it taught us

- **Datastore.** dqlite (the microk8s default) was replaced by **etcd** (`ha-cluster` disabled; gitops#20). etcd must fsync in under 10 ms, but the VM's main disk is a PERC 6/i HDD RAID (lvmthin `tb`) that manages about 13 MB/s with flushes. Lease renewals timed out, and kubelite (apiserver, scheduler, controller-manager and kubelet in one process) exited on `leaderelection lost`. The etcd data now lives on a separate 16 GB disk on the SSD pool (`local-lvm`, `cache=none`) mounted at `/var/snap/microk8s/common/var/run/etcd` (`gitops/bootstrap/15-etcd-disk.sh`). fsync is about 5 ms, and there have been no restarts since.
- **CPU type.** The Proxmox VM must use CPU type **`host`**. ScyllaDB needs PCLMUL, which the default `qemu64`/`kvm64` model hides.
- **Memory.** The VM has **12 GB**. ScyllaDB runs with `--memory 768M --reserve-memory 128M` inside a 1 Gi limit; seastar's default 1.5 GB reserve cannot fit. ingress-nginx runs 2 workers (one per CPU thread overran its limit on the 12-thread host CPU). Budgets are checked by `gitops/scripts/memory-budget.sh`.
- **Reproducibility.** Flux rebuilds the cluster contents from git, but the VM itself and the bootstrap order are still manual. One-command provisioning (Terraform for Proxmox, Hetzner and AWS) is tracked in gitops#28, and a dev/test environment in gitops#27.

