# Cloudflare setup

This runbook sets up Discordy's Cloudflare resources in the account that already hosts `voics.nl` ([ADR-0005](../adr/0005-cloudflare-tunnel.md)). It is used during WS9 bring-up, and again when hostnames or regions change.

The bring-up procedure is the gitops bootstrap scripts: `gitops/bootstrap/40-cloudflare.sh` creates the tunnel and the DNS records, and `gitops/bootstrap/50-public-ip.sh` sets the home IP. Read `gitops/bootstrap/README.md` for the order and the prerequisites. The steps below show what the script does, so you can debug or repeat one step by hand.

> **Hard rule:** never modify `voics.nl`, `app.voics.nl` or any record that does not start with `discordy`. Those belong to a different product, hosted on another machine. Every request below creates or changes only `discordy*` names.

## Resources

| Resource | Name | Purpose |
|---|---|---|
| API token | "Discordy automation" | DNS, tunnel and Access automation ([inventory](../secrets/README.md#cloudflare-api-token)) |
| Tunnel (locally managed) | `discordy-gen-serv` | Outbound connector from `cloudflared` in `voics-system`. Its credentials JSON is the secret `CLOUDFLARED_CREDENTIALS_JSON` ([inventory](../secrets/README.md#cloudflared-credentials)) |
| DNS (proxied CNAME → tunnel) | `discordy`, `discordy-api`, `discordy-gateway`, `discordy-admin`, `discordy-headlamp`, `discordy-updates`, `discordy-cdn`, `discordy-rtc-<region>` | Public hostnames, each exactly one level under `voics.nl` |
| Access applications | `discordy-admin`, `discordy-headlamp` | Identity gate for the admin surfaces |

**Locally managed tunnel.** The tunnel is created with `config_src: local`, so Cloudflare does not hold its ingress rules. The rules live in the gitops `cloudflared` ConfigMap (`gitops/infrastructure/controllers/cloudflared/cloudflared.yaml`) and reach the pods through Flux. The only tunnel secret is the credentials JSON, `{AccountTag, TunnelSecret, TunnelID}`, stored as the GitHub `production` environment secret `CLOUDFLARED_CREDENTIALS_JSON` and synced into OpenBao at `kv/discordy/cloudflared` (key `CREDENTIALS_JSON`). External Secrets materialises it as `voics-system/cloudflared-credentials`, mounted at `/etc/cloudflared/creds/credentials.json`.

All hostnames are configurable in the gitops `cluster-config` ConfigMap. The defaults are listed below. If you change one, change it in the ConfigMap, the DNS record and the tunnel ingress rule together.

| Host | Tunnel ingress target |
|---|---|
| `discordy.voics.nl` | `http://ingress-nginx-controller.voics-system.svc:80` (landing and download page) |
| `discordy-api.voics.nl` | same ingress (routes `/api/v1/channels/*/messages*` to messages, everything else to api) |
| `discordy-gateway.voics.nl` | same ingress (gateway `:4000`, WebSocket) |
| `discordy-admin.voics.nl` | same ingress (admin-bff `:8090`), **behind Access** |
| `discordy-headlamp.voics.nl` | same ingress (Headlamp), **behind Access** |
| `discordy-updates.voics.nl` | same ingress (MinIO `updates` bucket, public read) |
| `discordy-cdn.voics.nl` | same ingress (MinIO signed URLs) |
| `discordy-rtc-<region>.voics.nl` | `http://voice-<region>.voics-voice.svc:4100` (voice WebSocket; added per region) |

Voice media (UDP 50000) and coturn (UDP/TCP 3478) **do not** go through Cloudflare.

## 1. Create the API token

This is an owner action (spec §17.4):

1. In Cloudflare, go to **My Profile → API Tokens → Create Token → Custom token**.
2. Grant these permissions:
   - Zone → DNS → Edit
   - Account → Cloudflare Tunnel → Edit
   - Account → Access: Apps and Policies → Edit
3. Set **Zone resources** to Include → Specific zone → `voics.nl`, and **Account resources** to the voics account.
4. Optionally restrict client IPs to the home IP and GitHub's runner ranges. Leave this off if you use hosted runners.
5. Store the token:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --org discordy-voics      # paste on stdin
   op item create --vault Discordy --category "API Credential" --title "Cloudflare API token" credential=-
   ```

## 2. Common variables

```bash
export CLOUDFLARE_API_TOKEN="$(op read 'op://Discordy/Cloudflare API token/credential')"
CF=https://api.cloudflare.com/client/v4
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
export CLOUDFLARE_ZONE_ID=$(curl -s -H "$AUTH" "$CF/zones?name=voics.nl" | jq -r '.result[0].id')
ACCOUNT_ID=$(curl -s -H "$AUTH" "$CF/zones/$CLOUDFLARE_ZONE_ID" | jq -r '.result.account.id')
curl -s -H "$AUTH" "$CF/user/tokens/verify" | jq -r .result.status     # active
```

## 3. Create the tunnel

```bash
TUNNEL=$(curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  "$CF/accounts/$ACCOUNT_ID/cfd_tunnel" \
  --data "{\"name\":\"discordy-gen-serv\",\"config_src\":\"local\",\"tunnel_secret\":\"$(openssl rand -base64 32)\"}")
TUNNEL_ID=$(echo "$TUNNEL" | jq -r .result.id)
echo "$TUNNEL_ID"

# Credentials JSON for cloudflared, stored as a GitHub environment secret.
# The API returns it once, in result.credentials_file. Never write it to disk.
echo "$TUNNEL" | jq -c .result.credentials_file \
  | gh secret set CLOUDFLARED_CREDENTIALS_JSON --repo discordy-voics/gitops --env production
```

Record `TUNNEL_ID` in `gitops/infrastructure/configs/cluster-config.yaml` as `CLOUDFLARE_TUNNEL_ID`. It is an identifier, not a secret.

## 4. Check the ingress rules

Because the tunnel is locally managed, there is no ingress call to the Cloudflare API. Check that the ingress rules in the gitops `cloudflared` ConfigMap match the table above, and that the file ends with the catch-all rule:

```yaml
ingress:
  - hostname: discordy.voics.nl
    service: http://ingress-nginx-controller.voics-system.svc.cluster.local:80
  # ...one rule per host in the table above...
  - service: http_status:404
```

The final catch-all rule is mandatory. Region rules are inserted **before** it ([adding a region → step 8](voice-regions/adding-a-region.md#step-8-cloudflare-dns-and-tunnel-route)). A change reaches the pods through Flux, so a restart of `cloudflared` is needed only when the credentials change.

## 5. Create the DNS records

```bash
for host in discordy discordy-api discordy-gateway discordy-admin discordy-headlamp discordy-updates discordy-cdn discordy-rtc-nl-home; do
  existing=$(curl -s -H "$AUTH" "$CF/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$host.voics.nl" | jq -r '.result | length')
  if [ "$existing" = "0" ]; then
    curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' "$CF/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
      --data "{\"type\":\"CNAME\",\"name\":\"$host\",\"content\":\"$TUNNEL_ID.cfargotunnel.com\",\"proxied\":true,\"comment\":\"discordy (managed by gitops)\"}" \
      | jq -r "\"$host: \" + (.success|tostring)"
  else
    echo "$host: exists, not touched"
  fi
done
```

The loop is idempotent. It never overwrites an existing record. If a name exists with a different target, investigate by hand.

## 6. Zone settings to check

Check these, but don't change them if they would affect `voics.nl`. All are zone-wide:

| Setting | Required | Why |
|---|---|---|
| Network → WebSockets | On | Gateway and voice WebSockets |
| SSL/TLS mode | Full or Full (strict) | The tunnel origin is HTTP inside the cluster, so the mode only affects other origins. Leave the existing setting. |
| Edge certificates → Universal SSL | Active | Covers `*.voics.nl`, which is why every hostname is one level deep |
| Always Use HTTPS | On (recommended) | |
| Minimum TLS version | 1.2 | |

**Cache**: add a Cache Rule that **bypasses** the cache for `discordy-api.voics.nl`, `discordy-gateway.voics.nl` and `discordy-rtc-*`. Allow caching on `discordy-updates.voics.nl` for installers, but respect the origin headers for `latest*.yml`, which must not be cached for long.

## Cloudflare Access

Access protects `discordy-admin.voics.nl` and `discordy-headlamp.voics.nl`. admin-bff additionally verifies the `Cf-Access-Jwt-Assertion` header against the team JWKS and checks `ADMIN_ALLOWED_EMAILS`, as a second gate.

```bash
for host in discordy-admin discordy-headlamp; do
  APP=$(curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' "$CF/accounts/$ACCOUNT_ID/access/apps" \
    --data "{\"name\":\"$host\",\"domain\":\"$host.voics.nl\",\"type\":\"self_hosted\",\"session_duration\":\"12h\",\"app_launcher_visible\":true}")
  APP_ID=$(echo "$APP" | jq -r .result.id)
  echo "$host aud=$(echo "$APP" | jq -r .result.aud)"
  curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' "$CF/accounts/$ACCOUNT_ID/access/apps/$APP_ID/policies" \
    --data '{"name":"platform admins","decision":"allow","include":[{"email":{"email":"<owner email>"}}],"precedence":1}' | jq .success
done
```

Then:

1. Put the `aud` tag of `discordy-admin` and the team domain (`<team>.cloudflareaccess.com`) into the admin-bff config in gitops. These are identifiers, not secrets.
2. Make sure `ADMIN_ALLOWED_EMAILS` lists the same emails as the Access policy.
3. **Verify**: open `https://discordy-admin.voics.nl` in a private window. The Access login must appear before any admin page.

## Region tunnels (standalone clusters)

Regions whose node **joins** gen-serv reuse the `discordy-gen-serv` tunnel and only need an ingress rule in the gitops `cloudflared` ConfigMap and a DNS record.

A **standalone** region cluster needs its own locally managed tunnel. Its credentials are not in the [secrets inventory](../secrets/README.md) yet, because gitops does not read them from OpenBao. Until the secret name and the OpenBao path are added to both gitops and the inventory, do not store the credentials JSON anywhere. The API call below creates the tunnel only:

```bash
REGION=de-fra
T=$(curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' "$CF/accounts/$ACCOUNT_ID/cfd_tunnel" \
  --data "{\"name\":\"discordy-$REGION\",\"config_src\":\"local\",\"tunnel_secret\":\"$(openssl rand -base64 32)\"}")
echo "$T" | jq -r .result.id
```

The region's DNS record (created by `regionctl add`) must point at `<region tunnel id>.cfargotunnel.com`, not at the gen-serv tunnel. Correct its `content` with a `PATCH` to `dns_records/<id>` if needed.

## Verification

```bash
for host in discordy discordy-api discordy-gateway discordy-updates discordy-cdn; do
  printf '%-28s ' "$host"; curl -s -o /dev/null -w '%{http_code}\n' "https://$host.voics.nl/"
done
curl -s https://discordy-api.voics.nl/api/v1/voice/regions | jq
curl -s -o /dev/null -w '%{http_code}\n' https://discordy-admin.voics.nl/      # 302 to Access
curl -s -o /dev/null -w '%{http_code}\n' https://voics.nl/                     # unchanged, still the other product
```

In the Cloudflare dashboard, go to Zero Trust → Networks → Tunnels. `discordy-gen-serv` must be **Healthy** and show **Locally managed**, with 2 connectors (the `cloudflared` replicas).

## Teardown

To remove Discordy from the zone:

1. Delete the `discordy*` DNS records.
2. Delete the Access apps `discordy-admin` and `discordy-headlamp`.
3. Delete the tunnels `discordy-*`.
4. Revoke the API token.

`voics.nl` is unaffected.
