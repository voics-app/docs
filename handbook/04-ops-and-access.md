# Ops and access

Summary: the ops portal, every operator tool with its login and rights, where credentials live and how access is protected.

The full runbook is [Ops access](../runbooks/ops-access.md); the live list of tools is the **Ops tools and URLs** database on the Discordy home page. This page explains the model.

## Start here

**<https://discordy-ops.voics.nl>** is the ops portal: one page that links every tool and explains how to log in to each. It is built from the manifests in `gitops/infrastructure/controllers/ops-portal`.

## Two gates

Every operator host has two gates in front of it:

1. **IP lock**: ingress-nginx `whitelist-source-range` lets only the owner's public IP through (`OPS_ALLOWED_CIDRS` in `cluster-config`). Everyone else gets 403.
2. **Cloudflare Access** (team `holy-haze-2d7b`): the owner email plus a one-time PIN, valid one week per host ([Cloudflare setup](../runbooks/cloudflare-setup.md#cloudflare-access)).

The admin panel adds a third check: `ADMIN_ALLOWED_EMAILS`.

## Tools

| Tool | What it is for |
|---|---|
| Ops portal | Landing page linking everything |
| Headlamp | Kubernetes UI with the Flux plugin (Kustomizations, HelmReleases, reconcile and suspend); login with a service-account token |
| Grafana | Dashboards from VictoriaMetrics |
| pgweb | PostgreSQL browser: users, servers, channels, roles, invites |
| Scylla web | ScyllaDB browser: messages, CQL console |
| MinIO console | Buckets: attachments, assets, updates, site |
| Redpanda Console | Topics and consumer groups |
| OpenBao UI | Secrets under `kv/discordy/*` |
| Admin panel | The Discordy operator portal ([admin](02-app-admin.md)) |

URLs, login methods and rights per tool: [Ops tools and URLs](../runbooks/ops-access.md#tools).

## Where the credentials are

- **On the VM**: `~/.ops-secrets/credentials.txt` in the `karma` home folder on gen-serv (folder mode 700, file 600).
- **On the owner PC**: Windows DPAPI files in `%USERPROFILE%\.discordy\ops\` and `%USERPROFILE%\.discordy\openbao\`, readable only by the owner's Windows account.
- **Source of truth**: OpenBao `kv/discordy/*`; after a rotation refresh both copies ([Secret rotation](../runbooks/secret-rotation.md)).

## OpenBao: unseal and admin

OpenBao starts **sealed** after every restart or reboot. Unseal it with the quick path from a gitops checkout on the owner PC (`bootstrap/20-openbao.sh`); the keys are Shamir 3 of 5 and live in the DPAPI key store. The bootstrap root token is revoked by design; for admin work use the `owner` userpass login with policy `owner-admin`. Procedure: [OpenBao unseal](../runbooks/openbao-unseal.md).

## When something is wrong

| Symptom | First check |
|---|---|
| 403 everywhere | Your public IP changed: update `OPS_ALLOWED_CIDRS` in `cluster-config` and merge it through to `main` |
| Cloudflare 530 or 1033 | The tunnel is down: `kubectl -n voics-system get pods` and look for cloudflared |
| Headlamp unauthorized | The token expired (30 days): create a new one |
| Secrets not refreshing | OpenBao is sealed |
