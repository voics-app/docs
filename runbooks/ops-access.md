# Ops access

How the owner reaches the operator tools of the gen-serv cluster, and how that access is protected.

## Start here

**https://discordy-ops.voics.nl** is the ops portal: one page that links every tool below and explains how to log in to each.

## Two gates in front of every operator host

1. **IP lock** (ingress-nginx `whitelist-source-range`): only the owner's public IP gets through; everyone else gets 403. Cloudflare passes the visitor address in `CF-Connecting-IP`, which ingress-nginx trusts only from the tunnel's pod network.
2. **Cloudflare Access** (team `holy-haze-2d7b`): enter the owner email, then the one-time PIN Cloudflare mails you. The session lasts **one week** per host ([Cloudflare setup → Access](cloudflare-setup.md#cloudflare-access)).

## Tools

| Tool | URL | Login after Access | Rights |
|---|---|---|---|
| Ops portal | https://discordy-ops.voics.nl | none | - |
| Headlamp (Kubernetes UI + **Flux plugin**) | https://discordy-headlamp.voics.nl | token: `kubectl -n voics-system create token headlamp-admin --duration=720h` | **cluster-admin** |
| Grafana | https://discordy-grafana.voics.nl | `admin` + password | admin |
| pgweb (PostgreSQL: users, servers, channels, roles, invites) | https://discordy-db.voics.nl | none | **superuser**, read/write, every database |
| Scylla web (ScyllaDB: messages) | https://discordy-scylla.voics.nl | none (Scylla runs without auth) | read/write: rows, CQL console, import/export |
| MinIO console | https://discordy-minio.voics.nl | MinIO root user + password | root |
| Redpanda Console | https://discordy-redpanda.voics.nl | none | full |
| OpenBao UI | https://discordy-openbao.voics.nl | Username method, user `owner` (created by `gitops/bootstrap/22-openbao-owner-admin.sh`) | policy `owner-admin` (everything) |
| Admin panel | https://discordy-admin.voics.nl | none beyond Access; admin-bff also checks `ADMIN_ALLOWED_EMAILS` | platform admin |

The owner asked for full admin rights on every tool (2026-10-20). The Kubernetes Dashboard (and the microk8s `dashboard` addon built on it) was **retired by the Kubernetes project in January 2026**; Headlamp is its successor, and its Flux plugin shows Kustomizations, HelmReleases, sources and image automation, with reconcile and suspend actions.

**OpenBao admin**: the bootstrap root token is revoked by design, and OpenBao ≥ 2.5.3 refuses unauthenticated `generate-root` (listener `disable_unauthed_generate_root_endpoints` defaults to `true`). `gitops/bootstrap/22-openbao-owner-admin.sh` (run from the owner PC; a copy lives at `~/.discordy/openbao-admin-token.sh`) temporarily turns that off, generates a root token from 3 unseal keys, creates the `owner-admin` policy and userpass user `owner`, revokes the root token and restores the config.

## Where the credentials are

- **Plaintext, on the VM:** `~/.ops-secrets/credentials.txt` in the `karma` home folder on gen-serv (folder `700`, file `600`). It holds every login above, including a cluster-admin Headlamp token valid for 30 days, the PostgreSQL superuser and (once created) the OpenBao owner login. The owner asked for it on 2026-10-20 for hassle-free access. Regenerate it after the Headlamp token expires or after a secret rotation.
- **Encrypted, on the owner's PC:** DPAPI files in `%USERPROFILE%\.discordy\ops\` (`pgweb`, `grafana`, `minio-user`, `minio-password`) and `%USERPROFILE%\.discordy\openbao\` (unseal keys, root token). Only the owner's Windows account can decrypt them:

  ```powershell
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Get-Content $env:USERPROFILE\.discordy\ops\grafana.dpapi | ConvertTo-SecureString)))
  ```

- **Source of truth:** OpenBao `kv/discordy/*` ([secrets inventory](../secrets/README.md)). After a [rotation](secret-rotation.md), refresh both copies.

## When your IP changes

You get 403 everywhere. Change `OPS_ALLOWED_CIDRS` in `gitops/infrastructure/configs/cluster-config/cluster-config.yaml` to `<new ip>/32` (comma-separated for several) on a `feature/*` branch, and merge it through to `main`. Flux applies it within a few minutes. `bootstrap/50-public-ip.sh` is a different setting: it records `HOME_PUBLIC_IP` for coturn/TURN, and also needs updating when the home router's address changes.

## Troubleshooting

| Symptom | Cause |
|---|---|
| 403 from nginx | Your public IP is not the allowed one (see above) |
| Redirect loop or "Access denied" on Cloudflare | Wrong email, or the Access app was edited; re-run `ACCESS_ONLY=true bootstrap/40-cloudflare.sh` |
| 530 / 1033 from Cloudflare | Tunnel down: `kubectl -n voics-system get pods \| grep cloudflared` |
| Headlamp "unauthorized" | The token expired; create a new one |
| Admin panel 401/403 | `ADMIN_ALLOWED_EMAILS` does not list the Access email, or `CF_ACCESS_AUD` no longer matches the Access app |
