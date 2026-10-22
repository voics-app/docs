# 0006 — Secrets flow: GitHub secrets → OpenBao → External Secrets Operator

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §12 "Secrets"](../specs/2026-10-16-voics-platform-design.md#12-infrastructure), master plan P2, WS9 task 9.2

## Context and Problem Statement

Every service needs credentials: database passwords, JWT keys, `INTERNAL_SERVICE_TOKEN`, `VOICE_TOKEN_SECRET`, MinIO keys and the Erlang cookie. The platform also needs the Cloudflare and GitHub tokens. Where do secret values live, how do they reach pods, and how do we stop them from leaking into git?

## Decision Drivers

- No secret values in any repository, ever. This is enforced by gitleaks in CI.
- One place where the owner enters and rotates values
- A path into Kubernetes that survives cluster rebuilds
- Free tooling only (GitHub Free, open-source components)
- An inventory that says which secrets exist and who consumes them

## Considered Options

1. Values in GitHub org/environment secrets → `secrets-sync` workflow on the in-cluster runner → OpenBao KV v2 → External Secrets Operator → Kubernetes Secrets
2. Sealed Secrets (encrypted values committed to `gitops`)
3. SOPS + age with Flux decryption
4. Kubernetes Secrets created by hand with `kubectl`

## Decision Outcome

Chosen option: **1**.

1. **Entry point:** the owner sets values once, as secrets of the `production` environment of the `gitops` repository. On GitHub Free, private repositories cannot read organisation secrets, so org secrets are **not** used ([ADR-0007](0007-github-free-workarounds.md)).
2. **Sync to OpenBao:** the `secrets-sync` workflow in `gitops` runs on the self-hosted ARC runner labelled `discordy`, so OpenBao is never exposed outside the cluster. It writes each value to `kv/discordy/<service>`.
3. **Sync to Kubernetes:** External Secrets Operator reads OpenBao through a `ClusterSecretStore` and materialises one Kubernetes Secret per app, through an `ExternalSecret`.
4. **Unseal material:** the OpenBao unseal keys and the root token are stored in one owner-only key store: Windows DPAPI files (in use) or 1Password ([OpenBao runbook](../runbooks/openbao-unseal.md)).
5. **Inventory:** [`secrets/inventory.yaml`](../secrets/inventory.yaml) lists every secret with its purpose, consumers, GitHub name, OpenBao path, owner and rotation policy. A CI check in `gitops` fails when an `ExternalSecret` references a key that is missing from the inventory.

### Consequences

- Good, because values never enter git, and rotation means updating the GitHub secret and re-running the sync (see the [secret rotation runbook](../runbooks/secret-rotation.md)).
- Good, because OpenBao gives audit logs, versioned KV and a migration path to dynamic credentials later.
- Bad, because there are more moving parts: OpenBao must be unsealed after every restart (see the [OpenBao unseal runbook](../runbooks/openbao-unseal.md)).
- Bad, because GitHub secrets are write-only. The inventory, not GitHub, is the readable record of what exists.

### Confirmation

- gitleaks runs in every repository's CI.
- The inventory check runs in `gitops`.
- `scripts/render-secrets.mjs --check` in this repository keeps the rendered README in sync with the inventory.

## Pros and Cons of the Options

### Option 2 — Sealed Secrets

- Good, because it is simple and GitOps-native.
- Bad, because the encrypted blobs are tied to the controller key, so a cluster rebuild needs key backup. It also offers no central rotation or audit.

### Option 3 — SOPS + age

- Good, because Flux supports it natively.
- Bad, because the age key must be distributed and protected, and ciphertext still lives in git.

### Option 4 — Manual secrets

- Good, because it is trivial to start.
- Bad, because nothing is reproducible, audited or inventoried.
