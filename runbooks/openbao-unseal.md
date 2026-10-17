# OpenBao: unseal, bootstrap, rekey

OpenBao stores every runtime secret at `kv/discordy/...` ([ADR-0006](../adr/0006-secrets-flow.md)). It starts **sealed** after every pod restart or node reboot, and while it is sealed:

- External Secrets Operator cannot refresh Kubernetes Secrets. Existing Secrets keep working, so running pods are unaffected.
- `secrets-sync` fails.
- New ExternalSecrets stay pending.

| | |
|---|---|
| Unseal scheme | Shamir, **5 key shares, threshold 3** |
| Where the keys live | 1Password, vault **Discordy**, items `OpenBao unseal key 1` … `OpenBao unseal key 5`, and nowhere else |
| Root token | 1Password item `OpenBao root token`. Revoked after use; regenerate as needed. |
| Namespace / pod | `voics-system` / `openbao-0` (Raft storage, single replica) |
| Related | [Secret rotation](secret-rotation.md) · [Secrets inventory](../secrets/README.md) · [Backup and restore](backup-restore.md#openbao) |

## Routine unseal

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

This is done once, in WS9 bring-up (master plan task 9.3 step 4), after Flux has deployed the OpenBao chart.

```bash
# 1. Initialise: prints 5 unseal keys and the initial root token
kubectl -n voics-system exec openbao-0 -- bao operator init -key-shares=5 -key-threshold=3 -format=json > /dev/shm/bao-init.json

# 2. Store each value in 1Password immediately, then shred the file
for i in 0 1 2 3 4; do
  op item create --vault Discordy --category password --title "OpenBao unseal key $((i+1))" \
    "password=$(jq -r ".unseal_keys_b64[$i]" /dev/shm/bao-init.json)"
done
op item create --vault Discordy --category password --title "OpenBao root token" \
  "password=$(jq -r .root_token /dev/shm/bao-init.json)"
shred -u /dev/shm/bao-init.json

# 3. Unseal (routine procedure above), then log in with the root token
kubectl -n voics-system exec -it openbao-0 -- sh
export BAO_TOKEN=<root token from 1Password>

# 4. KV v2 at kv/
bao secrets enable -path=kv kv-v2

# 5. Kubernetes auth for ESO (read) and secrets-sync (write)
bao auth enable kubernetes
bao write auth/kubernetes/config kubernetes_host="https://kubernetes.default.svc:443"

bao policy write discordy-eso-read - <<'EOF'
path "kv/data/discordy/*"     { capabilities = ["read"] }
path "kv/metadata/discordy/*" { capabilities = ["read", "list"] }
EOF
bao policy write discordy-secrets-sync - <<'EOF'
path "kv/data/discordy/*"     { capabilities = ["create", "update", "read"] }
path "kv/metadata/discordy/*" { capabilities = ["read", "list"] }
EOF
bao policy write discordy-voice-read - <<'EOF'
path "kv/data/discordy/common"       { capabilities = ["read"] }
path "kv/data/discordy/voice"        { capabilities = ["read"] }
path "kv/data/discordy/platform/ghcr" { capabilities = ["read"] }
path "kv/data/discordy/regions/*"    { capabilities = ["read"] }
EOF

bao write auth/kubernetes/role/external-secrets \
  bound_service_account_names=external-secrets bound_service_account_namespaces=voics-system \
  policies=discordy-eso-read ttl=1h
bao write auth/kubernetes/role/secrets-sync \
  bound_service_account_names=arc-runner-discordy bound_service_account_namespaces=voics-system \
  policies=discordy-secrets-sync ttl=15m

# 6. Chicken-and-egg: ARC needs its GitHub credentials before secrets-sync can run on it.
#    Write them by hand once; secrets-sync owns them afterwards.
bao kv put kv/discordy/arc \
  github_app_id=<id> github_app_installation_id=<id> github_app_private_key=@/dev/shm/arc-app.pem
shred -u /dev/shm/arc-app.pem

# 7. Enable the audit log
bao audit enable file file_path=/openbao/audit/audit.log

# 8. Revoke the root token (regenerate later when needed; see below)
bao token revoke -self
```

Then:

1. Run the `secrets-sync` workflow once.
2. Check that every ExternalSecret reaches `SecretSynced`.
3. Take the first Raft snapshot ([backup-restore → OpenBao](backup-restore.md#openbao)).

**Standalone voice regions** each get their own Kubernetes auth mount, bound to `discordy-voice-read`:

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
| Raft data lost | Restore from a snapshot ([backup-restore → OpenBao](backup-restore.md#openbao)), then unseal with the keys that were current **when the snapshot was taken**. |
