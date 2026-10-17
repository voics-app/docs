# Secrets inventory

<!-- Generated from inventory.yaml by scripts/render-secrets.mjs. Do not edit by hand. -->

Every secret on the Discordy platform is listed here. The source is [`inventory.yaml`](inventory.yaml). This page records no values: values exist only in GitHub secrets, OpenBao, Kubernetes Secrets and 1Password.

**Flow** ([ADR-0006](../adr/0006-secrets-flow.md)):

1. GitHub org or `production` environment secret.
2. The `secrets-sync` workflow, running on the self-hosted runner.
3. OpenBao KV v2 at `kv/discordy/...`.
4. External Secrets Operator.
5. A Kubernetes Secret, injected into pods as env vars.

**Related runbooks**: [secret rotation](../runbooks/secret-rotation.md) · [OpenBao unseal](../runbooks/openbao-unseal.md)

## Summary

| Secret | Category | Consumers | GitHub secret | Rotation |
|---|---|---|---|---|
| [Cloudflare API token](#cloudflare-api-token) | Cloudflare | gitops cloudflare workflow, regionctl, WS9 bring-up | `CLOUDFLARE_API_TOKEN` (org) | 90d |
| [Cloudflare tunnel token](#cloudflare-tunnel-token) | Cloudflare | cloudflared | `CLOUDFLARE_TUNNEL_TOKEN` (env:production) | 365d |
| [Region tunnel tokens](#region-tunnel-tokens) | Cloudflare | cloudflared on standalone region nodes | `CLOUDFLARE_TUNNEL_TOKEN_<REGION>` (env:production) | 365d |
| [OpenBao unseal key shares](#openbao-unseal-keys) | OpenBao | platform admin | not in GitHub | on-compromise |
| [OpenBao root token](#openbao-root-token) | OpenBao | platform admin | not in GitHub | on-use |
| [JWT signing key pair (Ed25519)](#jwt-signing-key) | Authentication and service-to-service | api (private + public), messages, gateway, voice-signaling, admin-bff (public) | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` (env:production) | 180d |
| [Internal service token](#internal-service-token) | Authentication and service-to-service | api, messages, gateway, voice-signaling, admin-bff | `INTERNAL_SERVICE_TOKEN` (env:production) | 90d |
| [Voice token secret (HS256)](#voice-token-secret) | Authentication and service-to-service | gateway, voice-signaling | `VOICE_TOKEN_SECRET` (env:production) | 90d |
| [Erlang distribution cookie](#release-cookie) | Runtime | gateway | `RELEASE_COOKIE` (env:production) | 180d |
| [coturn static auth secret](#coturn-static-auth-secret) | Runtime | coturn, gateway | `TURN_STATIC_AUTH_SECRET` (env:production) | 180d |
| [Postgres superuser password](#postgres-superuser) | Databases | CloudNativePG, platform admin | `POSTGRES_SUPERUSER_PASSWORD` (env:production) | 180d |
| [Postgres password for api (DB discordy)](#postgres-api) | Databases | api | `POSTGRES_API_PASSWORD` (env:production) | 90d |
| [Postgres password for admin-bff (DB discordy_admin)](#postgres-admin) | Databases | admin-bff | `POSTGRES_ADMIN_PASSWORD` (env:production) | 90d |
| [Valkey password](#valkey-password) | Databases | valkey, api, gateway | `VALKEY_PASSWORD` (env:production) | 180d |
| [MinIO root credentials](#minio-root) | Object storage | minio, minio init job | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` (env:production) | 180d |
| [MinIO access keys for api](#minio-api-keys) | Object storage | api | `MINIO_API_ACCESS_KEY`, `MINIO_API_SECRET_KEY` (env:production) | 180d |
| [MinIO access keys for messages](#minio-messages-keys) | Object storage | messages | `MINIO_MESSAGES_ACCESS_KEY`, `MINIO_MESSAGES_SECRET_KEY` (env:production) | 180d |
| [MinIO access keys for the update feed](#minio-updates-keys) | Object storage | client release workflow (self-hosted runner) | `MINIO_UPDATES_ACCESS_KEY`, `MINIO_UPDATES_SECRET_KEY` (org) | 180d |
| [GHCR pull token](#ghcr-pull-token) | CI/CD and GitHub | kubelet, Flux image-reflector-controller | `GHCR_PULL_TOKEN` (org) | 90d |
| [ARC GitHub App credentials](#arc-github-app) | CI/CD and GitHub | actions-runner-controller | `ARC_GITHUB_APP_ID`, `ARC_GITHUB_APP_INSTALLATION_ID`, `ARC_GITHUB_APP_PRIVATE_KEY` (org) | 365d |
| [ARC GitHub PAT (fallback)](#arc-github-pat) | CI/CD and GitHub | actions-runner-controller | `ARC_GITHUB_PAT` (org) | 90d |
| [Flux deploy key](#flux-deploy-key) | CI/CD and GitHub | Flux source-controller, image-automation-controller | not in GitHub | 365d |
| [Notion integration token](#notion-token) | CI/CD and GitHub | docs notion-sync workflow | `NOTION_TOKEN` (org) | 365d |
| [1Password service account token](#onepassword-service-account) | CI/CD and GitHub | platform admin workstation | not in GitHub | 90d |
| [Grafana admin credentials](#grafana-admin) | Observability | grafana, platform admin | `GRAFANA_ADMIN_PASSWORD` (env:production) | 180d |

## Cloudflare

<a id="cloudflare-api-token"></a>

### Cloudflare API token

| Field | Value |
|---|---|
| Purpose | Manages DNS records, the Discordy tunnel and Access applications in the voics.nl zone. |
| Consumers | gitops cloudflare workflow, regionctl, WS9 bring-up |
| Env vars | `CLOUDFLARE_API_TOKEN` |
| GitHub secret | `CLOUDFLARE_API_TOKEN` (org) |
| OpenBao | `kv/discordy/platform/cloudflare` → `api_token` |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#cloudflare-api-token](../runbooks/secret-rotation.md#cloudflare-api-token) |
| Generate | Cloudflare dashboard > My Profile > API Tokens > Create (Zone:DNS:Edit, Account:Cloudflare Tunnel:Edit, Account:Access: Apps and Policies:Edit), scoped to voics.nl |
| Notes | Scope to the voics.nl zone only. It must never be able to change the existing voics.nl / app.voics.nl records outside the discordy-* names (enforced by convention and review). |

<a id="cloudflare-tunnel-token"></a>

### Cloudflare tunnel token

| Field | Value |
|---|---|
| Purpose | Authenticates cloudflared to the Discordy tunnel. |
| Consumers | cloudflared |
| Env vars | `TUNNEL_TOKEN` |
| GitHub secret | `CLOUDFLARE_TUNNEL_TOKEN` (env:production) |
| OpenBao | `kv/discordy/cloudflared` → `tunnel_token` |
| Kubernetes Secret | `voics-system/cloudflared-tunnel` |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#cloudflare-tunnel-token](../runbooks/secret-rotation.md#cloudflare-tunnel-token) |
| Generate | GET /accounts/{account_id}/cfd_tunnel/{tunnel_id}/token via the Cloudflare API (see cloudflare-setup.md) |

<a id="region-tunnel-tokens"></a>

### Region tunnel tokens

| Field | Value |
|---|---|
| Purpose | Authenticate cloudflared on standalone region clusters (one tunnel per region). |
| Consumers | cloudflared on standalone region nodes |
| Env vars | `TUNNEL_TOKEN` |
| GitHub secret | `CLOUDFLARE_TUNNEL_TOKEN_<REGION>` (env:production) |
| OpenBao | `kv/discordy/regions/<region>` → `tunnel_token` |
| Kubernetes Secret | `voics-system/cloudflared-tunnel` |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#cloudflare-tunnel-token](../runbooks/secret-rotation.md#cloudflare-tunnel-token) |
| Generate | Create a tunnel for the region via the Cloudflare API (cloudflare-setup.md#region-tunnels-standalone-clusters) and fetch its token |
| Notes | Not needed for regions whose node joins the gen-serv cluster. |

## OpenBao

<a id="openbao-unseal-keys"></a>

### OpenBao unseal key shares

| Field | Value |
|---|---|
| Purpose | Unseal OpenBao after every restart (Shamir, 5 shares, threshold 3). |
| Consumers | platform admin |
| Env vars | — |
| GitHub secret | not in GitHub |
| OpenBao | not in OpenBao |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | on-compromise — [openbao-unseal.md#rekeying](../runbooks/openbao-unseal.md#rekeying) |
| Generate | bao operator init -key-shares=5 -key-threshold=3 (once, at bring-up) |
| Notes | Stored only in 1Password (vault "Discordy", items "OpenBao unseal key 1..5"). Never in GitHub, git or the cluster. |

<a id="openbao-root-token"></a>

### OpenBao root token

| Field | Value |
|---|---|
| Purpose | Initial configuration of OpenBao (auth methods, policies, KV mount). |
| Consumers | platform admin |
| Env vars | — |
| GitHub secret | not in GitHub |
| OpenBao | not in OpenBao |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | on-use — [openbao-unseal.md#root-token](../runbooks/openbao-unseal.md#root-token) |
| Generate | Printed by bao operator init; regenerate with bao operator generate-root |
| Notes | Stored only in 1Password. Revoke after bootstrap; regenerate from unseal shares when needed. |

## Authentication and service-to-service

<a id="jwt-signing-key"></a>

### JWT signing key pair (Ed25519)

| Field | Value |
|---|---|
| Purpose | Signs (private) and verifies (public) user access tokens (P3, alg EdDSA). |
| Consumers | api (private + public), messages, gateway, voice-signaling, admin-bff (public) |
| Env vars | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` |
| GitHub secret | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` (env:production) |
| OpenBao | `kv/discordy/common` → `jwt_private_key`, `jwt_public_key` |
| Kubernetes Secret | `voics-apps/api-secrets`, `voics-apps/common-secrets`, `voics-voice/common-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#jwt-signing-key](../runbooks/secret-rotation.md#jwt-signing-key) |
| Generate | openssl genpkey -algorithm ed25519 -out jwt.pem && openssl pkey -in jwt.pem -pubout -out jwt.pub.pem |
| Notes | The public key is not confidential, but it travels with the pair so the two stay consistent. Only api receives the private key. |

<a id="internal-service-token"></a>

### Internal service token

| Field | Value |
|---|---|
| Purpose | Shared secret sent as X-Internal-Token on every /internal/* call between services. |
| Consumers | api, messages, gateway, voice-signaling, admin-bff |
| Env vars | `INTERNAL_SERVICE_TOKEN` |
| GitHub secret | `INTERNAL_SERVICE_TOKEN` (env:production) |
| OpenBao | `kv/discordy/common` → `internal_service_token` |
| Kubernetes Secret | `voics-apps/common-secrets`, `voics-voice/common-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#internal-service-token](../runbooks/secret-rotation.md#internal-service-token) |
| Generate | openssl rand -base64 48 |

<a id="voice-token-secret"></a>

### Voice token secret (HS256)

| Field | Value |
|---|---|
| Purpose | Signs (gateway) and verifies (voice-signaling) 60-second voice tokens (P3). |
| Consumers | gateway, voice-signaling |
| Env vars | `VOICE_TOKEN_SECRET` |
| GitHub secret | `VOICE_TOKEN_SECRET` (env:production) |
| OpenBao | `kv/discordy/voice` → `voice_token_secret` |
| Kubernetes Secret | `voics-apps/gateway-secrets`, `voics-voice/voice-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#voice-token-secret](../runbooks/secret-rotation.md#voice-token-secret) |
| Generate | openssl rand -base64 48 |
| Notes | Every region reads the same path. Rotating it affects every region at once, so roll the gateway and all voice nodes together. |

## Runtime

<a id="release-cookie"></a>

### Erlang distribution cookie

| Field | Value |
|---|---|
| Purpose | Authenticates gateway nodes to each other in the Erlang cluster (libcluster). |
| Consumers | gateway |
| Env vars | `RELEASE_COOKIE` |
| GitHub secret | `RELEASE_COOKIE` (env:production) |
| OpenBao | `kv/discordy/gateway` → `release_cookie` |
| Kubernetes Secret | `voics-apps/gateway-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#release-cookie](../runbooks/secret-rotation.md#release-cookie) |
| Generate | openssl rand -hex 32 |

<a id="coturn-static-auth-secret"></a>

### coturn static auth secret

| Field | Value |
|---|---|
| Purpose | TURN REST shared secret. The gateway mints short-lived TURN credentials for P2P; coturn verifies them. |
| Consumers | coturn, gateway |
| Env vars | `TURN_STATIC_AUTH_SECRET` |
| GitHub secret | `TURN_STATIC_AUTH_SECRET` (env:production) |
| OpenBao | `kv/discordy/coturn` → `static_auth_secret` |
| Kubernetes Secret | `voics-system/coturn-secrets`, `voics-apps/gateway-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#generic-procedure](../runbooks/secret-rotation.md#generic-procedure) |
| Generate | openssl rand -hex 32 |
| Notes | Implied by the P2P design (spec §6.4) but not yet pinned in P2. The coordinator should add TURN_STATIC_AUTH_SECRET to P2 before the gateway implements TURN credentials. |

## Databases

<a id="postgres-superuser"></a>

### Postgres superuser password

| Field | Value |
|---|---|
| Purpose | CloudNativePG superuser (postgres), used only for administration and restores. |
| Consumers | CloudNativePG, platform admin |
| Env vars | — |
| GitHub secret | `POSTGRES_SUPERUSER_PASSWORD` (env:production) |
| OpenBao | `kv/discordy/postgres` → `superuser_password` |
| Kubernetes Secret | `voics-data/postgres-superuser` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#database-passwords](../runbooks/secret-rotation.md#database-passwords) |
| Generate | openssl rand -base64 32 \| tr -d '/+=' |

<a id="postgres-api"></a>

### Postgres password for api (DB discordy)

| Field | Value |
|---|---|
| Purpose | Credentials of the discordy role that owns DB discordy, templated into DATABASE_URL. |
| Consumers | api |
| Env vars | `DATABASE_URL` |
| GitHub secret | `POSTGRES_API_PASSWORD` (env:production) |
| OpenBao | `kv/discordy/api` → `database_password`, `database_url` |
| Kubernetes Secret | `voics-apps/api-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#database-passwords](../runbooks/secret-rotation.md#database-passwords) |
| Generate | openssl rand -base64 32 \| tr -d '/+=' |

<a id="postgres-admin"></a>

### Postgres password for admin-bff (DB discordy_admin)

| Field | Value |
|---|---|
| Purpose | Credentials of the discordy_admin role, templated into ADMIN_DATABASE_URL. |
| Consumers | admin-bff |
| Env vars | `ADMIN_DATABASE_URL` |
| GitHub secret | `POSTGRES_ADMIN_PASSWORD` (env:production) |
| OpenBao | `kv/discordy/admin` → `database_password`, `database_url` |
| Kubernetes Secret | `voics-apps/admin-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#database-passwords](../runbooks/secret-rotation.md#database-passwords) |
| Generate | openssl rand -base64 32 \| tr -d '/+=' |

<a id="valkey-password"></a>

### Valkey password

| Field | Value |
|---|---|
| Purpose | requirepass for Valkey, templated into VALKEY_URL. |
| Consumers | valkey, api, gateway |
| Env vars | `VALKEY_URL` |
| GitHub secret | `VALKEY_PASSWORD` (env:production) |
| OpenBao | `kv/discordy/valkey` → `password`, `url` |
| Kubernetes Secret | `voics-data/valkey-auth`, `voics-apps/api-secrets`, `voics-apps/gateway-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#database-passwords](../runbooks/secret-rotation.md#database-passwords) |
| Generate | openssl rand -base64 32 \| tr -d '/+=' |

## Object storage

<a id="minio-root"></a>

### MinIO root credentials

| Field | Value |
|---|---|
| Purpose | MinIO root user, used for bucket/policy management and the init job only. |
| Consumers | minio, minio init job |
| Env vars | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` |
| GitHub secret | `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` (env:production) |
| OpenBao | `kv/discordy/minio` → `root_user`, `root_password` |
| Kubernetes Secret | `voics-data/minio-root` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#minio-keys](../runbooks/secret-rotation.md#minio-keys) |
| Generate | openssl rand -hex 16 (user), openssl rand -base64 32 (password) |

<a id="minio-api-keys"></a>

### MinIO access keys for api

| Field | Value |
|---|---|
| Purpose | Scoped to the discordy-assets bucket (avatars, icons, emoji). |
| Consumers | api |
| Env vars | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` |
| GitHub secret | `MINIO_API_ACCESS_KEY`, `MINIO_API_SECRET_KEY` (env:production) |
| OpenBao | `kv/discordy/api` → `minio_access_key`, `minio_secret_key` |
| Kubernetes Secret | `voics-apps/api-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#minio-keys](../runbooks/secret-rotation.md#minio-keys) |
| Generate | mc admin user svcacct add --policy assets-rw.json discordy api |

<a id="minio-messages-keys"></a>

### MinIO access keys for messages

| Field | Value |
|---|---|
| Purpose | Scoped to the discordy-attachments bucket. |
| Consumers | messages |
| Env vars | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` |
| GitHub secret | `MINIO_MESSAGES_ACCESS_KEY`, `MINIO_MESSAGES_SECRET_KEY` (env:production) |
| OpenBao | `kv/discordy/messages` → `minio_access_key`, `minio_secret_key` |
| Kubernetes Secret | `voics-apps/messages-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#minio-keys](../runbooks/secret-rotation.md#minio-keys) |
| Generate | mc admin user svcacct add --policy attachments-rw.json discordy messages |

<a id="minio-updates-keys"></a>

### MinIO access keys for the update feed

| Field | Value |
|---|---|
| Purpose | Write access to the updates bucket, used by the client release workflow to publish installers. |
| Consumers | client release workflow (self-hosted runner) |
| Env vars | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` |
| GitHub secret | `MINIO_UPDATES_ACCESS_KEY`, `MINIO_UPDATES_SECRET_KEY` (org) |
| OpenBao | `kv/discordy/updates` → `minio_access_key`, `minio_secret_key` |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#minio-keys](../runbooks/secret-rotation.md#minio-keys) |
| Generate | mc admin user svcacct add --policy updates-rw.json discordy release |

## CI/CD and GitHub

<a id="ghcr-pull-token"></a>

### GHCR pull token

| Field | Value |
|---|---|
| Purpose | Lets the cluster (kubelet imagePullSecret, Flux ImageRepository) read private images from GHCR. |
| Consumers | kubelet, Flux image-reflector-controller |
| Env vars | — |
| GitHub secret | `GHCR_PULL_TOKEN` (org) |
| OpenBao | `kv/discordy/platform/ghcr` → `username`, `token` |
| Kubernetes Secret | `voics-apps/ghcr-pull`, `voics-voice/ghcr-pull`, `flux-system/ghcr-auth` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#ghcr-pull-token](../runbooks/secret-rotation.md#ghcr-pull-token) |
| Generate | GitHub > Settings > Developer settings > Fine-grained or classic PAT with read:packages only |

<a id="arc-github-app"></a>

### ARC GitHub App credentials

| Field | Value |
|---|---|
| Purpose | Lets Actions Runner Controller register the self-hosted runner scale set "discordy" with the org. |
| Consumers | actions-runner-controller |
| Env vars | `github_app_id`, `github_app_installation_id`, `github_app_private_key` |
| GitHub secret | `ARC_GITHUB_APP_ID`, `ARC_GITHUB_APP_INSTALLATION_ID`, `ARC_GITHUB_APP_PRIVATE_KEY` (org) |
| OpenBao | `kv/discordy/arc` → `github_app_id`, `github_app_installation_id`, `github_app_private_key` |
| Kubernetes Secret | `voics-system/arc-github-app` |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#arc-github-credentials](../runbooks/secret-rotation.md#arc-github-credentials) |
| Generate | Create a GitHub App on the org (Self-hosted runners: read/write, Administration: read) and generate a private key |
| Notes | Bootstrap chicken-and-egg: secrets-sync runs on ARC, so the first ARC secret is written to OpenBao by hand during WS9 bring-up (openbao-unseal.md > First-time bootstrap). |

<a id="arc-github-pat"></a>

### ARC GitHub PAT (fallback)

| Field | Value |
|---|---|
| Purpose | Fallback runner registration if the GitHub App is not yet created. |
| Consumers | actions-runner-controller |
| Env vars | `github_token` |
| GitHub secret | `ARC_GITHUB_PAT` (org) |
| OpenBao | `kv/discordy/arc` → `github_token` |
| Kubernetes Secret | `voics-system/arc-github-app` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#arc-github-credentials](../runbooks/secret-rotation.md#arc-github-credentials) |
| Generate | Classic PAT with admin:org scope; delete once the App is in place |
| Notes | Use either the App or the PAT, never both. Prefer the App. |

<a id="flux-deploy-key"></a>

### Flux deploy key

| Field | Value |
|---|---|
| Purpose | SSH deploy key with write access to discordy-voics/gitops, used by Flux source and image automation. |
| Consumers | Flux source-controller, image-automation-controller |
| Env vars | — |
| GitHub secret | not in GitHub |
| OpenBao | not in OpenBao |
| Kubernetes Secret | `flux-system/flux-system` |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#flux-deploy-key](../runbooks/secret-rotation.md#flux-deploy-key) |
| Generate | Created by flux bootstrap github; rotate by deleting the deploy key and re-running bootstrap |

<a id="notion-token"></a>

### Notion integration token

| Field | Value |
|---|---|
| Purpose | Lets the notion-sync workflow mirror the docs repo into the Discordy Notion page tree on merge to main. |
| Consumers | docs notion-sync workflow |
| Env vars | `NOTION_TOKEN` |
| GitHub secret | `NOTION_TOKEN` (org) |
| OpenBao | not in OpenBao |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#notion-token](../runbooks/secret-rotation.md#notion-token) |
| Generate | notion.so/my-integrations > New internal integration; share the Discordy page with it |

<a id="onepassword-service-account"></a>

### 1Password service account token

| Field | Value |
|---|---|
| Purpose | Lets the `op` CLI store OpenBao init output in 1Password during bring-up and rekeying. |
| Consumers | platform admin workstation |
| Env vars | `OP_SERVICE_ACCOUNT_TOKEN` |
| GitHub secret | not in GitHub |
| OpenBao | not in OpenBao |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#generic-procedure](../runbooks/secret-rotation.md#generic-procedure) |
| Generate | 1Password > Developer > Service accounts, write access to vault Discordy only |
| Notes | Lives only in the admin's shell session; never in GitHub or the cluster. |

## Observability

<a id="grafana-admin"></a>

### Grafana admin credentials

| Field | Value |
|---|---|
| Purpose | Grafana admin login. |
| Consumers | grafana, platform admin |
| Env vars | `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD` |
| GitHub secret | `GRAFANA_ADMIN_PASSWORD` (env:production) |
| OpenBao | `kv/discordy/grafana` → `admin_user`, `admin_password` |
| Kubernetes Secret | `observability/grafana-admin` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#generic-procedure](../runbooks/secret-rotation.md#generic-procedure) |
| Generate | openssl rand -base64 24 |

## Changing the inventory

1. Edit [`inventory.yaml`](inventory.yaml). Record metadata only, never a value.
2. Run `pnpm secrets:render` and commit both files.
3. Add the value as a GitHub secret with the listed name and scope.
4. Add the `ExternalSecret` mapping in `gitops`.
5. Run the `secrets-sync` workflow.
