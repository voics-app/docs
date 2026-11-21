# Environments: provisioning, dev/test, disaster recovery

Every Voics environment is one node (a VM or server) running microk8s, created and brought up by
one command from the `gitops` repository:

```bash
./env.sh up <env>        # Terraform, node bootstrap, Flux, OpenBao, secrets, Cloudflare, seed, verify
```

| Environment | Where | Flux watches | Hostnames | Secrets | Status |
|---|---|---|---|---|---|
| `gen-serv` (production) | Proxmox VM 107, 192.168.1.212 | `main`, `clusters/gen-serv` | `discordy*.voics.nl` | `kv/discordy/*`, GitHub `production` environment | live, adopted into Terraform by import only |
| `dev` (dev/test) | its own small VM (Proxmox by default, Hetzner or AWS possible) | `develop`, `clusters/dev` | `discordy-dev*.voics.nl` | `kv/discordy-dev/*`, GitHub `dev` environment | defined, not deployed yet |

Related: [Bootstrap scripts](https://github.com/voics-app/gitops/blob/develop/bootstrap/README.md) · [Release](release.md) · [OpenBao unseal](openbao-unseal.md) · [Backup and restore](backup-restore.md) · [Cloudflare setup](cloudflare-setup.md)

> Status of this runbook: written together with the code, **not yet run against a real Proxmox, Hetzner or AWS account**. Timings are marked "not measured yet" until the first run (gitops#28, gitops#27).

## What you need (owner actions)

Nothing below is stored in git. Credentials go in environment variables of the shell that runs `./env.sh`.

| Need | Used by | How to provide |
|---|---|---|
| Proxmox API token | Terraform (Proxmox) | `PROXMOX_VE_ENDPOINT`, `PROXMOX_VE_API_TOKEN` (see [Proxmox preparation](#proxmox-preparation)) |
| SSH access to the Proxmox host | Terraform image import | ssh-agent key, `PROXMOX_VE_SSH_USERNAME` |
| Hetzner project token | Terraform (Hetzner) | `HCLOUD_TOKEN` |
| AWS credentials | Terraform (AWS) | `AWS_PROFILE` and `AWS_REGION` |
| An SSH key pair for the node | Terraform, `env.sh` | public key in `terraform.tfvars`, private key in the ssh-agent or `SSH_KEY_PATH` |
| GitHub PAT with `repo` on `gitops` | `30-flux.sh` | `GITHUB_TOKEN` |
| `gh` logged in with admin on the repository (creates the `dev` environment, sets environment secrets) | `25`, `40` | `gh auth login` |
| Cloudflare API token (DNS, Tunnel, Access edit on `voics.nl`) | `40-cloudflare.sh` | `CLOUDFLARE_API_TOKEN`, plus `OWNER_EMAIL` for Access |
| GHCR credentials with `read:packages` | `25-secrets.sh` (dev) | `GHCR_USERNAME`, `GHCR_TOKEN` |
| GitHub PAT for the runner scale set | `20-openbao.sh` / `25-secrets.sh` | `ARC_GITHUB_TOKEN` |
| Key store for the OpenBao recovery keys and seal key | `20-openbao.sh` | 1Password (`op`) or Windows DPAPI; items are named per environment (`OpenBao dev unseal key N`, `OpenBao dev seal key`) |
| Tools on the operator machine | all | `terraform` (1.6 or newer), `kubectl`, `flux`, `gh`, `jq`, `curl`, `openssl`, `ssh`, `perl` |

## New environment from scratch

The Terraform root of an environment lives in `gitops/infra/terraform/envs/<env>`, its Flux and script
settings in `gitops/clusters/<env>/env.conf`. Pick the provider by choosing the Terraform root.

### 1. Merge the code first

Flux bootstraps from the branch the environment watches (`develop` for dev), so the `clusters/<env>`
directory, the overlays and the dev cluster-config must be on that branch before `./env.sh up` runs.

### 2. Proxmox

#### Proxmox preparation

On the Proxmox host (one time, as root). The role below is a starting point; check it against the
[bpg/proxmox documentation](https://registry.terraform.io/providers/bpg/proxmox/latest/docs) for the version you use:

```bash
pveum role add Terraform -privs "Datastore.Allocate Datastore.AllocateSpace Datastore.AllocateTemplate Datastore.Audit Pool.Allocate Sys.Audit Sys.Console Sys.Modify SDN.Use VM.Allocate VM.Audit VM.Clone VM.Config.CDROM VM.Config.Cloudinit VM.Config.CPU VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network VM.Config.Options VM.Migrate VM.PowerMgmt User.Modify"
pveum user add terraform@pve
pveum aclmod / -user terraform@pve -role Terraform
pveum user token add terraform@pve discordy -privsep=0      # prints the secret once
pvesm set local --content iso,vztmpl,backup,snippets,import  # the Ubuntu cloud image is stored as "import"
```

#### Known-good VM settings

The Terraform module `node-proxmox` encodes what production needed:

| Setting | Value | Why |
|---|---|---|
| OS | Ubuntu 24.04 cloud image, cloud-init user + SSH key | repeatable, no installer |
| CPU type | **`host`** | ScyllaDB needs PCLMUL; the default `qemu64`/`kvm64` CPU breaks it |
| Memory | gen-serv 12 GB, dev 8 GB | measured budgets: `scripts/memory-budget.sh` |
| `scsi0` | main disk on the data datastore (production: lvmthin `tb`, HDD RAID, slow flush) | bulk data |
| `scsi1` | 16 GB on an **SSD** datastore (production: `local-lvm`), `cache=none` | etcd needs fsync below 10 ms ([gitops#20](https://github.com/voics-app/gitops/issues/20)); mounted at `/var/snap/microk8s/common/var/run/etcd` by `15-etcd-disk.sh` |
| Datastore of the guest agent | not used | the cloud image has no agent; Terraform does not wait for it |
| Network | static IP, e.g. 192.168.1.212/24 | the router forwards UDP 50000, UDP/TCP 3478 and UDP 49160-49170 to it |
| microk8s | channel `1.34/stable` (variable), **etcd datastore, `ha-cluster` disabled** | k8s-dqlite stalls watches (gitops#20) |

#### Create it

```bash
cd gitops
cp infra/terraform/envs/dev/terraform.tfvars.example infra/terraform/envs/dev/terraform.tfvars   # edit, git-ignored
export PROXMOX_VE_ENDPOINT=https://<pve>:8006/ PROXMOX_VE_API_TOKEN='terraform@pve!discordy=<secret>'
./env.sh plan dev        # read-only, review it
./env.sh up dev          # asks for Terraform approval; AUTO_APPROVE=true skips the question
```

### 3. Hetzner Cloud

Create a read/write project API token, then:

```bash
export HCLOUD_TOKEN=...      # never commit
cp infra/terraform/envs/hetzner-example/terraform.tfvars.example infra/terraform/envs/hetzner-example/terraform.tfvars
TF_ENV=hetzner-example ./env.sh up dev
```

The module creates the server (default `cpx31`, 8 GB), a 16 GB volume for etcd, a firewall (SSH and the
Kubernetes API only from `ssh_allowed_cidrs`; TURN and SFU ports open) and a private network. Because
Hetzner has a static public address, `50-public-ip.sh` uses it directly.

### 4. AWS

```bash
export AWS_PROFILE=discordy AWS_REGION=eu-central-1
cp infra/terraform/envs/aws-example/terraform.tfvars.example infra/terraform/envs/aws-example/terraform.tfvars
TF_ENV=aws-example ./env.sh up dev
```

The module creates an EC2 instance (Ubuntu 24.04, default `t3.xlarge`), a gp3 EBS volume for etcd, a
security group and an Elastic IP in the default VPC. EBS volumes appear as NVMe devices; the module hands
the stable `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_<id>` path to `15-etcd-disk.sh`.

### What `./env.sh up <env>` runs

| Stage | What happens | Re-run safe |
|---|---|---|
| `provision` | `terraform apply`: machine, disks, network; then the cluster module runs `05-install-microk8s.sh`, `10-prepare-node.sh`, `15-etcd-disk.sh` over SSH | yes: scripts are idempotent, the step reruns only when scripts, host or device change |
| `kubeconfig` | `microk8s config` into `~/.kube/discordy-<env>.config` | yes |
| `flux` | `30-flux.sh`: Flux bootstrap with `clusters/<env>` on the environment's branch | yes: does nothing when Flux already syncs the repository |
| `openbao` | `20-openbao.sh`: create the static seal key Secret, init (5 recovery shares, threshold 3), keys to the key store, auto-unseal, policies, Kubernetes auth roles | yes: afterwards it only checks (or restores the seal key Secret) |
| `secrets` | dev: `25-secrets.sh` generates every secret of `secrets/inventory.yaml` into `kv/discordy-dev/*`; production: set the GitHub environment secrets and run the `secrets-sync` workflow | yes: existing paths are left alone |
| `cloudflare` | `40-cloudflare.sh`: tunnel, DNS for this environment's hosts only, Access applications | yes: existing records are never touched |
| `public-ip` | `50-public-ip.sh`: writes `HOME_PUBLIC_IP` into the environment's cluster-config and commits it | yes |
| `wait` | waits until every Flux layer is Ready | yes |
| `seed` | `55-seed.sh`: waits for the seed Job (dev only) | yes |
| `verify` | `60-verify.sh`: Flux layers, secret store, ExternalSecrets, workloads, runners, Headlamp | yes (read-only) |

`./env.sh stages` lists them, `ONLY=flux,verify ./env.sh up dev` runs a subset, `./env.sh verify dev` is
the final gate. `40` and `50` commit to and push the branch Flux watches: run them from a clean checkout
of that branch (`develop` for dev, `main` for gen-serv).

Hard rules that hold for every environment: nothing touches `voics.nl` or `app.voics.nl`; Cloudflare
records are only created, never overwritten, and only under `discordy*` names one level deep; secrets
never touch disk or git; the OpenBao unseal keys of an environment live under their own key-store names.

## Dev/test environment

A second, always-on environment that runs the whole suite from `develop`, separate from production
([gitops#27](https://github.com/voics-app/gitops/issues/27)).

| Topic | Dev | Production |
|---|---|---|
| Machine | its own VM (8 GB by default), never the gen-serv VM | gen-serv |
| Flux | `clusters/dev` on `develop` | `clusters/gen-serv` on `main` |
| Layers | `infrastructure/environments/dev`, `apps/environments/dev`, `regions/dev`, plus `seed` | `infrastructure/*`, `apps`, `regions` |
| Images | `X.Y.Z-dev.N` only (`apps/image-automation-dev`, tag filter plus semver `>=0.0.0-0`); automation commits to `develop` | stable `X.Y.Z` only, automation commits to `main` |
| Hostnames | `discordy-dev` (website), `-api`, `-gateway`, `-cdn`, `-updates`, `-admin`, `-ops`, `-db`, `-grafana`, `-minio`, `-redpanda`, `-headlamp`, `-openbao`, voice `discordy-dev-rtc-nl-dev`, all `.voics.nl`, one level deep | `discordy*.voics.nl` |
| Secrets | OpenBao `kv/discordy-dev/*` (its own OpenBao), GitHub environment `dev` | `kv/discordy/*`, `production` |
| Operator hosts | same IP lock (`OPS_ALLOWED_CIDRS`) and Cloudflare Access as production | same |
| Runners | scale set `discordy-dev`, label `runs-on: discordy-dev` | `discordy` |
| Seed | demo users `alice`, `bob`, `carol`, server "Voics HQ" with text and voice channels, placeholder site | none, ever |
| Resource requests | smaller (Scylla and Redpanda 512M, Postgres 192Mi, VictoriaMetrics 3 days) | gen-serv sizing |

The mechanism that keeps the two apart: every ExternalSecret reads `${SECRETS_PREFIX}/...` and the
cluster-config of each environment sets it (`discordy` or `discordy-dev`); the seed Job and its
manifests are referenced only by `clusters/dev`, and the script refuses to run when `ENVIRONMENT` is
`production`. DNS records for the dev hosts are created by `40-cloudflare.sh ENV=dev`, never by hand, and
only when you run it.

Seed credentials: the demo password is generated into the Kubernetes Secret `voics-apps/seed-credentials`
by `25-secrets.sh` (never in git). Read it with
`kubectl -n voics-apps get secret seed-credentials -o jsonpath='{.data.PASSWORD}' | base64 -d`.

### What the other repositories need for dev

The gitops side is in place. These changes belong to the repositories named, and are not part of gitops:

| Repository | Needed |
|---|---|
| `website` | `develop` builds publish into the dev site bucket (`discordy-site` on the dev MinIO, served at `discordy-dev.voics.nl`), `main` and tags keep publishing to production. The website reads its API and download hosts from build-time configuration: point the dev build at `discordy-dev-api.voics.nl` and `discordy-dev-updates.voics.nl`. |
| `.github` (reusable `minio-publish`) | Accept a target environment: run on `runs-on: discordy-dev` and read the MinIO key from `kv/discordy-dev/minio` (the OpenBao `publish` role of the dev OpenBao is limited to that path). |
| `client` | A "Dev" connection profile pointing at `discordy-dev-api` and `discordy-dev-gateway`; optionally a dev installer channel (`dev.yml`) published to the dev updates host by a `develop` workflow. |
| service repos (`api`, `messages`, `gateway`, `admin`, `voice`) | None: `develop` already pushes `X.Y.Z-dev.N` images, which the dev image policies follow. |

## Disaster recovery: rebuild production

**Updated 18 November 2026: design only.** Production contains user data, and no verified offsite backup or restore drill is established. The former instructions to remove Terraform state, enable production bootstrap and assume MinIO/barman recovery are not an executable recovery procedure.

Start with the [backup and recovery plan](backup-restore.md). Preserve the source VM, disks, Terraform state and independent OpenBao static seal key. GitHub secrets are not assumed to reconstruct every secret, and a new OpenBao init can overwrite key-store entries needed for an older data copy.

Before any rebuild: explicitly authorize the target environment, inventory data and identities, obtain a complete decryptable set, prove isolated restoration, and document write fencing, public cutover and rollback. Never run production bootstrap on the existing data-bearing VM as a worker-preparation step. Use the [worker guide](server-uitbreiden.md) for capacity preparation and the [revised migration proposal](../plans/2026-10-19-rke2-rancher-migration.md) for a future control-plane change.

No rebuild time, PITR capability, whole-VM recovery or usable offsite object set is currently claimed. Record actual timings and functional checks in the backup plan's evidence form after the first authorized isolated drill.

### Adopting the existing production VM into Terraform

The live VM is never created by Terraform. `envs/gen-serv` is import-friendly: see
`gitops/infra/terraform/envs/gen-serv/README.md`. Import it, read the plan, and apply only a plan that does not
replace or destroy the VM or its disks. The cluster module is off by default so Terraform never runs
the bootstrap scripts on the live node.

## State and credentials hygiene

- Terraform state may contain secrets. It is local and git-ignored by default (`*.tfstate`, `*.tfvars`, `backend.hcl` are in `.gitignore`); back it up. Use a remote backend through `-backend-config=backend.hcl` for a shared state ([gitops/infra/terraform/README.md](https://github.com/voics-app/gitops/blob/develop/infra/terraform/README.md)).
- Provider tokens only in environment variables; rotate them when a machine that held them is lost.
- `env.sh destroy <env>` refuses to run for `gen-serv`.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `terraform apply` hangs on the Proxmox image download | the datastore lacks the `import` content type: `pvesm set local --content iso,vztmpl,backup,snippets,import` |
| Cluster module fails at `15-etcd-disk.sh` with "has partitions" or "already has a filesystem" | the device is not the empty etcd disk; check `lsblk`. The script refuses to touch a disk with data. |
| etcd logs `apply request took too long` | the etcd disk is not on SSD or has the wrong cache mode: measure with `dd ... oflag=dsync` ([bootstrap README](https://github.com/voics-app/gitops/blob/develop/bootstrap/README.md#datastore-etcd-not-k8s-dqlite)) |
| `20-openbao.sh` says "cannot reach OpenBao" | Flux has not deployed it yet: wait for `infra-controllers`, run the stage again |
| `40-cloudflare.sh` refuses a host | the host is not a one-level `discordy*` name under `voics.nl`; fix the environment's cluster-config |
| Dev pods `ImagePullBackOff` right after bring-up | the dev image policies have not selected a `-dev.N` tag yet (initial tag is `develop`); check `flux get image policy -A` and that the service repos pushed a `-dev.N` image |
