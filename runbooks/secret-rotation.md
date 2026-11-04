# Secret rotation

Every secret in the [inventory](../secrets/README.md) links to a section of this runbook. Values flow from GitHub, through `secrets-sync`, into OpenBao, then through External Secrets Operator into Kubernetes Secrets ([ADR-0006](../adr/0006-secrets-flow.md)). Rotating a secret therefore always follows the [generic procedure](#generic-procedure). The per-secret sections add ordering and zero-downtime details.

The GitHub secret names and OpenBao keys below match `gitops/secrets/inventory.yaml`. CI in gitops enforces that match.

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

## Cloudflare tunnel credentials

The gen-serv tunnel is locally managed. Its only secret is the credentials JSON, `{AccountTag, TunnelSecret, TunnelID}`, held in the GitHub `production` environment secret `CLOUDFLARED_CREDENTIALS_JSON`. Rotate the **tunnel secret**, then rebuild the credentials JSON with it:

```bash
CF=https://api.cloudflare.com/client/v4; AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
NEW_SECRET=$(openssl rand -base64 32)
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$CF/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID" --data "{\"tunnel_secret\":\"$NEW_SECRET\"}" | jq .success
jq -cn --arg a "$ACCOUNT_ID" --arg t "$TUNNEL_ID" --arg s "$NEW_SECRET" \
  '{AccountTag: $a, TunnelSecret: $s, TunnelID: $t}' \
  | gh secret set CLOUDFLARED_CREDENTIALS_JSON --repo discordy-voics/gitops --env production
```

Then run `secrets-sync`, force-sync `voics-system/cloudflared-credentials`, and restart `cloudflared`:

```bash
kubectl -n voics-system rollout restart deploy/cloudflared
```

Expect a few seconds of public downtime while the connectors reconnect. Check that the tunnel is **Healthy** in Zero Trust → Networks → Tunnels.

Standalone region tunnels are not in the inventory yet, so they have no rotation procedure here. See [cloudflare-setup → region tunnels](cloudflare-setup.md#region-tunnels-standalone-clusters).

## JWT signing key

P2 has a single `JWT_PUBLIC_KEY`, so rotation is a **hard cut**:

- Access tokens signed with the old key are rejected once the verifiers restart.
- Access tokens live for only 15 minutes, and refresh tokens are opaque (not JWTs), so clients transparently refresh on their next 401.

The private key is `API_JWT_PRIVATE_KEY` (read by api only). The public key is `SHARED_JWT_PUBLIC_KEY`.

1. Generate the pair:

   ```bash
   openssl genpkey -algorithm ed25519 -out jwt.pem
   openssl pkey -in jwt.pem -pubout -out jwt.pub.pem
   gh secret set API_JWT_PRIVATE_KEY    --repo discordy-voics/gitops --env production < jwt.pem
   gh secret set SHARED_JWT_PUBLIC_KEY  --repo discordy-voics/gitops --env production < jwt.pub.pem
   shred -u jwt.pem jwt.pub.pem
   ```

2. Run `secrets-sync`, then force-sync `api-secrets`, `admin-secrets`, `gateway-secrets` and `messages-secrets` in `voics-apps`, and `voice-secrets` in `voics-voice`.
3. **Restart everything at once**, so issuer and verifiers switch together:

   ```bash
   kubectl -n voics-apps rollout restart deploy/api deploy/messages deploy/admin-bff sts/gateway
   kubectl -n voics-voice rollout restart deploy -l app.kubernetes.io/name=voice
   ```

4. **Verify**: log in with a client, let it refresh, and check that it reconnects to the gateway. The gateway's 4004 close count spikes briefly, then returns to baseline.

## Internal service token

There is one shared value, sent as `X-Internal-Token`. During the rollout, pods with different values reject each other's internal calls. Keep that window to seconds:

1. Set the new value: `gh secret set SHARED_INTERNAL_SERVICE_TOKEN --repo discordy-voics/gitops --env production`, then run `secrets-sync`.
2. Force-sync `admin-secrets`, `api-secrets`, `gateway-secrets` and `messages-secrets` in `voics-apps`, and `voice-secrets` in `voics-voice`.
3. Restart **all consumers in one command** (the same command as for the JWT key).
4. **Verify**: the gateway READY works (it calls api's internal `/ready`), and the admin Overview loads (admin-bff calls the internal stats endpoints).

## Attachment signing key

Signs attachment download URLs. Links issued under the old key stop working at the restart; clients recover by refetching the message.

1. Set the new value: `openssl rand -hex 32 | gh secret set MESSAGES_ATTACHMENT_SIGNING_KEY --repo discordy-voics/gitops --env production`, then run `secrets-sync`.
2. Force-sync `messages-secrets` in `voics-apps`.
3. Restart the messages deployment.
4. **Verify**: open a channel with an attachment (the history call returns fresh links) and download it.

## Voice token secret

This HS256 secret is shared by the gateway (signer) and **every voice node in every region** (verifiers). Voice tokens live 60 seconds.

1. Set `SHARED_VOICE_TOKEN_SECRET`, then run `secrets-sync`.
2. Force-sync `gateway-secrets` (`voics-apps`) and `voice-secrets` (`voics-voice`) in each region.
3. Restart the gateway and all voice nodes together. Joins in the restart window fail and retry automatically. Calls already in progress keep their media, but reconnect when the voice-signaling pod restarts.
4. **Verify**: run a test call in each region (`regionctl list` lists them).

## Release cookie

The Erlang distribution cookie. Gateway pods with different cookies **cannot cluster**, so a rolling restart would split the cluster.

1. Set `GATEWAY_RELEASE_COOKIE`, run `secrets-sync`, and force-sync `gateway-secrets`.
2. Restart the gateway as a whole:

   ```bash
   kubectl -n voics-apps scale sts/gateway --replicas=0
   kubectl -n voics-apps scale sts/gateway --replicas=<N>
   ```

   All clients reconnect, and they resume when they come back within 120 s.
3. **Verify**: every pod reports the full member list in `kubectl -n voics-apps logs sts/gateway | grep -i 'nodeup'`.

## Database passwords

The order is: update the role, then the secret, then restart, so that the old password works until the restart.

**Postgres app roles** (`discordy` for api, `discordy_admin` for admin-bff). CloudNativePG manages the roles from Secrets, through `spec.managed.roles`, so updating the Secret updates the role:

1. Set `POSTGRES_APP_PASSWORD` or `POSTGRES_ADMIN_PASSWORD`, then run `secrets-sync`.
2. Force-sync the ExternalSecret that feeds the CNPG role Secret (`postgres-app` or `postgres-admin` in `voics-data`), and the app Secret (`api-secrets` or `admin-secrets` in `voics-apps`). The app ExternalSecret also templates `DATABASE_URL` / `ADMIN_DATABASE_URL`.
3. Wait until `kubectl -n voics-data get cluster postgres -o jsonpath='{.status.managedRolesStatus}'` shows the role reconciled.
4. Run `kubectl -n voics-apps rollout restart deploy/api` (or `deploy/admin-bff`).

**Valkey**: Valkey reads `requirepass` at start. Use the dual-password window:

1. Add the new password alongside the old one in a single command:

   ```bash
   kubectl -n voics-data exec valkey-0 -- valkey-cli -a "$OLD" ACL SETUSER default on ">$NEW"
   ```

2. Set `VALKEY_PASSWORD`, run `secrets-sync`, then force-sync `valkey` (`voics-data`), `api-secrets` and `gateway-secrets` (`voics-apps`).
3. Restart `api` and the `gateway` StatefulSet.
4. Remove the old password:

   ```bash
   kubectl -n voics-data exec valkey-0 -- valkey-cli -a "$NEW" ACL SETUSER default "<$OLD"
   ```

5. Restart Valkey in the next maintenance window, so the config and the ACL agree.

## MinIO keys

The `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` pair is read by MinIO, api and messages. Rotate it with a new service-account pair, so the old pair works until the restart:

1. Create a new access key pair with the same policy, for example `mc admin user svcacct add --policy attachments-rw.json discordy messages`.
2. Update the GitHub secrets `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`, then run `secrets-sync`.
3. Force-sync `minio` (`voics-data`), `api-secrets` and `messages-secrets` (`voics-apps`), then restart `api` and `messages`.
4. **Verify**: upload an attachment (messages) or an avatar (api).
5. Delete the old service account with `mc admin user svcacct rm discordy <old-access-key>`.

## GHCR pull token

1. Create a new PAT with `read:packages` only.
2. Run `gh secret set GHCR_TOKEN --org discordy-voics`, then `secrets-sync`. Use `GHCR_USERNAME` only if the account changes.
3. Force-sync `ghcr-pull` in `voics-apps`, `voics-voice`, and `flux-system`.
4. **Verify**: run `flux reconcile image repository api -n flux-system`, which must succeed. Then delete one app pod; its image must pull.
5. Delete the old PAT.

## ARC GitHub credentials

1. Create a new classic PAT with `admin:org` scope, the one ARC needs to register runners.
2. Run `gh secret set ARC_GITHUB_TOKEN --org discordy-voics`, then run `secrets-sync`. That workflow runs **on ARC itself**, but the old token still works at this point, so this is fine.
3. Force-sync `voics-system/arc-github`, then restart the ARC controller and listener.
4. **Verify**: the runner scale set `discordy` shows as online under Org → Settings → Actions → Runners.
5. Revoke the old PAT.

If ARC is broken and can't run `secrets-sync`, write the value straight into OpenBao, for example `bao kv put -mount=kv discordy/arc GITHUB_TOKEN="$ARC_GITHUB_TOKEN"`, from an admin shell with a valid OpenBao token. Keep the value in the shell only. See [OpenBao → first-time bootstrap](openbao-unseal.md#first-time-bootstrap).

## Flux deploy key

```bash
gh repo deploy-key list --repo discordy-voics/gitops
gh repo deploy-key delete <id> --repo discordy-voics/gitops
flux bootstrap github --owner discordy-voics --repository gitops --private --path clusters/gen-serv
```

The bootstrap is idempotent and creates a new key. Then run `flux reconcile source git flux-system` to verify. Repeat with `--context` for each standalone region cluster.

## Notion token

1. Go to notion.so/my-integrations → Voics docs sync → **Refresh secret**.
2. Run `gh secret set NOTION_TOKEN --org discordy-voics`.
3. **Verify**: re-run the latest `notion-sync` workflow in `docs`.
