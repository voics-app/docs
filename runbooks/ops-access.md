# Ops access: landing page, support tools, IP lock and credentials

The ops portal is one page, `https://discordy-ops.voics.nl`, that links every support tool. Each tool sits on its own `discordy-*` hostname and accepts requests only from the owner's public IP (`OPS_ALLOWED_CIDRS` in `cluster-config`, currently `31.201.234.101/32`). Any other client gets **403** from ingress-nginx.

There is no Elasticsearch. Search is deferred ([ADR-0012](../adr/0012-search-deferred.md), [ADR-0013](../adr/0013-search-index-topology.md)). The Scylla CQL viewer was not built.

## Tools

| Tool | URL | Login | Notes |
|---|---|---|---|
| Ops portal | https://discordy-ops.voics.nl | none (IP lock) | Static page in `voics-system`, ConfigMap `ops-portal-html` |
| Headlamp (Kubernetes UI: pods, logs, events) | https://discordy-headlamp.voics.nl | Cloudflare Access (owner email), then a token | Read-only `view` role via ServiceAccount `headlamp-admin` |
| pgweb (database `discordy`) | https://discordy-db.voics.nl | none (IP lock) | Connects as `discordy_ops_ro`: SELECT only, `--readonly` |
| MinIO console | https://discordy-minio.voics.nl | MinIO root access key and secret | Values are `discordy/minio` in OpenBao (see below) |
| Redpanda Console | https://discordy-redpanda.voics.nl | none (IP lock) | The image's login needs enterprise RBAC, so it is not enabled |
| Grafana | https://discordy-grafana.voics.nl | `admin` and the Grafana admin password | Password in `grafana-admin.dpapi` |
| OpenBao UI | https://discordy-openbao.voics.nl | Token method, root token | Maintenance only, see [openbao-unseal.md](openbao-unseal.md) |

## Reading a credential from DPAPI

The owner's DPAPI files are readable only by the same Windows user on this PC. Print nothing to the terminal you share. Copy the value with `Set-Clipboard` or pipe it into the tool:

```powershell
# Reads %USERPROFILE%\.discordy\ops\pgweb.dpapi and copies its value to the clipboard.
[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Get-Content "$env:USERPROFILE\.discordy\ops\pgweb.dpapi" | ConvertTo-SecureString))) | Set-Clipboard
```

Files, all under `%USERPROFILE%\.discordy\`:

| File | Holds |
|---|---|
| `ops\pgweb.dpapi` | Password of the read-only DB role `discordy_ops_ro` (OpenBao `kv/discordy/ops/pgweb`, key `PASSWORD`) |
| `grafana-admin.dpapi` | Grafana `admin` password (OpenBao `kv/discordy/grafana`) |
| `openbao\OpenBao root token.dpapi` | OpenBao root token |

## Headlamp token

Headlamp asks for a bearer token after the Cloudflare Access email check. Create a short-lived token on the cluster:

```bash
export KUBECONFIG=~/.kube/discordy-gen-serv.yaml
kubectl -n voics-system create token headlamp-admin --duration=8h
```

The token's role is `view` (pods, logs, events; no Secrets, no writes). To change it, edit `infrastructure/controllers/headlamp/serviceaccount.yaml` in `gitops`.

## Credentials that are generated and stored

The pgweb password is generated, then stored in three places: OpenBao `kv/discordy/ops/pgweb` (through the GitHub org secret `OPS_PGWEB_PASSWORD` and `secrets-sync`), the CloudNativePG role `discordy_ops_ro` (through External Secrets), and the owner's DPAPI file `%USERPROFILE%\.discordy\ops\pgweb.dpapi`. Never commit a value; the inventory (`gitops/secrets/inventory.yaml`) lists only key names.

To rotate the pgweb password:

1. Generate a new value and update the GitHub org secret `OPS_PGWEB_PASSWORD` (`gh secret set OPS_PGWEB_PASSWORD --org discordy-voics --visibility all`).
2. Run the `secrets-sync` workflow with `paths: discordy/ops/pgweb`.
3. Overwrite `%USERPROFILE%\.discordy\ops\pgweb.dpapi` with the new value, as `ConvertFrom-SecureString` output.
4. Wait for the ExternalSecrets to refresh (1h), or force one with `kubectl -n voics-data annotate externalsecret postgres-ops-readonly,pgweb-connection force-sync=$(date +%s) --overwrite`.

## Change the allowed IP

1. In `gitops`, edit `infrastructure/configs/cluster-config/cluster-config.yaml` and set `OPS_ALLOWED_CIDRS` (comma-separated CIDRs; for example `31.201.234.101/32,203.0.113.7/32`).
2. Merge to `develop`, then release to `main` with git-flow. Reconcile: `flux reconcile kustomization infra-controllers infra-data --with-source`.
3. Check from the new IP: `curl -sS -o /dev/null -w "%{http_code}\n" https://discordy-ops.voics.nl/` returns `200`. From any other IP it returns `403`.

Do not change `proxy-real-ip-cidr` (`10.1.0.0/16`, the pod network where cloudflared runs). If it is wrong, every visitor appears as the tunnel pod's address and the lock stops working.

## Verify the lock

From this PC (owner IP), expect `200`:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://discordy-ops.voics.nl/
```

Inside the cluster, prove that a spoofed `CF-Connecting-IP` is refused. The client pod is inside `10.1.0.0/16`, so ingress-nginx trusts the header it sends:

```bash
kubectl -n voics-system run lock-test --rm -i --restart=Never --image=curlimages/curl:8.10.1 -- \
  curl -sS -o /dev/null -w "%{http_code}\n" -H "Host: discordy-ops.voics.nl" -H "CF-Connecting-IP: 203.0.113.99" \
  http://discordy-ingress-nginx-controller.voics-system.svc.cluster.local/
# expect 403
```

## Adding a new ops hostname

1. Add `HOST_<NAME>: discordy-<name>.voics.nl` to `cluster-config`, and add the same hostname to the cloudflared ConfigMap (`infrastructure/controllers/cloudflared/cloudflared.yaml`).
2. Add an Ingress with `nginx.ingress.kubernetes.io/whitelist-source-range: ${OPS_ALLOWED_CIDRS}`.
3. Create the CNAME with `bootstrap/40-cloudflare.sh` (it only creates missing records and never touches an existing one) and link it from the portal (`infrastructure/controllers/ops-portal/index.html`).
