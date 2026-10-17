# Release (git-flow)

Every repository follows the same git-flow and versioning ([spec §13](../specs/2026-10-16-voics-platform-design.md#13-cicd-and-git-flow), [CONTRIBUTING](../CONTRIBUTING.md#git-flow)).

| Branch | Purpose | Image / version |
|---|---|---|
| `feature/*` | Work in progress, merged into `develop` with `--no-ff` | CI only, nothing pushed |
| `develop` | Integration | `X.Y.Z-dev.N` |
| `release/X.Y.Z` | Stabilisation | `X.Y.Z-rc.N` |
| `main` | Released code only | `X.Y.Z`, `X.Y` and `latest` (release-please tag `vX.Y.Z`) |
| `hotfix/X.Y.Z` | Urgent fix based on `main` | `X.Y.Z-rc.N`, then `X.Y.Z` |

`gitflow-guard` fails a PR to `main` that does not come from `release/*` or `hotfix/*`. It also fails a PR to `develop` that does not come from `feature/*`, `release/*`, `hotfix/*` or `dependabot/*` ([ADR-0007](../adr/0007-github-free-workarounds.md)).

## Release order across repositories

Consumers depend on what they consume, so release in dependency order:

1. `contracts`: consumers pin `vX.Y.Z`.
2. `.github`: reusable workflows.
3. `api`, `messages`, `gateway` and `voice`, in parallel.
4. `admin`, `bots-sdk` and `client`.
5. `gitops`: the version bumps land automatically through Flux image automation. Manual changes go in their own release PR.
6. `docs`: tag it to match the platform release.

## Standard release

The example uses version `0.2.0` in repository `api`.

### 1. Cut the release branch

```bash
git switch develop && git pull --ff-only
git switch -c release/0.2.0
git push -u origin release/0.2.0
```

CI builds and pushes `ghcr.io/discordy-voics/api:0.2.0-rc.1`.

### 2. Stabilise

- Only fixes go on `release/0.2.0`: `fix:`, `docs:`, `test:` and `chore:`. **No new features.**
- Each push produces `0.2.0-rc.N`.
- **Testing**: test the RC against the local compose stack (`gitops/local`, profile `full`, with the image tags overridden) and run the WS11 end-to-end suite.
- **Merge fixes back** into `develop` regularly, so they aren't lost:

  ```bash
  git switch develop && git merge --no-ff release/0.2.0 && git push
  ```

### 3. Release checklist

- [ ] CI is green on `release/0.2.0`: lint, test, build, scan (no CRITICAL findings), SBOM, cosign signature.
- [ ] Database migrations are backwards-compatible with the previous version (expand/contract), or the release notes call out the downtime.
- [ ] `contracts` is pinned to a released tag, not a branch.
- [ ] `CHANGELOG.md` will be produced by release-please. Check that the commit messages since the last tag are Conventional Commits.
- [ ] A Postgres backup was taken ([backup-restore](backup-restore.md#postgres)).

### 4. Merge into `main`

```bash
gh pr create --base main --head release/0.2.0 --title "chore(release): 0.2.0"
# review, then merge with a merge commit (no squash, so history stays git-flow)
gh pr merge --merge
```

### 5. Let release-please tag

The `release-please` workflow on `main` opens or updates a **release PR** (`chore(main): release 0.2.0`) containing the changelog and the bumped `.release-please-manifest.json`. Merge it. release-please then:

- creates the tag `v0.2.0` and a GitHub Release with the changelog;
- triggers the tag build, which pushes `api:0.2.0`, `api:0.2`, `api:latest`, cosign-signed, with an SBOM attached.

> To make release-please produce exactly `0.2.0`, keep `release-as` in `release-please-config.json` aligned with the branch name. Otherwise it derives the version from the commits: `feat` bumps the minor version and `fix` the patch.

### 6. Back-merge

```bash
git switch develop && git pull --ff-only
git merge --no-ff main -m "chore: merge main (v0.2.0) into develop"
git push
git push origin --delete release/0.2.0
```

### 7. Deploy

Flux image automation follows the new tag. See [Deployment via Flux](#deployment-via-flux).

## Hotfix

```bash
git switch main && git pull --ff-only
git switch -c hotfix/0.2.1
# fix + test, commit as "fix: ..."
git push -u origin hotfix/0.2.1          # builds 0.2.1-rc.N
gh pr create --base main --title "fix: <summary> (0.2.1)"
```

After the merge, release-please tags `v0.2.1`. Back-merge `main` into `develop` (step 6 above), and also into an open `release/*` branch if one exists.

## Deployment via Flux

- **Image policies**: `gitops` defines an `ImageRepository` and an `ImagePolicy` per image, with semver range `>=0.1.0`, so only stable tags are selected.
- **Automation**: `ImageUpdateAutomation` commits the new tags to `main` of `gitops`, using the `# {"$imagepolicy": ...}` markers.

```bash
flux get images policy -A                      # latest selected versions
flux reconcile image repository api -n flux-system
flux reconcile kustomization apps --with-source
kubectl -n voics-apps rollout status deploy/api
```

**Voice regions** use the same image policies. Roll voice nodes **one region at a time**:

1. Drain a node ([draining](voice-regions/draining-a-region.md)).
2. Let Flux roll the pod.
3. Run a test call.
4. Undrain the node.

The SFU can also be upgraded under live calls through the session replay ([failover → SFU crash](voice-regions/failover.md#sfu-crash)).

## Rollback

There are two options:

1. **Pin the previous version in gitops**, which is the fast path. Edit the image tag in `apps/<service>/production/kustomization.yaml` to the previous `X.Y.Z`, and suspend that image policy:

   ```bash
   flux suspend image update flux-system
   # commit the pinned tag on a hotfix/* branch of gitops, merge
   flux reconcile kustomization apps --with-source
   ```

2. **Fix forward** with a hotfix, then resume automation with `flux resume image update flux-system`.

**Migrations**: never roll back a database migration automatically. If the previous version can't run against the new schema, restore from backup ([backup-restore → Postgres PITR](backup-restore.md#point-in-time-restore)).

## Desktop client release

The client follows the same flow, with these differences:

- Windows (NSIS) and Linux (AppImage/deb) builds run on the self-hosted runner. **macOS (dmg) builds run only on `release/*` and tags**, to save minutes.
- Release artefacts are uploaded to the MinIO `updates` bucket, using the `MINIO_UPDATES_*` keys, together with `latest.yml`, `latest-mac.yml` and `latest-linux.yml`. They are served at `https://discordy-updates.voics.nl`.
- **RC builds** are published to the `beta` channel (`beta.yml`). Only the tag build writes `latest*.yml`, so stable users never receive an RC.
- Installers are **unsigned** for now (spec §10). Windows SmartScreen shows "unknown publisher" until code signing is added.
- **Verify**: install the previous version, start it, and confirm the update prompt arrives and the update installs.
- **To pull a bad client release**, restore the previous `latest.yml` in the bucket. Clients only update forward, so ship a fixed version quickly.

## Docs release

This repository has no image. Merging into `main` triggers:

- the Notion mirror (`notion-sync`);
- release-please, which tags `vX.Y.Z`.

Keep the docs version aligned with the platform release it describes.
