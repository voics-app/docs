# Secret rotation

Every secret in the [inventory](../secrets/README.md) links to a section of this runbook. Values flow from GitHub, through `secrets-sync`, into OpenBao, then through External Secrets Operator into Kubernetes Secrets ([ADR-0006](../adr/0006-secrets-flow.md)). Rotating a secret therefore always follows the [generic procedure](#generic-procedure). The per-secret sections add ordering and zero-downtime details.

**Rotate immediately**, whatever the schedule, when:

- the value may have leaked (a log, a screenshot, a commit; gitleaks will usually flag it);
- someone with access leaves;
- the inventory's interval has elapsed. The `secrets-age` workflow opens an issue 14 days before.

## Generic procedure

1. **Generate** a new value, using the command in the inventory's `generate` field. Never reuse a value.
2. **Update GitHub**:

   ```bash
   gh secret set <NAME> --org discordy-voics --visibility selected --repos gitops   # org scope
   gh secret set <NAME> --repo discordy-voics/gitops --env production             # env scope
   ```

   Pipe the value from stdin, never as an argument: `openssl rand -base64 48 | gh secret set NAME ...`.
3. **Sync**: `gh workflow run secrets-sync.yml --repo discordy-voics/gitops`, then `gh run watch`.
4. **Refresh ESO**:

   ```bash
   kubectl -n <ns> annotate externalsecret <name> force-sync="$(date +%s)" --overwrite
   ```

5. **Restart the consumers.** Env vars are read at startup:

   ```bash
   kubectl -n <ns> rollout restart deploy/<name>
   ```

6. **Verify**: check `/readyz`, check the logs for authentication errors, and run the service-specific check below.
7. **Revoke the old value** at its source (Cloudflare, GitHub, MinIO, Postgres), if it has one.
8. **Record** the rotation date in the inventory item's `notes`, only when the rotation was off-schedule, and say why.

## Cloudflare API token

1. In Cloudflare, go to My Profile → API Tokens and **roll** the token. This keeps the permissions and issues a new value. Alternatively, create a new token with the same scopes listed in the [inventory](../secrets/README.md#cloudflare-api-token).
2. Set `gh secret set CLOUDFLARE_API_TOKEN --org discordy-voics`, then run `secrets-sync`.
3. **Verify**: run `curl -s -H "Authorization: Bearer <new>" https://api.cloudflare.com/client/v4/user/tokens/verify | jq .result.status`. It must print `active`.
4. Delete the old token, if you created a new one rather than rolling.
5. Update 1Password's copy, which `regionctl` users read.

## Cloudflare tunnel token

Tunnel tokens can't be rolled independently. Instead, rotate the **tunnel secret**:

```bash
CF=https://api.cloudflare.com/client/v4; AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
NEW_SECRET=$(openssl rand -base64 32)
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$CF/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID" --data "{\"tunnel_secret\":\"$NEW_SECRET\"}" | jq .success
curl -s -H "$AUTH" "$CF/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token" | jq -r .result \
  | gh secret set CLOUDFLARE_TUNNEL_TOKEN --repo discordy-voics/gitops --env production
```

Then run `secrets-sync`, force-sync `voics-system/cloudflared-tunnel`, and restart `cloudflared`. Expect a few seconds of public downtime while the connectors reconnect.

For a standalone region, apply the same steps to its tunnel and to `CLOUDFLARE_TUNNEL_TOKEN_<REGION>`.

## JWT signing key

P2 has a single `JWT_PUBLIC_KEY`, so rotation is a **hard cut**:

- Access tokens signed with the old key are rejected once the verifiers restart.
- Access tokens live for only 15 minutes, and refresh tokens are opaque (not JWTs), so clients transparently refresh on their next 401.

1. Generate the pair:

   ```bash
   openssl genpkey -algorithm ed25519 -out jwt.pem
   openssl pkey -in jwt.pem -pubout -out jwt.pub.pem
   gh secret set JWT_PRIVATE_KEY --repo discordy-voics/gitops --env production < jwt.pem
   gh secret set JWT_PUBLIC_KEY  --repo discordy-voics/gitops --env production < jwt.pub.pem
   shred -u jwt.pem jwt.pub.pem
   ```

2. Run `secrets-sync`, then force-sync `api-secrets` and `common-secrets` in `voics-apps` and `voics-voice`.
3. **Restart everything at once**, so issuer and verifiers switch together:

   ```bash
   kubectl -n voics-apps rollout restart deploy/api deploy/messages deploy/admin-bff sts/gateway
   kubectl -n voics-voice rollout restart deploy -l app.kubernetes.io/name=voice
   ```

4. **Verify**: log in with a client, let it refresh, and check that it reconnects to the gateway. The gateway's 4004 close count spikes briefly, then returns to baseline.

## Internal service token

There is one shared value, sent as `X-Internal-Token`. During the rollout, pods with different values reject each other's internal calls. Keep that window to seconds:

1. Set the new value: `gh secret set INTERNAL_SERVICE_TOKEN --env production ...`, then run `secrets-sync`.
2. Force-sync `common-secrets` in `voics-apps` and `voics-voice`.
3. Restart **all consumers in one command** (the same command as for the JWT key).
4. **Verify**: the gateway READY works (it calls api's internal `/ready`), and the admin Overview loads (admin-bff calls the internal stats endpoints).

## Voice token secret

This HS256 secret is shared by the gateway (signer) and **every voice node in every region** (verifiers). Voice tokens live 60 seconds.

1. Set `VOICE_TOKEN_SECRET`, then run `secrets-sync`.
2. Force-sync `gateway-secrets` (`voics-apps`), `voice-secrets` (`voics-voice`) and each standalone region's `voice-secrets`.
3. Restart the gateway and all voice nodes together. Joins in the restart window fail and retry automatically. Calls already in progress keep their media, but reconnect when the voice-signaling pod restarts.
4. **Verify**: run a test call in each region (`regionctl list` lists them).

## Release cookie

The Erlang distribution cookie. Gateway pods with different cookies **cannot cluster**, so a rolling restart would split the cluster.

1. Set `RELEASE_COOKIE`, run `secrets-sync`, and force-sync `gateway-secrets`.
2. Restart the gateway as a whole:

   ```bash
   kubectl -n voics-apps scale sts/gateway --replicas=0
   kubectl -n voics-apps scale sts/gateway --replicas=<N>
   ```

   All clients reconnect, and they resume when they come back within 120 s.
3. **Verify**: every pod reports the full member list in `kubectl -n voics-apps logs sts/gateway | grep -i 'nodeup'`.

## Database passwords

The order is: update the role, then the secret, then restart, so that the old password works until the restart.

**Postgres app roles** (`discordy`, `discordy_admin`). CloudNativePG manages the roles from Secrets, through `spec.managed.roles`, so updating the Secret updates the role:

1. Set `POSTGRES_API_PASSWORD` or `POSTGRES_ADMIN_PASSWORD`, then run `secrets-sync`.
2. Force-sync the ExternalSecret that feeds the CNPG role Secret, and the app Secret (`api-secrets` or `admin-secrets`). The ExternalSecret also templates `DATABASE_URL` / `ADMIN_DATABASE_URL`.
3. Wait until `kubectl -n voics-data get cluster postgres -o jsonpath='{.status.managedRolesStatus}'` shows the role reconciled.
4. Run `kubectl -n voics-apps rollout restart deploy/api` (or `deploy/admin-bff`).

**Postgres superuser**: set `POSTGRES_SUPERUSER_PASSWORD`, run `secrets-sync`, then force-sync `postgres-superuser`. CNPG applies it. No app restart is needed.

**Valkey**: Valkey reads `requirepass` at start. Use the dual-password window:

1. Add the new password alongside the old one in a single command:

   ```bash
   kubectl -n voics-data exec valkey-0 -- valkey-cli -a "$OLD" ACL SETUSER default on ">$NEW"
   ```

2. Set `VALKEY_PASSWORD`, run `secrets-sync`, then force-sync `valkey-auth`, `api-secrets` and `gateway-secrets`.
3. Restart `api` and the `gateway` StatefulSet.
4. Remove the old password:

   ```bash
   kubectl -n voics-data exec valkey-0 -- valkey-cli -a "$NEW" ACL SETUSER default "<$OLD"
   ```

5. Restart Valkey in the next maintenance window, so the config and the ACL agree.

## MinIO keys

Service accounts make this zero-downtime:

1. Create a new service account with the same policy, for example `mc admin user svcacct add --policy attachments-rw.json discordy messages`.
2. Update the GitHub secrets (`MINIO_MESSAGES_ACCESS_KEY` and `MINIO_MESSAGES_SECRET_KEY`), then run `secrets-sync`, force-sync and restart the consumer.
3. **Verify**: upload an attachment (messages) or an avatar (api).
4. Delete the old service account with `mc admin user svcacct rm discordy <old-access-key>`.

**Root credentials**: update `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, run `secrets-sync`, force-sync `minio-root`, then restart the MinIO StatefulSet, which causes a short storage blip. Update your `mc alias` afterwards.

## GHCR pull token

1. Create a new PAT with `read:packages` only.
2. Run `gh secret set GHCR_PULL_TOKEN --org discordy-voics`, then `secrets-sync`.
3. Force-sync `ghcr-pull` (`voics-apps`, `voics-voice`) and `ghcr-auth` (`flux-system`).
4. **Verify**: run `flux reconcile image repository api -n flux-system`, which must succeed. Then delete one app pod; its image must pull.
5. Delete the old PAT.

## ARC GitHub credentials

**GitHub App** (preferred):

1. Generate a new private key in the App settings.
2. Update `ARC_GITHUB_APP_PRIVATE_KEY`, then run `secrets-sync`. That workflow runs **on ARC itself**, but the old key still works at this point, so this is fine.
3. Force-sync `voics-system/arc-github-app`, then restart the ARC controller and listener.
4. **Verify**: the runner scale set `discordy` shows as online under Org → Settings → Actions → Runners.
5. Delete the old key in the App settings.

**PAT fallback**: the same steps with `ARC_GITHUB_PAT`.

If ARC is broken and can't run `secrets-sync`, write the value straight into OpenBao, as in [bootstrap step 6](openbao-unseal.md#first-time-bootstrap).

## Flux deploy key

```bash
gh repo deploy-key list --repo discordy-voics/gitops
gh repo deploy-key delete <id> --repo discordy-voics/gitops
flux bootstrap github --owner discordy-voics --repository gitops --private --path clusters/gen-serv
```

The bootstrap is idempotent and creates a new key. Then run `flux reconcile source git flux-system` to verify. Repeat with `--context` for each standalone region cluster.

## Notion token

1. Go to notion.so/my-integrations → Discordy docs sync → **Refresh secret**.
2. Run `gh secret set NOTION_TOKEN --org discordy-voics`.
3. **Verify**: re-run the latest `notion-sync` workflow in `docs`.
