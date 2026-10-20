# OpenBao: unseal, bootstrap, rekey

OpenBao stores every runtime secret at `kv/discordy/...` ([ADR-0006](../adr/0006-secrets-flow.md)). It starts **sealed** after every pod restart or node reboot, and while it is sealed:

- External Secrets Operator cannot refresh Kubernetes Secrets. Existing Secrets keep working, so running pods are unaffected.
- `secrets-sync` fails.
- New ExternalSecrets stay pending.

| | |
|---|---|
| Unseal scheme | Shamir, **5 key shares, threshold 3** |
| Where the keys live | The key store chosen by `bootstrap/20-openbao.sh`: **`KEYSTORE=dpapi`** (in use on gen-serv) keeps them as DPAPI files in `%USERPROFILE%\.discordy\openbao\` on the owner's Windows account (`OpenBao unseal key 1..5.dpapi`, `OpenBao root token.dpapi`); `KEYSTORE=op` keeps them in 1Password vault **Discordy** |
| Root token | Same key store, but **revoked** after the first bootstrap. OpenBao 2.x refuses unauthenticated `generate-root`, so a new root token can't be minted without an existing privileged token. Prefer Kubernetes RBAC or new auth roles applied while a token exists; plan an admin policy/token for maintenance (docs#10). |
| Kubernetes auth roles | `external-secrets` (ESO, read `kv/discordy/*`), `secrets-sync` (ARC runner, write `kv/discordy/*`) |
| Namespace / pod | `voics-system` / `openbao-0` (Raft storage, single replica) |
| Related | [Secret rotation](secret-rotation.md) · [Secrets inventory](../secrets/README.md) · [Backup and restore](backup-restore.md#openbao) |

## Routine unseal

**Quick path (after every node reboot or `microk8s` restart):** from a gitops checkout on the owner's PC run

```bash
KUBECONFIG=~/.kube/discordy-gen-serv.yaml KUBECTL=kubectl KEYSTORE=dpapi bash bootstrap/20-openbao.sh
```

It waits for `openbao-0`, applies 3 key shares from the key store and prints `OpenBao unsealed`. If it says `cannot reach OpenBao`, the pod is still restarting; run it again a minute later. Then check `kubectl get clustersecretstore openbao` is `Valid` (restart `deploy/external-secrets` in `voics-system` if not). The manual steps below do the same by hand.

### 1. Confirm it is sealed

```bash
kubectl -n voics-system exec openbao-0 -- bao status
# Sealed: true   Unseal Progress: 0/3
```

Other signs of a sealed OpenBao:

- The `ClusterSecretStore` reports `SecretStoreNotReady`. Check with `kubectl get clustersecretstore openbao -o jsonpath='{.status.conditions[0].message}'`.
- The alert `OpenBaoSealed` fires.

### 2. Supply 3 of the 5 key shares

Read the keys straight from 1Password into the command, so they never touch disk or shell history:

```bash
op signin
for i in 1 2 3; do
  kubectl -n voics-system exec -i openbao-0 -- bao operator unseal - \
    <<< "$(op read "op://Discordy/OpenBao unseal key $i/password")"
done
```

If one share is unavailable, use any other three, for example 2, 4 and 5.

### 3. Verify

```bash
kubectl -n voics-system exec openbao-0 -- bao status | grep -E 'Sealed|HA Mode'
# Sealed: false
kubectl get clustersecretstore openbao -o jsonpath='{.status.conditions[0].status}'   # True
```

### 4. Force ESO to resync

ESO otherwise waits for the next refresh interval:

```bash
for es in $(kubectl get externalsecret -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}'); do
  kubectl -n "${es%/*}" annotate externalsecret "${es#*/}" force-sync="$(date +%s)" --overwrite
done
kubectl get externalsecret -A    # all READY=True, STATUS=SecretSynced
```

### 5. Re-run any failed `secrets-sync`

In GitHub, go to `discordy-voics/gitops` → Actions → secrets-sync → Re-run.

> **Why no auto-unseal?** Auto-unseal needs a cloud KMS or an HSM, or a transit seal on another OpenBao, and none of these is available on a single home VM. Manual Shamir unseal is the deliberate trade-off. Reboots of gen-serv are therefore planned events: unseal right after each one.

## First-time bootstrap

The bring-up is scripted in gitops. Do not run these steps by hand. Read `gitops/bootstrap/README.md` first, then run the scripts in `gitops/bootstrap/` in this order:

1. `00-inventory.sh`: read-only check for conflicts.
2. `10-prepare-node.sh`: on the VM.
3. `30-flux.sh`: installs Flux, which deploys OpenBao.
4. `20-openbao.sh`: initialises and configures OpenBao. Run it once OpenBao's pod is running. It also runs again after every reboot, where it only unseals.
5. `40-cloudflare.sh` and `50-public-ip.sh`.
6. `60-verify.sh`: read-only checks.

`20-openbao.sh` does the following. Use this list to check its result, not to run the steps by hand:

- Initialises OpenBao with 5 shares and threshold 3. It stores all shares and the root token in 1Password, then unseals.
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

The root token is revoked after bootstrap. To get a new one for administrative work:

```bash
kubectl -n voics-system exec -it openbao-0 -- sh
bao operator generate-root -init            # prints a nonce and an OTP; keep the OTP
bao operator generate-root -nonce=<nonce>   # repeat with 3 different unseal keys (paste from op)
bao operator generate-root -decode=<encoded token> -otp=<otp>
```

Use the token, then `bao token revoke <token>`, and update the 1Password item's note with the date and the reason.

## Rekeying

Rekey when any unseal share may be exposed, when a key holder changes, or once a year:

```bash
kubectl -n voics-system exec -it openbao-0 -- sh
bao operator rekey -init -key-shares=5 -key-threshold=3 -format=json
# supply 3 current unseal keys:
bao operator rekey -nonce=<nonce> -   # x3
```

The output contains five new shares. Replace the five 1Password items **immediately**. Then perform a test seal and unseal, during a quiet window, to prove the new shares work:

```bash
bao operator seal
# routine unseal with the new keys
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `bao status` reports `connection refused` | The pod isn't running. Check `kubectl -n voics-system describe pod openbao-0` and the PVC binding. |
| Unseal progress resets | Shares from different key generations were mixed after a rekey. Use only the current 1Password items. |
| `permission denied` for ESO after unseal | The Kubernetes auth config is stale after a cluster CA change. Re-run `bao write auth/kubernetes/config ...`. |
| `secrets-sync` cannot log in | The `secrets-sync` role is bound to the `discordy-runner` service account. Check that the runner pods use that account. |
| Raft data lost | Restore from a snapshot ([backup-restore → OpenBao](backup-restore.md#openbao)), then unseal with the keys that were current **when the snapshot was taken**. |
