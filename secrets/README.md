# Secrets inventory

<!-- Generated from inventory.yaml by scripts/render-secrets.mjs. Do not edit by hand. -->

Every secret on the Voics platform is listed here. The source is [`inventory.yaml`](inventory.yaml). This page records no values: values exist only in GitHub secrets, OpenBao (KV v2 mount `kv`), Kubernetes Secrets and 1Password. The OpenBao paths and keys match `gitops/secrets/inventory.yaml`, which CI enforces.

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
| [Cloudflare API token](#cloudflare-api-token) | Cloudflare | bootstrap/40-cloudflare.sh, regionctl, WS9 bring-up | `CLOUDFLARE_API_TOKEN` (org) | 90d |
| [Cloudflare tunnel credentials (locally managed tunnel)](#cloudflared-credentials) | Cloudflare | cloudflared | `CLOUDFLARED_CREDENTIALS_JSON` (env:production) | 365d |
| [OpenBao unseal key shares](#openbao-unseal-keys) | OpenBao | platform admin | not in GitHub | on-compromise |
| [OpenBao root token](#openbao-root-token) | OpenBao | platform admin | not in GitHub | on-use |
| [JWT signing key pair (Ed25519)](#jwt-signing-key) | Authentication and service-to-service | api (private), messages, gateway, voice-signaling, admin-bff (public) | `API_JWT_PRIVATE_KEY`, `SHARED_JWT_PUBLIC_KEY` (env:production) | 180d |
| [Attachment download signing key](#attachment-signing-key) | Authentication and service-to-service | messages | `MESSAGES_ATTACHMENT_SIGNING_KEY` (env:production) | 365d |
| [Apple push (APNs) key, Key ID and Team ID](#apns-credentials) | Authentication and service-to-service | notifier | `NOTIFIER_APNS_KEY`, `NOTIFIER_APNS_KEY_ID`, `NOTIFIER_APNS_TEAM_ID` (env:production) | 365d |
| [Firebase service-account key (FCM)](#fcm-service-account) | Authentication and service-to-service | notifier | `NOTIFIER_FCM_SERVICE_ACCOUNT` (env:production) | 365d |
| [Internal service token](#internal-service-token) | Authentication and service-to-service | api, messages, notifier, gateway, voice-signaling, admin-bff | `SHARED_INTERNAL_SERVICE_TOKEN` (env:production) | 90d |
| [Voice token secret (HS256)](#voice-token-secret) | Authentication and service-to-service | gateway, voice-signaling | `SHARED_VOICE_TOKEN_SECRET` (env:production) | 90d |
| [Voice probe token signing key (prepared, inactive)](#voice-probe-token-secret) | Authentication and service-to-service | voice-prober, voice-signaling | not in GitHub | 90d |
| [Erlang distribution cookie](#release-cookie) | Runtime | gateway | `GATEWAY_RELEASE_COOKIE` (env:production) | 180d |
| [GitHub OAuth app credentials](#github-oauth) | Authentication and service-to-service | api | not in GitHub | on-change |
| [SMTP credentials](#smtp-credentials) | Runtime | api | `SMTP_USERNAME`, `SMTP_PASSWORD` (env:production) | on-change |
| [Admin allowlist](#admin-allowed-emails) | Authentication and service-to-service | admin-bff | `ADMIN_ALLOWED_EMAILS` (env:production) | on-change |
| [coturn static auth secret](#coturn-static-auth-secret) | Runtime | coturn, gateway | `COTURN_STATIC_AUTH_SECRET` (env:production) | 180d |
| [Postgres password for api (DB discordy)](#postgres-app) | Databases | api, CloudNativePG | `POSTGRES_APP_PASSWORD` (env:production) | 90d |
| [Postgres password for admin-bff (DB discordy_admin)](#postgres-admin) | Databases | admin-bff, CloudNativePG | `POSTGRES_ADMIN_PASSWORD` (env:production) | 90d |
| [Valkey password](#valkey-password) | Databases | valkey, api, gateway | `VALKEY_PASSWORD` (env:production) | 180d |
| [MinIO access keys](#minio-keys) | Object storage | minio, api, messages | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` (env:production) | 180d |
| [GHCR pull credentials](#ghcr-pull) | CI/CD and GitHub | kubelet, Flux image-reflector-controller | `GHCR_USERNAME`, `GHCR_TOKEN` (org) | 90d |
| [ARC GitHub token](#arc-github-token) | CI/CD and GitHub | actions-runner-controller | `ARC_GITHUB_TOKEN` (org) | 90d |
| [Flux deploy key](#flux-deploy-key) | CI/CD and GitHub | Flux source-controller, image-automation-controller | not in GitHub | 365d |
| [Notion integration token](#notion-token) | CI/CD and GitHub | docs notion-sync workflow | `NOTION_TOKEN` (org) | 365d |
| [1Password service account token](#onepassword-service-account) | CI/CD and GitHub | platform admin workstation | not in GitHub | 90d |
| [Grafana admin password](#grafana-admin) | Observability | grafana, platform admin | `GRAFANA_ADMIN_PASSWORD` (env:production) | 180d |

## Cloudflare

<a id="cloudflare-api-token"></a>

### Cloudflare API token

| Field | Value |
|---|---|
| Purpose | Manages DNS records, the Voics tunnel and Access applications in the voics.nl zone. |
| Consumers | bootstrap/40-cloudflare.sh, regionctl, WS9 bring-up |
| Env vars | `CLOUDFLARE_API_TOKEN` |
| GitHub secret | `CLOUDFLARE_API_TOKEN` (org) |
| OpenBao | not in OpenBao |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#cloudflare-api-token](../runbooks/secret-rotation.md#cloudflare-api-token) |
| Generate | Cloudflare dashboard > My Profile > API Tokens > Create (Zone:DNS:Edit, Account:Cloudflare Tunnel:Edit, Account:Access: Apps and Policies:Edit), scoped to voics.nl |
| Notes | Scope to the voics.nl zone only. It must never be able to change the existing voics.nl / app.voics.nl records outside the discordy-* names (enforced by convention and review). |

<a id="cloudflared-credentials"></a>

### Cloudflare tunnel credentials (locally managed tunnel)

| Field | Value |
|---|---|
| Purpose | Credentials JSON for the locally managed tunnel discordy-gen-serv. cloudflared reads it from a file and dials out to Cloudflare. |
| Consumers | cloudflared |
| Env vars | — |
| GitHub secret | `CLOUDFLARED_CREDENTIALS_JSON` (env:production) |
| OpenBao | `discordy/cloudflared` → `CREDENTIALS_JSON` (from `CLOUDFLARED_CREDENTIALS_JSON`) |
| Kubernetes Secret | `voics-system/cloudflared-credentials` |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#cloudflare-tunnel-credentials](../runbooks/secret-rotation.md#cloudflare-tunnel-credentials) |
| Generate | bootstrap/40-cloudflare.sh creates the tunnel and stores its credentials JSON (see cloudflare-setup.md) |
| Notes | The tunnel is locally managed, so ingress rules live in the gitops ConfigMap and the credentials JSON is the only tunnel secret. Mounted at /etc/cloudflared/creds/credentials.json. |

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
| Notes | Stored only in 1Password. Revoked after bootstrap; regenerate from unseal shares when needed. |

## Authentication and service-to-service

<a id="jwt-signing-key"></a>

### JWT signing key pair (Ed25519)

| Field | Value |
|---|---|
| Purpose | Signs (private) and verifies (public) user access tokens (P3, alg EdDSA). |
| Consumers | api (private), messages, gateway, voice-signaling, admin-bff (public) |
| Env vars | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` |
| GitHub secret | `API_JWT_PRIVATE_KEY`, `SHARED_JWT_PUBLIC_KEY` (env:production) |
| OpenBao | `discordy/api` → `JWT_PRIVATE_KEY` (from `API_JWT_PRIVATE_KEY`); `discordy/shared` → `JWT_PUBLIC_KEY` (from `SHARED_JWT_PUBLIC_KEY`) |
| Kubernetes Secret | `voics-apps/api-secrets`, `voics-apps/admin-secrets`, `voics-apps/gateway-secrets`, `voics-apps/messages-secrets`, `voics-voice/voice-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#jwt-signing-key](../runbooks/secret-rotation.md#jwt-signing-key) |
| Generate | openssl genpkey -algorithm ed25519 -out jwt.pem && openssl pkey -in jwt.pem -pubout -out jwt.pub.pem |
| Notes | The public key is not confidential, but it travels with the pair so the two stay consistent. Only api receives the private key. |

<a id="attachment-signing-key"></a>

### Attachment download signing key

| Field | Value |
|---|---|
| Purpose | HMAC-SHA256 key that signs the expiring attachment download URLs (ex/is/hm) issued and verified by messages (ADR 0017). |
| Consumers | messages |
| Env vars | `ATTACHMENT_SIGNING_KEY` |
| GitHub secret | `MESSAGES_ATTACHMENT_SIGNING_KEY` (env:production) |
| OpenBao | `discordy/messages` → `ATTACHMENT_SIGNING_KEY` (from `MESSAGES_ATTACHMENT_SIGNING_KEY`) |
| Kubernetes Secret | `voics-apps/messages-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#attachment-signing-key](../runbooks/secret-rotation.md#attachment-signing-key) |
| Generate | openssl rand -hex 32 |
| Notes | Dev reads kv/discordy-dev/messages with its own value. Rotating invalidates outstanding links; clients refresh by refetching messages. The local compose stack generates its own into local/.env. |

<a id="apns-credentials"></a>

### Apple push (APNs) key, Key ID and Team ID

| Field | Value |
|---|---|
| Purpose | Lets the notifier send push notifications to the iPhone app through APNs with token-based authentication (the .p8 signing key, its Key ID and the Apple Team ID). |
| Consumers | notifier |
| Env vars | `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID` |
| GitHub secret | `NOTIFIER_APNS_KEY`, `NOTIFIER_APNS_KEY_ID`, `NOTIFIER_APNS_TEAM_ID` (env:production) |
| OpenBao | `discordy/notifier` → `APNS_KEY` (from `NOTIFIER_APNS_KEY`); `discordy/notifier` → `APNS_KEY_ID` (from `NOTIFIER_APNS_KEY_ID`); `discordy/notifier` → `APNS_TEAM_ID` (from `NOTIFIER_APNS_TEAM_ID`) |
| Kubernetes Secret | `voics-apps/notifier-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#apns-key](../runbooks/secret-rotation.md#apns-key) |
| Generate | Apple Developer, Certificates, Identifiers & Profiles, Keys: create a key with Apple Push Notifications service (APNs) enabled and download the .p8 once. The Key ID is shown next to the key; the Team ID is under Membership details. Owner action: nothing here can be generated. |
| Notes | The notifier runs at 0 replicas until this path exists (runbooks/push-notifications.md). NOTIFIER_APNS_KEY holds the whole .p8 file, BEGIN and END lines included. One key serves sandbox and production. Dev reads kv/discordy-dev/notifier and 25-secrets.sh skips it: provide it the same way. |

<a id="fcm-service-account"></a>

### Firebase service-account key (FCM)

| Field | Value |
|---|---|
| Purpose | Lets the notifier send push notifications and call rings to the Android app through Firebase Cloud Messaging HTTP v1 (project voics-cf336). |
| Consumers | notifier |
| Env vars | `NOTIFIER_FCM_SERVICE_ACCOUNT` |
| GitHub secret | `NOTIFIER_FCM_SERVICE_ACCOUNT` (env:production) |
| OpenBao | `discordy/notifier-fcm` → `FCM_SERVICE_ACCOUNT` (from `NOTIFIER_FCM_SERVICE_ACCOUNT`) |
| Kubernetes Secret | `voics-apps/notifier-fcm` |
| Owner | @oussamaelhajoui |
| Rotation | 365d — [secret-rotation.md#fcm-service-account-key](../runbooks/secret-rotation.md#fcm-service-account-key) |
| Generate | Firebase console, Project settings, Service accounts, Generate new private key (project voics-cf336). Owner action: nothing here can be generated. |
| Notes | Optional: the notifier starts without it and skips Android tokens. NOTIFIER_FCM_SERVICE_ACCOUNT holds the whole JSON file. Own OpenBao path so it can be provided independently of the APNs values; secrets-sync lists it under optional_paths and does not fail while it is unset. Dev reads kv/discordy-dev/notifier-fcm and 25-secrets.sh skips it: provide it the same way. |

<a id="internal-service-token"></a>

### Internal service token

| Field | Value |
|---|---|
| Purpose | Shared secret sent as X-Internal-Token on every /internal/* call between services. |
| Consumers | api, messages, notifier, gateway, voice-signaling, admin-bff |
| Env vars | `INTERNAL_SERVICE_TOKEN` |
| GitHub secret | `SHARED_INTERNAL_SERVICE_TOKEN` (env:production) |
| OpenBao | `discordy/shared` → `INTERNAL_SERVICE_TOKEN` (from `SHARED_INTERNAL_SERVICE_TOKEN`) |
| Kubernetes Secret | `voics-apps/admin-secrets`, `voics-apps/api-secrets`, `voics-apps/gateway-secrets`, `voics-apps/messages-secrets`, `voics-apps/notifier-secrets`, `voics-voice/voice-secrets` |
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
| GitHub secret | `SHARED_VOICE_TOKEN_SECRET` (env:production) |
| OpenBao | `discordy/shared` → `VOICE_TOKEN_SECRET` (from `SHARED_VOICE_TOKEN_SECRET`) |
| Kubernetes Secret | `voics-apps/gateway-secrets`, `voics-voice/voice-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#voice-token-secret](../runbooks/secret-rotation.md#voice-token-secret) |
| Generate | openssl rand -base64 48 |
| Notes | Every region reads the same path. Rotating it affects every region at once, so roll the gateway and all voice nodes together. |

<a id="voice-probe-token-secret"></a>

### Voice probe token signing key (prepared, inactive)

| Field | Value |
|---|---|
| Purpose | Authenticates isolated synthetic voice probes; cannot authorize ordinary call tokens. |
| Consumers | voice-prober, voice-signaling |
| Env vars | `VOICE_PROBE_TOKEN_SECRET` |
| GitHub secret | not in GitHub |
| OpenBao | not in OpenBao |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [voice-regions/troubleshooting.md#prepared-active-health-probes](../runbooks/voice-regions/troubleshooting.md#prepared-active-health-probes) |
| Generate | After rollout approval: openssl rand -base64 48. Never reuse VOICE_TOKEN_SECRET. |
| Notes | Metadata only; no value, GitHub secret, OpenBao binding or Kubernetes Secret is created. Add the reviewed gitops binding before enabling the prepared prober. Missing key keeps probe admission disabled. |

<a id="github-oauth"></a>

### GitHub OAuth app credentials

| Field | Value |
|---|---|
| Purpose | Allows the api to verify ownership of linked GitHub accounts. |
| Consumers | api |
| Env vars | `CONNECTION_GITHUB_CLIENT_ID`, `CONNECTION_GITHUB_CLIENT_SECRET` |
| GitHub secret | not in GitHub |
| OpenBao | not in OpenBao |
| Kubernetes Secret | — |
| Owner | @oussamaelhajoui |
| Rotation | on-change — [secret-rotation.md#github-oauth](../runbooks/secret-rotation.md#github-oauth) |
| Generate | Register a GitHub OAuth app with the exact public API callback, then obtain its client ID and secret. |
| Notes | Prepared metadata only; no GitHub, OpenBao or Kubernetes binding exists until a reviewed environment overlay and matching inventory entries are added. Linking remains disabled. |

<a id="admin-allowed-emails"></a>

### Admin allowlist

| Field | Value |
|---|---|
| Purpose | Emails allowed into the admin surfaces. admin-bff checks them as a second gate behind Cloudflare Access. |
| Consumers | admin-bff |
| Env vars | `ADMIN_ALLOWED_EMAILS` |
| GitHub secret | `ADMIN_ALLOWED_EMAILS` (env:production) |
| OpenBao | `discordy/admin` → `ADMIN_ALLOWED_EMAILS` (from `ADMIN_ALLOWED_EMAILS`) |
| Kubernetes Secret | `voics-apps/admin-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | on-change — [cloudflare-setup.md#cloudflare-access](../runbooks/cloudflare-setup.md#cloudflare-access) |
| Generate | Edit the list; it must match the emails in the Cloudflare Access policy |
| Notes | Not a credential, but it lives in the same flow. Keep it equal to the Access policy emails. |

## Runtime

<a id="release-cookie"></a>

### Erlang distribution cookie

| Field | Value |
|---|---|
| Purpose | Authenticates gateway nodes to each other in the Erlang cluster (libcluster). |
| Consumers | gateway |
| Env vars | `RELEASE_COOKIE` |
| GitHub secret | `GATEWAY_RELEASE_COOKIE` (env:production) |
| OpenBao | `discordy/gateway` → `RELEASE_COOKIE` (from `GATEWAY_RELEASE_COOKIE`) |
| Kubernetes Secret | `voics-apps/gateway-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#release-cookie](../runbooks/secret-rotation.md#release-cookie) |
| Generate | openssl rand -hex 32 |

<a id="smtp-credentials"></a>

### SMTP credentials

| Field | Value |
|---|---|
| Purpose | Login for the mail server the api sends account emails through (verification, password reset, security notices). Without them the api uses the log transport and sends nothing. |
| Consumers | api |
| Env vars | `SMTP_USERNAME`, `SMTP_PASSWORD` |
| GitHub secret | `SMTP_USERNAME`, `SMTP_PASSWORD` (env:production) |
| OpenBao | `discordy/smtp` → `SMTP_USERNAME` (from `SMTP_USERNAME`); `discordy/smtp` → `SMTP_PASSWORD` (from `SMTP_PASSWORD`) |
| Kubernetes Secret | `voics-apps/api-smtp` |
| Owner | @oussamaelhajoui |
| Rotation | on-change — [secret-rotation.md](../runbooks/secret-rotation.md) |
| Generate | Cloudflare Email Service: SMTP_USERNAME is the literal api_token, SMTP_PASSWORD is a Cloudflare API token with the Email Sending: Edit permission (runbooks/email-cloudflare.md). Any other provider: its SMTP user and password. |
| Notes | Owner action, tracked on docs#10. The api ConfigMap already carries SMTP_HOST, SMTP_PORT, SMTP_TLS and MAIL_FROM for Cloudflare; after the secret reaches OpenBao, flip MAIL_TRANSPORT to smtp (runbooks/email-cloudflare.md). The api-smtp secret is mounted optionally, so the api runs without it. |

<a id="coturn-static-auth-secret"></a>

### coturn static auth secret

| Field | Value |
|---|---|
| Purpose | TURN REST shared secret. The gateway mints short-lived TURN credentials for P2P; coturn verifies them. |
| Consumers | coturn, gateway |
| Env vars | `TURN_STATIC_AUTH_SECRET` |
| GitHub secret | `COTURN_STATIC_AUTH_SECRET` (env:production) |
| OpenBao | `discordy/coturn` → `STATIC_AUTH_SECRET` (from `COTURN_STATIC_AUTH_SECRET`) |
| Kubernetes Secret | `voics-voice/coturn`, `voics-apps/gateway-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#generic-procedure](../runbooks/secret-rotation.md#generic-procedure) |
| Generate | openssl rand -hex 32 |
| Notes | Implied by the P2P design (spec §6.4) and added to P2 as TURN_STATIC_AUTH_SECRET. |

## Databases

<a id="postgres-app"></a>

### Postgres password for api (DB discordy)

| Field | Value |
|---|---|
| Purpose | Password of the discordy role that owns DB discordy, templated into DATABASE_URL. |
| Consumers | api, CloudNativePG |
| Env vars | `DATABASE_URL` |
| GitHub secret | `POSTGRES_APP_PASSWORD` (env:production) |
| OpenBao | `discordy/postgres` → `APP_PASSWORD` (from `POSTGRES_APP_PASSWORD`) |
| Kubernetes Secret | `voics-data/postgres-app`, `voics-apps/api-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#database-passwords](../runbooks/secret-rotation.md#database-passwords) |
| Generate | openssl rand -base64 32 \| tr -d '/+=' |

<a id="postgres-admin"></a>

### Postgres password for admin-bff (DB discordy_admin)

| Field | Value |
|---|---|
| Purpose | Password of the discordy_admin role, templated into ADMIN_DATABASE_URL. |
| Consumers | admin-bff, CloudNativePG |
| Env vars | `ADMIN_DATABASE_URL` |
| GitHub secret | `POSTGRES_ADMIN_PASSWORD` (env:production) |
| OpenBao | `discordy/postgres` → `ADMIN_PASSWORD` (from `POSTGRES_ADMIN_PASSWORD`) |
| Kubernetes Secret | `voics-data/postgres-admin`, `voics-apps/admin-secrets` |
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
| OpenBao | `discordy/valkey` → `PASSWORD` (from `VALKEY_PASSWORD`) |
| Kubernetes Secret | `voics-data/valkey`, `voics-apps/api-secrets`, `voics-apps/gateway-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#database-passwords](../runbooks/secret-rotation.md#database-passwords) |
| Generate | openssl rand -base64 32 \| tr -d '/+=' |

## Object storage

<a id="minio-keys"></a>

### MinIO access keys

| Field | Value |
|---|---|
| Purpose | S3 access keys for the MinIO object store, read by api (discordy-assets) and messages (discordy-attachments). The MinIO server reads the same pair for its own setup. |
| Consumers | minio, api, messages |
| Env vars | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` |
| GitHub secret | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` (env:production) |
| OpenBao | `discordy/minio` → `ACCESS_KEY` (from `MINIO_ACCESS_KEY`); `discordy/minio` → `SECRET_KEY` (from `MINIO_SECRET_KEY`) |
| Kubernetes Secret | `voics-data/minio`, `voics-apps/api-secrets`, `voics-apps/messages-secrets` |
| Owner | @oussamaelhajoui |
| Rotation | 180d — [secret-rotation.md#minio-keys](../runbooks/secret-rotation.md#minio-keys) |
| Generate | openssl rand -hex 16 (access key), openssl rand -base64 32 (secret key) |
| Notes | One pair for every consumer, as gitops reads it. Scoped per-bucket service accounts are not in gitops yet. |

## CI/CD and GitHub

<a id="ghcr-pull"></a>

### GHCR pull credentials

| Field | Value |
|---|---|
| Purpose | Lets the cluster (kubelet imagePullSecret, Flux ImageRepository) read private images from GHCR. |
| Consumers | kubelet, Flux image-reflector-controller |
| Env vars | — |
| GitHub secret | `GHCR_USERNAME`, `GHCR_TOKEN` (org) |
| OpenBao | `discordy/ghcr` → `USERNAME` (from `GHCR_USERNAME`); `discordy/ghcr` → `TOKEN` (from `GHCR_TOKEN`) |
| Kubernetes Secret | `voics-apps/ghcr-pull`, `voics-voice/ghcr-pull`, `flux-system/ghcr-pull` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#ghcr-pull-token](../runbooks/secret-rotation.md#ghcr-pull-token) |
| Generate | GitHub > Settings > Developer settings > Fine-grained or classic PAT with read:packages only |

<a id="arc-github-token"></a>

### ARC GitHub token

| Field | Value |
|---|---|
| Purpose | Lets Actions Runner Controller register the self-hosted runner scale set "discordy" with the org. Also used by secrets-sync, which runs on these runners. |
| Consumers | actions-runner-controller |
| Env vars | `github_token` |
| GitHub secret | `ARC_GITHUB_TOKEN` (org) |
| OpenBao | `discordy/arc` → `GITHUB_TOKEN` (from `ARC_GITHUB_TOKEN`) |
| Kubernetes Secret | `voics-system/arc-github` |
| Owner | @oussamaelhajoui |
| Rotation | 90d — [secret-rotation.md#arc-github-credentials](../runbooks/secret-rotation.md#arc-github-credentials) |
| Generate | Classic PAT with admin:org scope |
| Notes | Bootstrap chicken-and-egg: secrets-sync runs on ARC, so bootstrap/20-openbao.sh seeds kv/discordy/arc from ARC_GITHUB_TOKEN during WS9 bring-up (openbao-unseal.md > First-time bootstrap). |

<a id="flux-deploy-key"></a>

### Flux deploy key

| Field | Value |
|---|---|
| Purpose | SSH deploy key with write access to voics-app/gitops, used by Flux source and image automation. |
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

### Grafana admin password

| Field | Value |
|---|---|
| Purpose | Grafana admin login. |
| Consumers | grafana, platform admin |
| Env vars | `GF_SECURITY_ADMIN_PASSWORD` |
| GitHub secret | `GRAFANA_ADMIN_PASSWORD` (env:production) |
| OpenBao | `discordy/grafana` → `ADMIN_PASSWORD` (from `GRAFANA_ADMIN_PASSWORD`) |
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
