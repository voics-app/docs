# OpenBao: auto-unseal, recovery, rekey

OpenBao stores every runtime secret at `kv/discordy/...` ([ADR-0006](../adr/0006-secrets-flow.md)). Since 2026-10-22 it **unseals itself** after every pod restart or node reboot with a static key ([ADR-0021](../adr/0021-openbao-auto-unseal.md)). While it is sealed (for example the seal key Secret is missing):

- External Secrets Operator cannot refresh Kubernetes Secrets. Existing Secrets keep working, so running pods are unaffected.
- `secrets-sync` fails.
- New ExternalSecrets stay pending.

| | |
|---|---|
| Seal | `seal "static"`: a 32-byte AES key (base64) from env `BAO_SEAL_KEY`, which comes from Secret `voics-system/openbao-seal-key` (key `key`). Created by `bootstrap/20-openbao.sh`, never in git. Owner copy in the key store as `<KEYSTORE_PREFIX> seal key` (`OpenBao seal key.dpapi`, `OpenBao dev seal key.dpapi`) |
| Recovery keys | The former Shamir shares, **5 shares, threshold 3**, same key store items (`OpenBao unseal key 1..5`; the name is historical). They no longer unseal. They are needed for `generate-root`, `rekey` and seal migrations |
| Where the keys live | `KEYSTORE=dpapi` (in use on gen-serv): DPAPI files in `%USERPROFILE%\.discordy\openbao\`. `KEYSTORE=op`: 1Password vault **Discordy** |
| Root token | Revoked after bootstrap. With recovery keys a new one can be minted ([below](#root-token)). For admin work use the `owner` userpass login (`owner-admin` policy) from `gitops/bootstrap/22-openbao-owner-admin.sh` |
| Kubernetes auth roles | `external-secrets` (ESO, read `kv/discordy/*`), `secrets-sync` (ARC runner, write `kv/discordy/*`) |
| Namespace / pod | `voics-system` / `openbao-0` (pebbledb storage, single replica) |
| Monitoring | CronJob `openbao-seal-check` (every 2 min) pushes `openbao_sealed` and `openbao_reachable` to VictoriaMetrics and posts to an optional webhook; the ops portal shows a live banner |
| Related | [Secret rotation](secret-rotation.md) · [Secrets inventory](../secrets/README.md) · [Backup and restore](backup-restore.md#openbao) |

## What to do when it is sealed

It should not happen after a restart. If `bao status` says `Sealed true` (or the portal banner or webhook says so):

```bash
kubectl -n voics-system exec openbao-0 -- bao status | grep -E 'Seal Type|Sealed'
kubectl -n voics-system get secret openbao-seal-key        # must exist
kubectl -n voics-system logs openbao-0 | tail -20          # seal errors show here
KUBECONFIG=~/.kube/discordy-gen-serv.yaml KUBECTL=kubectl KEYSTORE=dpapi bash bootstrap/20-openbao.sh
```

`20-openbao.sh` re-creates a missing `openbao-seal-key` Secret from the key store copy (the same key; a freshly generated key would not open the existing data) and waits for the auto-unseal. Then check `kubectl get clustersecretstore openbao` is `Valid` (restart `deploy/external-secrets` in `voics-system` if not), force ESO to resync and re-run any failed `secrets-sync`:

```bash
for es in $(kubectl get externalsecret -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  kubectl -n "${es%/*}" annotate externalsecret "${es#*/}" force-sync="$(date +%s)" --overwrite
done
kubectl get externalsecret -A    # all READY=True, STATUS=SecretSynced
```

In GitHub, `discordy-voics/gitops` -> Actions -> secrets-sync -> Re-run.

### Webhook alert (optional, one-time)

Create the Secret by hand (never in git) with a Discord or Slack-compatible incoming webhook URL. The CronJob then posts every 30 minutes while OpenBao is sealed or unreachable:

```bash
kubectl -n voics-system create secret generic openbao-alert --from-literal=WEBHOOK_URL='https://discord.com/api/webhooks/...'
```

Without it the failure is still visible: the portal banner, the failing `openbao-seal-check` Job and the `openbao_sealed` series in Grafana.

### Restart test (2026-10-22)

Production proof, run after the migration: `kubectl -n voics-system delete pod openbao-0`, then

```bash
kubectl -n voics-system exec openbao-0 -- bao status | grep -E 'Seal Type|Sealed'   # static / false, no human step
kubectl get clustersecretstore openbao                                                # Valid, Ready True
kubectl get externalsecret -A                                                         # all SecretSynced
```

Outcome on gen-serv (microk8s, OpenBao 2.7.1, 2026-10-22): the migration (`unseal -migrate` with 3 shares) completed and `bao status` shows `Seal Type static`, `Recovery Seal Type shamir`, 5 recovery shares, threshold 3. After `kubectl delete pod openbao-0` the new pod reported `Sealed false` within 8 seconds with no human step, `clustersecretstore/openbao` stayed `Valid` (`Ready True`) and every ExternalSecret was `SecretSynced`. The seal key Secret and the data PVC both survive a node reboot, so a reboot behaves like this pod restart (the VM itself was not rebooted for the test).

### Seal migration (Shamir to static), as done on gen-serv

1. Back up the data directory: scale `sts/openbao` to 0, tar the PVC from a helper pod, scale back up (store the tar on the owner PC, not next to the seal key). The pebbledb storage has no `raft snapshot`.
2. Create the Secret `openbao-seal-key` (`bootstrap/20-openbao.sh` does it).
3. Deploy the Helm values with `seal "static"`; the pod restarts and reports `migration=true`.
4. Run `bootstrap/20-openbao.sh`: it applies 3 shares with `bao operator unseal -migrate`. The shares are now recovery keys.
5. Restart the pod and confirm it unseals alone.

### Rotating the seal key

Generate a new key, set `current_key_id`/`current_key` to it and `previous_key_id`/`previous_key` to the old one in `infrastructure/controllers/openbao/helmrelease.yaml` (the old key from a second Secret env var), restart, confirm unsealed, then drop the previous key in a later release. Store the new key in the key store.

## Seal fallback: Shamir

`SEAL_MODE=shamir` (an override of `clusters/*/env.conf`, not the default) bootstraps a manual Shamir cluster. Unseal it with `SEAL_MODE=shamir bash bootstrap/20-openbao.sh`.

## First-time bootstrap

The bring-up is scripted in gitops. Do not run these steps by hand. Read `gitops/bootstrap/README.md` first, then run the scripts in `gitops/bootstrap/` in this order:

1. `00-inventory.sh`: read-only check for conflicts.
2. `10-prepare-node.sh`: on the VM.
3. `30-flux.sh`: installs Flux, which deploys OpenBao.
4. `20-openbao.sh`: initialises and configures OpenBao. Run it once OpenBao's pod is running. It also runs again after every reboot, where it only unseals.
5. `40-cloudflare.sh` and `50-public-ip.sh`.
6. `60-verify.sh`: read-only checks.

`20-openbao.sh` does the following. Use this list to check its result, not to run the steps by hand:

- Creates the static seal key Secret (`openbao-seal-key`, copy in the key store), then initialises OpenBao with 5 recovery shares and threshold 3. It stores all shares and the root token in the key store; OpenBao unseals itself.
- Enables KV v2 at `kv/`.
- Enables Kubernetes auth with two roles. `external-secrets` gets read access, bound to the `external-secrets` service account. `secrets-sync` gets write access, bound to the `discordy-runner` service account in `voics-system`.
- Enables the file audit device.
- Seeds `kv/discordy/arc` from `ARC_GITHUB_TOKEN`. This is the chicken-and-egg step: `secrets-sync` runs on the ARC runners, so the first ARC credential cannot come from GitHub.
- Revokes the root token.

Then:

1. Run the `secrets-sync` workflow once. It needs the GitHub secrets listed in the [inventory](../secrets/README.md).
2. Check that every ExternalSecret reaches `SecretSynced`. `60-verify.sh` runs this check.
3. Take the first Raft snapshot ([backup-restore → OpenBao](backup-restore.md#openbao)).

**Policies.** The bootstrap writes these read policies. They match the paths in the inventory:

```hcl
path "kv/data/discordy/*"     { capabilities = ["read"] }
path "kv/metadata/discordy/*" { capabilities = ["read", "list"] }
```

```hcl
path "kv/data/discordy/*"     { capabilities = ["create", "update", "read"] }
path "kv/metadata/discordy/*" { capabilities = ["read", "list"] }
```

**Standalone voice regions** each get their own Kubernetes auth mount, bound to a read-only `discordy-voice-read` policy. That policy may read only `kv/data/discordy/shared` and `kv/data/discordy/ghcr`, plus the region's own path. Create the mount by hand, with the same pattern:

```bash
bao auth enable -path=k8s-<region> kubernetes
bao write auth/k8s-<region>/config kubernetes_host=<region API URL> kubernetes_ca_cert=@ca.crt token_reviewer_jwt=@reviewer.jwt
bao write auth/k8s-<region>/role/external-secrets \
  bound_service_account_names=external-secrets bound_service_account_namespaces=voics-system \
  policies=discordy-voice-read ttl=1h
```

## Root token

The root token is revoked after bootstrap. With the static seal the recovery keys authorise `generate-root`. To get a new one for administrative work:

```bash
kubectl -n voics-system exec -it openbao-0 -- sh
bao operator generate-root -init            # prints a nonce and an OTP; keep the OTP
bao operator generate-root -nonce=<nonce>   # repeat with 3 different recovery keys (from the key store)
bao operator generate-root -decode=<encoded token> -otp=<otp>
```

Use the token, then `bao token revoke <token>`, and update the 1Password item's note with the date and the reason.

## Rekeying

Rekey the recovery shares when any share may be exposed, when a key holder changes, or once a year:

```bash
kubectl -n voics-system exec -it openbao-0 -- sh
bao operator rekey -init -key-shares=5 -key-threshold=3 -format=json
# supply 3 current recovery keys:
bao operator rekey -nonce=<nonce> -   # x3
```

The output contains five new shares. Replace the five key store items **immediately**. Recovery keys no longer unseal, so prove the new shares with a `bao operator generate-root -init` followed by `-cancel`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `bao status` reports `connection refused` | The pod isn't running. Check `kubectl -n voics-system describe pod openbao-0` and the PVC binding. |
| Sealed after a restart, log says `error unsealing` | The Secret `openbao-seal-key` is missing or holds a different key. Re-run `bootstrap/20-openbao.sh` (restores it from the key store copy). |
| Recovery progress resets | Shares from different key generations were mixed after a rekey. Use only the current key store items. |
| `permission denied` for ESO after unseal | The Kubernetes auth config is stale after a cluster CA change. Re-run `bao write auth/kubernetes/config ...`. |
| `secrets-sync` cannot log in | The `secrets-sync` role is bound to the `discordy-runner` service account. Check that the runner pods use that account. |
| Raft data lost | Restore from a snapshot ([backup-restore → OpenBao](backup-restore.md#openbao)), then use the seal key and recovery keys that were current **when the snapshot was taken**. |
