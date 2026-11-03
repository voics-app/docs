# 0023 — OpenBao transit seal against a second OpenBao

- Status: proposed
- Date: 2026-11-03
- Deciders: @oussamaelhajoui
- Technical story: [gitops#48](https://github.com/discordy-voics/gitops/issues/48)
- Related: [ADR 0021](0021-openbao-auto-unseal.md), [ADR 0006](0006-secrets-flow.md), [ADR 0008](0008-microk8s-reuse.md), [OpenBao unseal runbook](../runbooks/openbao-unseal.md), [gitops#20](https://github.com/discordy-voics/gitops/issues/20), [gitops#21](https://github.com/discordy-voics/gitops/issues/21)

## Context and Problem Statement

[ADR 0021](0021-openbao-auto-unseal.md) moved OpenBao from Shamir to a **static-key seal**: `seal "static"` reads a 32-byte key from the environment variable `BAO_SEAL_KEY`, which comes from the Kubernetes Secret `voics-system/openbao-seal-key`. This fixed the 13-hour sealed outage of 2026-10-22, because a restarted pod unseals itself.

The price is that the key sits next to the data. The Secret, the `openbao-data` volume (pebbledb) and the node disk all live on the same VM (`gen-serv`, 192.168.1.212). Anyone who can read Secrets in `voics-system`, the cluster datastore or the node disk can decrypt a copy of the data directory. The seal then protects only backups that are stored away from the key.

Question: when, and against what, should the key leave the cluster so that a stolen disk, a leaked backup or a read-only cluster compromise no longer yields the OpenBao data, without bringing back the manual unseal that ADR 0021 removed?

## Decision Drivers

- Unattended recovery after a pod or node restart (the reason for ADR 0021 stays).
- The seal key should not be readable from the cluster that holds the data.
- No recurring cost and no dependency on a cloud provider (the project runs on a homelab).
- A second component must not just move the "who unseals this" problem one level up, so it needs its own answer.
- Small footprint: the main OpenBao runs with a 96 Mi memory limit.
- The owner is the only operator, so recovery material must stay simple to hold.

## Considered Options

1. **(a) Keep the static key** (status quo of ADR 0021).
2. **(b) Transit seal** against a second OpenBao that runs outside the main cluster.
3. **(c) Cloud KMS** (AWS KMS, GCP Cloud KMS, Azure Key Vault).
4. **(d) Shamir with manual unseal.**

## Decision Outcome

**Proposed, not yet accepted.** Recommendation: keep **(a)** until a second always-on host that is not a node of the main cluster exists, then adopt **(b)** on that host. Do not run the seal OpenBao on the 3-node cluster itself (see "Where the seal OpenBao runs"). Reject (c) and (d).

Trigger for acceptance (any one of these):

- A second always-on machine exists that is independent of `gen-serv` and of the future cluster nodes (a small mini PC or Raspberry Pi class device, ideally on a UPS, or a second Proxmox host).
- The owner starts keeping data or backups where the static key's exposure matters, for example off-site `openbao-data` backups.
- The 3-node cluster lands and the owner wants the seal key outside it. This ADR then says: still not inside it.

Until then, option (a) stays and the residual risk is the one ADR 0021 already accepted.

### Where the seal OpenBao runs

| Location | Verdict | Why |
|---|---|---|
| A VM or LXC on the Proxmox host 192.168.1.88 | Acceptable stop-gap, weak | It is a different failure domain from the cluster VM, so a cluster-admin compromise does not reach the key. But it is the same physical host, disk and power. A host compromise or failure takes both. If `gen-serv` and the seal guest start together after a power cut, boot order matters (see failure modes). |
| Another physical machine (small always-on box) | **Recommended** | Separate power, disk and blast radius. It needs only about 256 MB of RAM and a few MB of storage. This is the owner decision in "What we need from the owner". |
| Inside the future 3-node cluster | **Not recommended** | The main OpenBao would depend on a second OpenBao on the same cluster and datastore. That is the cycle ADR 0021 warned about: if the whole cluster restarts, neither can start first. Cluster-admin could also still read the transit token. |
| Cloud-hosted instance | Rejected | See option (c). |

### Design of option (b)

**The seal OpenBao ("bao-seal").**

- A single-purpose OpenBao, not a general secret store. It holds one transit mount and one key, and nothing else.
- Runs as a systemd service (or a container) on the separate host, with the raft or file storage backend on local disk. It is not managed by Flux, because Flux runs in the cluster that must not depend on it. Its definition still lives in `gitops` under `infra/` (Terraform when it is a Proxmox guest, a bootstrap script and an `env.sh` stage when it is a bare host), so it is reproducible from git.
- **How it gets unsealed and stays up.** This is the hard part. Options in order of preference:
  1. A **static seal on bao-seal itself**, with the key in a root-only file on that host (mode 0400, owned by the service user). It auto-unseals on boot. The key is one machine away from the data it protects, and it exists only there on a running system. The gain is that the main cluster, its backups and its operators do not hold it. This is the ADR 0021 trade for a much smaller target.
  2. **A TPM-bound key** (systemd-creds) on the separate host. Same as 1, but bound to the machine's TPM. Needs hardware support; evaluate on the chosen box.
  3. **Shamir with manual unseal**, with the owner as the only unsealer. Stronger, but then the main OpenBao cannot unseal after a restart unless the owner has unsealed bao-seal first. Only worth it if the owner accepts the manual step after a power cut.

  Recommendation: option 1, or 2 if the box has a TPM. The recovery keys of bao-seal (from `operator init`) go in the owner key store, like the main instance.
- **HA.** A single instance is accepted at first, because a seal outage does not stop a running main OpenBao (see failure modes). If a third machine exists later, move to a 3-node raft; do not build that for the first version. A cheap partial answer is a cold standby: a restored snapshot plus the key on a second device.
- **Hardening.** The listener is on the LAN only, with a firewall allowing only the cluster node addresses on port 8200. No ingress, no Cloudflare hostname, an audit log on local disk. It is never exposed to the internet.

**The transit key and the token (least privilege).**

- One transit mount `transit/` with one key, `discordy-unseal`, type `aes256-gcm96`, `exportable=false`, `deletion_allowed=false`.
- Policy `discordy-seal` allows only these two operations on that one key:

  ```hcl
  path "transit/encrypt/discordy-unseal" { capabilities = ["update"] }
  path "transit/decrypt/discordy-unseal" { capabilities = ["update"] }
  ```

  It has no read, list, `keys/*`, `rotate`, `config` or `sys/*` capability. A leaked token can encrypt and decrypt under the one key, but cannot read it, rotate it or delete it.
- The main OpenBao authenticates with a **periodic, orphan** token that carries only that policy. The transit seal client renews it at runtime unless `disable_renewal` is set. A bootstrap script on the operator's PC creates the token and stores it in the owner key store. It reaches the cluster as the Kubernetes Secret `voics-system/openbao-transit-token`, injected as `BAO_TRANSIT_SEAL_TOKEN`. It never appears in git or Helm values.
- The limit of this model: the token is again a Secret in the cluster. A cluster-admin can read it and call decrypt on bao-seal **while bao-seal is reachable from the cluster**. What the transit seal buys is that the key itself never leaves bao-seal, that a stolen disk, a datastore snapshot or a backup is useless without network access to bao-seal, and that the token can be revoked centrally to cut off a compromised cluster. To narrow it further, bind the token to the node addresses with `token_bound_cidrs`, and keep the firewall rule on the seal host.

**TLS between the two.**

- bao-seal serves TLS with a certificate from a small private CA. The main OpenBao's seal stanza sets `tls_ca_cert` (mounted from a ConfigMap) and `tls_server_name`. `tls_skip_verify` is never used.
- Use a leaf certificate valid for one year with an expiry alert, rather than an ACME flow that would need internet and DNS for a LAN-only service. Mutual TLS (`tls_client_cert`, `tls_client_key`) can be added later; it is not needed for the first version because the token already authenticates the client.

**The seal stanza on the main OpenBao** replaces the static one:

```hcl
seal "transit" {
  address         = "https://bao-seal.lan:8200"
  mount_path      = "transit/"
  key_name        = "discordy-unseal"
  tls_ca_cert     = "/openbao/userconfig/seal-ca/ca.crt"
  tls_server_name = "bao-seal.lan"
  # the token comes from BAO_TRANSIT_SEAL_TOKEN
}
```

### Failure modes

| Event | Result | Action |
|---|---|---|
| bao-seal is down, main OpenBao is running and unsealed | Nothing changes. An unsealed instance holds the root key in memory and does not call transit per request. External Secrets keeps working. | The new alert fires (see monitoring). Fix bao-seal. |
| bao-seal is down and the main pod or node restarts | The main OpenBao cannot unseal and stays sealed. External Secrets cannot refresh and `OpenBaoSealed` fires. Applications already running keep their synced Kubernetes Secrets. | Restore bao-seal. Main unseals on its next retry, with no owner action. The impact matches the 2026-10-22 outage, which is why bao-seal availability matters. |
| Power cut, both come back | Main may start before bao-seal and wait. | It retries until bao-seal answers. Prefer starting bao-seal first, and verify in the restart test. |
| bao-seal data lost with no backup | Main can never be unsealed again after a restart, because the key was inside bao-seal. | If main is still running, migrate back to the static seal at once (see rollback). Otherwise restore from backup. Treat this as the worst case. |
| Token expired, revoked or CIDR mismatch | Same as bao-seal down for the next restart. A running main is unaffected. | Re-issue the token with bootstrap and update the Secret. |
| TLS certificate expired | Same as bao-seal down. | Alert at 30 days, then renew. |
| Network partition between node and bao-seal | Same as bao-seal down. | Check the LAN, the firewall and `address`. |

Because a seal outage only bites on a restart, the risk window is "bao-seal down at the same time as a main restart". The monitoring below shortens the time bao-seal can be down unnoticed.

### Monitoring and alerts

- Extend the `openbao-seal-check` CronJob (`infrastructure/controllers/openbao/seal-check.yaml` in gitops) with `openbao_seal_backend_reachable` and `openbao_seal_backend_sealed`, from an HTTP GET of `https://bao-seal.lan:8200/v1/sys/health` made inside the cluster. They are pushed to VictoriaMetrics next to `openbao_sealed` and `openbao_reachable`.
- New rules in `infrastructure/controllers/alerting/rules.yml`:
  - `OpenBaoSealBackendDown`: unreachable or sealed for 5 minutes, severity **critical**, because it is the failure that turns a restart into an outage.
  - `OpenBaoSealCertExpiring`: the TLS certificate expires in under 30 days, severity warning.
  - `OpenBaoSealTokenExpiring`: the token TTL is below a third of its period, severity warning.
- The existing `OpenBaoSealed` and `OpenBaoCheckMissing` rules stay. Add the seal backend to the seal-state card of the ops portal.
- Because the cluster monitors bao-seal, a whole-cluster outage hides a bao-seal outage. Add a dead-man check from outside the cluster; the ops-alerts relay already reaches the owner.

### Backup of the transit key

The key lives only inside bao-seal. With `exportable=false` and no plaintext backup it cannot be copied out, which is good for security and bad for recovery. So the backup works at the level of bao-seal's storage:

- A scheduled `bao operator raft snapshot save` (or a copy of the file backend directory) of bao-seal, encrypted with `age` or `gpg` to a key the owner holds. Store it somewhere owner-controlled that is **neither** the seal host **nor** the main cluster's backup bucket. A snapshot restores only into an unsealed bao-seal, so it is useless without bao-seal's own unseal material.
- bao-seal's unseal key (or its recovery keys) goes in the owner key store as a separate item, next to the existing `<KEYSTORE_PREFIX> seal key` and recovery keys.
- Optional owner decision: create the key once with `allow_plaintext_backup=true`, run `transit/backup/discordy-unseal`, store the output offline in the key store, then leave it. This gives a restorable key even if the snapshot is lost. The cost is that anyone with `backup` permission (not in the seal policy) could export it. Not recommended unless the owner wants it.
- A restore test is part of Definition of Done: restore the snapshot into a scratch bao-seal and unseal a copy of the main data directory from it.

### Rotation

- **Transit key.** `bao write -f transit/keys/discordy-unseal/rotate` adds a new key version. New wraps use the latest version and old versions stay available for decrypt, so no restart is needed. Do not raise `min_decryption_version` until the main root key has been re-wrapped with the new version (verify first). Rotate yearly and after any suspected token exposure.
- **Token.** The periodic token renews itself. To rotate, issue a new token with the same policy, update the Secret, restart the main pod, and revoke the old token. Yearly, or on exposure.
- **TLS.** Replace the leaf and the ConfigMap, then restart main. Yearly.
- **bao-seal's own seal key** (option 1 above): rotate with the same `previous_key` procedure as in the ADR 0021 runbook.

## Migration procedure (static seal to transit seal)

Runs only after acceptance, in a maintenance window with the owner at the PC, and only after a full rehearsal on the dev environment (`SEAL_MODE=transit` on the dev overlay).

Prerequisites: bao-seal is installed, unsealed and backed up. The transit key, policy and token exist. The owner has the main **recovery keys** and the **static seal key** from the key store. A copy of main's data exists, taken from a volume snapshot or from `/openbao/data` while the pod is stopped (pebbledb has no raft snapshot).

1. **Verify.** `bao status` on main shows `Seal Type: static`, `Sealed: false`. From a debug pod in the cluster, confirm bao-seal answers over TLS with the CA and the token: encrypt a test value and decrypt it. Confirm the token has only the two capabilities.
2. **Create the Secret** `voics-system/openbao-transit-token` and the CA ConfigMap. They do not affect the running server.
3. **Back up** the main data and check the key store items (seal key, recovery keys). Note the static key id (`discordy-1`).
4. **Change the seal stanzas** in `infrastructure/controllers/openbao/helmrelease.yaml` through a PR, so Flux applies it. Keep the static stanza and mark it disabled, then add the transit one:

   ```hcl
   seal "static" {
     current_key_id = "discordy-1"
     current_key    = "env://BAO_SEAL_KEY"
     disabled       = "true"
   }

   seal "transit" {
     address         = "https://bao-seal.lan:8200"
     mount_path      = "transit/"
     key_name        = "discordy-unseal"
     tls_ca_cert     = "/openbao/userconfig/seal-ca/ca.crt"
     tls_server_name = "bao-seal.lan"
   }
   ```

   `BAO_SEAL_KEY` must still be set at this step, so the old seal can be read.
5. **Restart** `openbao-0` by deleting the pod. It comes up sealed and reports that a migration is in progress. This is expected.
6. **Migrate.** Run `bao operator unseal -migrate` three times, each time with one of the Shamir recovery keys from ADR 0021, entered interactively and never as a command argument. At the threshold the root key is re-wrapped by the transit key and the server unseals.
7. **Verify.** `bao status` shows `Seal Type: transit`, `Sealed: false`. The `ClusterSecretStore` is `Valid`, a forced ExternalSecret refresh succeeds, and the `openbao-seal-check` job reports unsealed.
8. **Restart test.** Delete `openbao-0` again. It must return unsealed without owner action. Repeat once with bao-seal stopped to confirm it stays sealed and the alert fires, then start bao-seal and watch it unseal. Record both results in the runbook.
9. **Remove the old seal.** In a second PR, delete the disabled static stanza and the `BAO_SEAL_KEY` entry. Keep the `openbao-seal-key` Secret and the key store item for one release cycle so rollback stays possible, then retire them.
10. **Close out.** Update the docs and automation (Definition of Done below), set this ADR to accepted, and only then mark ADR 0021 as superseded.

Check the exact stanza options (`disabled`, migration behaviour) against the installed chart version (`openbao` 0.30.4) on dev first, because seal handling differs between OpenBao releases.

### Rollback

Rollback mirrors the migration and works as long as the static key is still held and bao-seal still answers.

1. Re-add the static stanza as the active seal, mark the transit stanza `disabled = "true"`, and keep both `BAO_SEAL_KEY` and the transit token in the environment.
2. Restart `openbao-0` and run `bao operator unseal -migrate` with the recovery keys. The root key is re-wrapped with the static key.
3. Verify `Seal Type: static`, run the restart test, then remove the transit stanza.

If the migration fails halfway and the server stays sealed in migration mode, revert the Git change. Until the unseal threshold is met the data is still wrapped by the static seal, so the old config reads it as before.

Migrating back needs bao-seal, because the current wrapping is the transit one. If bao-seal is gone for good, the only path is restoring it from its snapshot. This is why the backup and its restore test come before the migration, not after.

## Interaction with the cluster plan

[gitops#20](https://github.com/discordy-voics/gitops/issues/20) moved the datastore to etcd. [gitops#21](https://github.com/discordy-voics/gitops/issues/21) plans three nodes, with OpenBao as raft with 3 peers. Effects on this decision:

- The 3-node cluster gives HA to the **main** OpenBao, so losing one node no longer seals it. It does not fix the "key next to the data" problem, because all peers share the same seal Secret.
- With raft peers, every peer needs the seal. A transit seal then has one key and one token Secret for all peers, and bao-seal becomes a dependency of every peer's restart.
- The 3-node cluster does not provide the independent second host. It may host a **dev or test** bao-seal, but not the production one.
- If gitops#21 picks replicated storage for the OpenBao volume, check that step 3 of the migration (a volume copy) still applies.

## Consequences

If accepted and implemented:

- Good: the seal key is not readable from the cluster, its Secrets, its datastore snapshots or the VM disk. A stolen disk or a leaked `openbao-data` backup is useless without the seal host.
- Good: the token can be revoked centrally, and it can do two operations on one key.
- Good: unattended recovery after a restart is kept while the seal host is up.
- Bad: a second always-on host (hardware, power, patching) and a component to monitor.
- Bad: a new failure mode. Main cannot unseal after a restart while bao-seal is down. The 2026-10-22 outage is the template, now triggered by another machine.
- Bad: a second OpenBao to unseal, back up and rotate. Its own seal is a static key on a machine the owner physically controls.
- Bad: the token is still a cluster Secret. The gain is key separation and revocation, not protection against a live cluster-admin who can reach bao-seal.
- Disaster recovery needs one more set of owner-held items (bao-seal unseal material and its snapshot), on top of the recovery keys.

If not accepted (keep (a)): nothing changes, and the trade-offs of ADR 0021 stay in force.

### Confirmation

- `SEAL_MODE` (`static` or `transit`) is read by `bootstrap/20-openbao.sh` and checked by `bootstrap/60-verify.sh` against `bao status`.
- A restart test and a seal-down test are recorded in the runbook after the migration.
- The alert rules pass the gitops validator, and a manual fire test (stop bao-seal on dev) proves them.

## Pros and Cons of the Options

### (a) Keep the static key

- Good: works today, needs no extra host, adds no failure mode, costs nothing.
- Good: recovery after a restart depends on no other machine.
- Bad: the key sits in a Secret next to the data. Cluster-admin, a datastore snapshot or the VM disk reveal it.
- Bad: no central revocation.

### (b) Transit seal against a second OpenBao

- Good: the key stays outside the cluster, so a disk or backup theft is not enough.
- Good: no cloud and no cost beyond a small host, using a tool the project already runs.
- Good: a least-privilege token, central revocation, and a rotation path that needs no restart.
- Bad: needs a second always-on machine, which does not exist today. It must itself be unsealed and kept up.
- Bad: a new outage mode, extra monitoring, and a backup and restore test for bao-seal.
- Bad: the migration needs recovery keys, a maintenance window and a rehearsed rollback.

### (c) Cloud KMS

- Good: managed, highly available, and the key never touches the cluster.
- Bad: the platform core is self-hosted (Cloudflare is used only for ingress, ADR 0005), and ADR 0021 already rejected this on cost and the internet dependency.
- Bad: it needs a credential on the node that is as sensitive as the static key, and internet access at every unseal. A home internet outage would turn a reboot into a sealed OpenBao.
- Bad: a recurring cost, and a third party at the root of the secret store.
- **Rejected.** It does not fit the self-hosted constraint and does not remove the node-held credential.

### (d) Shamir with manual unseal

- Good: the strongest separation, with no key on any node.
- Bad: every pod or node restart leaves OpenBao sealed until the owner unseals it. This caused the 13-hour outage that ADR 0021 fixed.
- Bad: not acceptable for one owner without on-call staff.
- **Rejected.** It stays as the fallback during recovery, because the recovery keys keep their role.

## What we need from the owner

1. **A hardware decision.** One of: a small always-on machine (mini PC or Raspberry Pi class, on a UPS if possible); a VM or LXC on the Proxmox host 192.168.1.88 as a stop-gap, accepting that it shares the physical host; or "not yet", which keeps (a).
2. **How bao-seal unseals:** a static key in a root-only file (recommended), a TPM-bound key, or manual Shamir. This decides whether a power cut needs the owner.
3. **Whether to allow a one-time plaintext backup** of the transit key (default no).
4. **Where the encrypted bao-seal snapshots go.** An owner-controlled place that is neither the seal host nor the main backup bucket.
5. **A maintenance window** for the migration, with the owner at the PC.

## Effort and Definition of Done (if accepted)

Rough size: small and bounded. The bao-seal host and its bootstrap are the larger part, the Flux and alert changes are smaller, and the migration is one maintenance window after a dev rehearsal. It grows if the owner picks a 3-node raft for bao-seal.

Definition of Done, following the rule that nothing is changed by hand:

- **Terraform** (`infra/terraform`): the VM or LXC for bao-seal when it is a Proxmox guest (dev and production), or a documented manual host when it is a separate machine. A firewall rule from the node addresses to port 8200.
- **Bootstrap and `env.sh`:** a new stage that installs and initialises bao-seal, creates the mount, key, policy and periodic token, and writes the token to the key store. `SEAL_MODE=transit` support in `bootstrap/20-openbao.sh` (the default stays `static` until acceptance), the Secret and CA ConfigMap, the migration step, the `bootstrap/60-verify.sh` checks, and a `bootstrap/README.md` section.
- **Flux, cluster-config and overlays:** the seal stanzas in `infrastructure/controllers/openbao/helmrelease.yaml`, the extra env and mounts, the seal-check metrics, the alert rules and the ops portal card. Both production (`gen-serv`) and the dev overlay (`infrastructure/environments/dev`), with `cluster-config` variables for the seal address and server name.
- **Cloudflare:** no change. bao-seal gets no hostname, tunnel ingress or Access policy. Record that in the Cloudflare lists so nobody adds one.
- **Secrets inventory** (`secrets/`): the transit token, the CA, bao-seal unseal material and its snapshot key.
- **Docs:** set this ADR to accepted and ADR 0021 to superseded. Update the [OpenBao unseal runbook](../runbooks/openbao-unseal.md) (seal mode, seal-down procedure, restart tests, key rotation), the backup runbook, the alerting runbook, the handbook chapters on ops and environments, and the C4 deployment diagram.
- **Verification:** a dev rehearsal of migration and rollback, a production restart test, a seal-down test and a bao-seal snapshot restore test. The closing comment says how it was verified.

## More Information

- Revisit this ADR when a second always-on host exists, when gitops#21 is decided, or when an off-site backup of `openbao-data` is introduced.
- Check the OpenBao seal documentation (transit and static seals, `unseal -migrate`) against the installed chart version before the production change.
