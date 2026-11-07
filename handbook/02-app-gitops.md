# gitops

Summary: everything that runs the platform: Flux manifests, bootstrap scripts, Terraform and the local compose stack.

| | |
|---|---|
| Repository | `discordy-voics/gitops` |
| Tech | Flux, Kustomize, Helm, Terraform, bash |
| Deploys | Flux watches `main`, path `clusters/gen-serv` (production) and `develop`, path `clusters/dev` |

## Folder map

| Path | What is there |
|---|---|
| `clusters/gen-serv/` | Flux entry point: `flux-system`, then `infra-foundation`, `infra-controllers`, `infra-configs`, `infra-data`, `apps` and `regions`. |
| `infrastructure/controllers/` | ingress-nginx, external-secrets, openbao, actions-runner-controller, headlamp, victoria-metrics, grafana, cloudflared, coturn, etcd, the ops portal. |
| `infrastructure/data/` | Postgres (CloudNativePG), Scylla, Redpanda, Valkey, MinIO. |
| `infrastructure/configs/` | `cluster-config` (every hostname, substituted into manifests), ClusterSecretStore, namespaces. |
| `apps/` | api, messages, notifier (0 replicas until the Apple key exists, [push notifications](../runbooks/push-notifications.md)), gateway, admin (base and production overlay) and image automation. |
| `regions/` | `_template`, `nl-home`, `nl-dev`, `dev`: voice regions. |
| `secrets/inventory.yaml` | Every OpenBao key read by an ExternalSecret and the GitHub secret that feeds it. |
| `bootstrap/` | Idempotent bring-up scripts `00` to `60` (microk8s, OpenBao, Flux, Cloudflare, seed, verify). |
| `infra/terraform/` | Node modules (Proxmox, Hetzner, AWS) and one env root per environment. |
| `env.sh` | One command per environment: plan, up, verify, kubeconfig, destroy. |
| `local/` | Docker compose dev stack and `dev.sh` (see [Local development](../runbooks/local-development.md)). |
| `site/` | The invite landing page, published with the website. |
| `scripts/` | Render, kubeconform, inventory and memory-budget checks. |

## Rules

- A merge to `main` is a production change: Flux applies it within minutes ([Release](../runbooks/release.md#deployment-via-flux)).
- Nothing is changed by hand on the cluster unless it is also in git ([Definition of Done](../CONTRIBUTING.md#definition-of-done)).
- The validator (`docker build -t gitops-validator .`) runs kustomize, helm template, kubeconform, the inventory check and the memory budget (requests within 6 GiB, limits within 8 GiB; the VM has 7.7 GiB).
- Hostnames live only in `cluster-config`. `voics.nl` and `app.voics.nl` belong to another product and are never referenced.

Environments and `env.sh` are covered in [Environments and IaC](06-environments-and-iac.md).
