# Release (git-flow)

Every repository follows the same git-flow and versioning ([spec §13](../specs/2026-10-16-voics-platform-design.md#13-cicd-and-git-flow), [CONTRIBUTING](../CONTRIBUTING.md#git-flow)).

| Branch | Purpose | Image / version |
|---|---|---|
| `feature/*` | Work in progress, merged into `develop` with `--no-ff` | CI only, nothing pushed |
| `develop` | Integration | `X.Y.(Z+1)-dev.N` (after the latest `vX.Y.Z` tag) |
| `release/X.Y.Z` | Stabilisation | `X.Y.Z-rc.N` |
| `main` | Released code only | `X.Y.Z`, `X.Y` and `latest` (git tag `vX.Y.Z`); the client publishes its installer on every merge to `main` |
| `hotfix/X.Y.Z` | Urgent fix based on `main` | `X.Y.Z-rc.N`, then `X.Y.Z` |

`gitflow-guard` fails a PR to `main` that does not come from `release/*` or `hotfix/*`. It also fails a PR to `develop` that does not come from `feature/*`, `release/*`, `hotfix/*` or `dependabot/*` ([ADR-0007](../adr/0007-github-free-workarounds.md)).

## How changes reach production

**Short answer:** a merge to `main` alone does **not** deploy a service. A **release tag `vX.Y.Z`** does: it builds a stable image, and Flux rolls it out automatically. The website is the exception: it goes live on every merge to `main` as well as on tags.

| Component | Repository | What triggers a deploy | Pipeline | Where it lands |
|---|---|---|---|---|
| api, messages, gateway, admin, voice (signaling + SFU) | service repo | tag `vX.Y.Z` on `main` | `ci.yml`: tests, then `docker.yml` builds, scans, signs and pushes `ghcr.io/voics-app/<image>:X.Y.Z` | Flux image automation bumps the tag in gitops `main`, and Flux applies it (see [timings](#timings)) |
| Platform config (manifests, ingress, data layer, observability) | `gitops` | merge to `main` | Flux `GitRepository` polls `main` every minute | the matching Flux Kustomization applies it on the next source revision |
| Desktop client installer (Windows) | `client` | merge to `main` or tag `vX.Y.Z` | `release.yml`: Windows build on a GitHub-hosted runner, GitHub Release assets and the `installer-windows` artifact; gitops `publish-public` uploads it within 10 minutes | `https://updates.voics.nl/Voics-Setup-X.Y.Z.exe`, `latest.yml` (installed clients auto-update) and `Voics-Setup-latest.exe` (the website's Download button) |
| Marketing website | `website` | merge to `main` **or** tag `v*` | `ci.yml`: build + brand check + `site-dist` artifact; gitops `publish-public` uploads it into bucket `discordy-site` within 10 minutes | `https://voics.nl` |
| Invite landing page (`/invite/<code>`) | `gitops` (`site/`) | merge to `main` touching `site/**` | `publish-site.yml`: `minio-publish` into `discordy-site` | `https://voics.nl/invite/<code>` |
| Docs | `docs` | merge to `main` | release-please and the Notion mirror | GitHub (and Notion) |

What the other branches produce:

- `develop` pushes `X.Y.Z-dev.N` images and `release/*`/`hotfix/*` push `X.Y.Z-rc.N`. The production image policies select **stable** tags only, so none of these reach production. The dev/test environment follows `-dev.N` (see [Dev/test environment and promotion](#devtest-environment-and-promotion)).
- `feature/*` and pull requests only build and test; nothing is pushed.

### Delivery mode live suite

Before tagging a release that touches the client, gateway relay, `messages` or the device/key-package endpoints, run the live delivery matrix against the local stack ([guarantees](../protocols/delivery-modes.md)):

```bash
cd client/apps/desktop && npx electron-vite build
npx playwright test -c tests/live/playwright.live.config.ts delivery-modes.spec.ts matrix-offline.spec.ts matrix-multidevice.spec.ts matrix-group.spec.ts matrix-guild.spec.ts matrix-switching.spec.ts matrix-features.spec.ts
```

It covers offline replay, multi-device, group DMs, member leave/remove, new devices, mode switching, ACK clean-up, restart behaviour and per-mode attachment/edit/delete/reaction support. The suite creates its own throwaway users. It needs the full stack from `gitops/local` (`./dev.sh up`).

### Timings

The figures below cover the time from the moment the release image exists in GHCR.

| Step | Controller | Interval | Where it is set |
|---|---|---|---|
| Notice the new tag in GHCR | `ImageRepository` (one per image) | **5 min** | `gitops/apps/image-automation/image-policies.yaml` (`spec.interval`) |
| Choose it (`semver >=0.1.0`, stable only) | `ImagePolicy` | immediately after the scan | same file (`spec.policy.semver.range`) |
| Commit the bump to gitops `main` | `ImageUpdateAutomation` `discordy` | **5 min** | `gitops/apps/image-automation/image-update-automation.yaml` |
| Fetch gitops `main` | `GitRepository` `flux-system` | **1 min** | `gitops/clusters/gen-serv/flux-system/gotk-sync.yaml` |
| Apply to the cluster | Kustomization `apps` / `regions` | immediately on a new source revision; full re-sync every 10 min (retry 2 min) | `gitops/clusters/gen-serv/apps.yaml`, `regions.yaml` |
| Infra layers (foundation, controllers, configs, data) | Kustomizations | on a new revision; re-sync every 30 min | `gitops/clusters/gen-serv/infrastructure.yaml`, `configs.yaml` |
| Pod rollout | Deployment rolling update | about 1 to 2 min (readiness probes) | the service manifests |

End to end, a service release goes live within about **10 minutes of its image being pushed**, plus the CI build itself (about 5 to 15 minutes for Rust and Elixir). Worst case is about 5 + 5 + 1 minutes before the apply starts. The invite page deploys about 2 minutes after the merge; the website and the desktop installer go live within 10 minutes of their build finishing (gitops `publish-public` runs every 10 minutes; run it by hand to publish at once). Cloudflare caches assets, but the build adds content hashes to asset URLs and `index.html`, `latest.yml` and `Voics-Setup-latest.exe` are served with a 5-minute cache.

### Changing the intervals

1. Edit the `interval` in the files named in the table, on a `feature/*` branch of gitops, and merge it through the normal flow. Flux reconfigures itself from git; never `kubectl edit` these objects, because Flux reverts it.
2. Shorter intervals mean more GHCR API calls. Keep image scans at 1 minute or more, because GHCR rate-limits anonymous and token calls.
3. For zero-delay deploys, add a Flux `Receiver` (webhook from GitHub or GHCR, exposed through the tunnel). It is not set up yet.

### Deploying now, without waiting

```bash
export KUBECONFIG=~/.kube/discordy-gen-serv.yaml
flux reconcile image repository api -n flux-system      # scan GHCR now (per image)
flux reconcile image update discordy -n flux-system     # commit the bump now
flux reconcile kustomization apps -n flux-system --with-source
kubectl -n voics-apps rollout status deploy/api
flux get images policy -A                               # which version each image follows
```

Re-publish the website or the invite page by re-running its workflow (`gh workflow run ci.yml -R voics-app/website --ref main`, or `publish-site.yml` in gitops). Publish a new installer build with `gh workflow run release.yml -R voics-app/client --ref main` (it publishes the next patch version; an already published version is never overwritten).

### How the publish jobs get access

`minio-publish` (in `voics-app/.github`) runs on the in-cluster ARC runner (`runs-on: discordy`). The runner's service account `voics-system/discordy-runner` may `get` exactly one Secret, `voics-data/minio`, through the Role `discordy-runner-publish` (`gitops/infrastructure/controllers/actions-runner-controller/runner-scale-set/publish-rbac.yaml`). The workflow reads the key from the Kubernetes API and uploads over the cluster network, so there is no MinIO key in GitHub. Objects are mirrored with `--overwrite` and never removed, so the website and the invite page can share one bucket.

### CI runners: GitHub-hosted, owner PC or a VM

Since 2026-11-21 every repository except `gitops` is public and runs on GitHub-hosted runners for free; `gitops` runs on the VM pool (`vm-runner`). `scripts/repo-visibility.sh status|public|private` in `.github` switches visibility and runner together. The commands below manage the self-hosted runners themselves. The full reference (resources, how a runner is built) is in the [`.github` README → CI runners](https://github.com/voics-app/.github#ci-runners). Run the commands from the `.github` repository:

```bash
scripts/runner.sh up                                   # 3 runners on this PC (label karma-pc) and switch to them
scripts/runner-vm-bootstrap.sh user@vm                 # once per fresh Ubuntu/Debian VM: install Docker
scripts/runner.sh up --host user@vm --count 3          # 3 runners on the VM (label vm-<host>)
scripts/runner.sh use vm-<host>                        # send jobs to the VM
scripts/runner.sh use github                           # back to GitHub-hosted runners
scripts/runner.sh status                               # active CI_RUNNER and online runners
scripts/runner.sh down [--host user@vm]                # remove runners (switches back if they were active)
```

- **Switching**: the shared workflows' default `runs-on` follows the repository variable `CI_RUNNER`. Jobs that name a runner explicitly keep it: `discordy` (in-cluster ARC) and `windows-latest` (the installer).
- **CI cache on self-hosted runners** ([ADR 0022](../adr/0022-ci-cache-safety-rules.md)): a persistent `/cache` volume and the toolchains in the runner image speed up PR and develop builds. **Releases are always clean**: pushes to `main`, tags, `release/*`, `hotfix/*` and PRs into `main` compile Rust from an empty `target/`, and image builds compile inside the Dockerfile (no persistent `target/`). SBOM and cosign signing run only for `main`, tags and release versions. A weekly scheduled run on `develop` builds everything cold. If a release build is red but the same commit was green on develop, suspect the cache: set the variable `CI_CACHE=off` (`gh variable set CI_CACHE --body off -R voics-app/<repo>`; delete it afterwards), or label the PR `ci-no-cache` and push, then re-run; clear the volume with `scripts/runner.sh cache-clear --host user@vm` when the runners are idle.
- **Resources per runner** (one job at a time): 2 vCPU, 6–8 GB RAM and about 40 GB disk. A VM for 3 runners needs 6–8 vCPU, 16–24 GB RAM and 150 GB disk.
- **No restart policy**: run `down` or `use github` before turning the PC or VM off. Otherwise jobs wait for the missing runner.

### When a deploy does not show up

| Symptom | Check |
|---|---|
| New tag, but no new image | Did CI on the tag pass? `gh run list -R voics-app/<repo> --branch vX.Y.Z` |
| Image exists, but the policy still shows the old version | `flux get images repository -A`: scan errors, GHCR pull secret `ghcr-pull` |
| Policy updated, but gitops not bumped | `flux get images update -A`: push errors; image automation is suspended (`flux resume image update discordy`) |
| gitops bumped, but the pod is old | `flux get kustomizations -A`: a failing dependency (for example `infra-data`) blocks `apps`; `kubectl -n voics-apps describe pod` |
| Website or installer still old | Was the publish job on the ARC runner green? Is the ARC runner pod up? `kubectl -n voics-system get pods \| grep discordy-` |
| Users still get the old installer | Cloudflare cache: wait 5 minutes, or purge the URL (the API token needs *Zone: Cache Purge*) |

## Dev/test environment and promotion

The dev/test environment ([Environments](environments.md#devtest-environment)) runs the whole suite from `develop` on its own VM, on `discordy-dev*.voics.nl`. It is how a change is tried end to end before a release.

| Step | What happens | Where |
|---|---|---|
| 1. Merge a feature PR into `develop` | the repository's CI builds and pushes `X.Y.Z-dev.N` (services) or publishes the dev build (website, client dev channel) | service repos, `website`, `client` |
| 2. Dev image policies pick the new tag | `ImageRepository` and `ImagePolicy` `<name>-dev` (every 5 min, tags `X.Y.Z-dev.N` only) | `gitops/apps/image-automation-dev` |
| 3. Dev automation commits the tag to gitops `develop` | `ImageUpdateAutomation` `discordy-dev` (every 5 min) | dev cluster |
| 4. Flux applies it | `clusters/dev` watches `develop` (every minute); Kustomization `apps` / `regions` | dev cluster |
| 5. Try it | log in with the seeded demo users ([password](environments.md#devtest-environment)), run the smoke checks | `discordy-dev.voics.nl` |
| 6. Release | the [standard release](#standard-release) cuts `release/X.Y.Z`, merges to `main` and tags; production's policies select stable `X.Y.Z` only | production |

Dev and production never share images, secrets or state: production's image policies still accept stable tags only (`semver >=0.1.0` excludes prereleases), dev's accept only `-dev.N`. Timings of the dev path: **not measured yet**; by the intervals above, a merged image should reach the dev hosts within about 10 minutes of being pushed, the same arithmetic as production's [timings](#timings).

Gitops changes follow the same path: a merge to `develop` is applied to dev (`clusters/dev` watches `develop`), a merge to `main` to production (`clusters/gen-serv` watches `main`). Check a platform change on dev before the release PR.

## Release order across repositories

Consumers depend on what they consume, so release in dependency order:

1. `contracts`: consumers pin `vX.Y.Z`.
2. `.github`: reusable workflows.
3. `api`, `messages`, `gateway` and `voice`, in parallel.
4. `admin`, `bots-sdk` and `client`.
5. `gitops`: the version bumps land automatically through Flux image automation. Manual changes go in their own release PR.
6. `docs`: tag it to match the platform release.

## Standard release

**Automated:** `scripts/release.sh <repo> <X.Y.Z>` in the `.github` repo runs steps 1, 4, 5 and 6 below. Run it from the folder that holds the repo checkouts, or set `BASE`. What it does:

- pushes `release/X.Y.Z` from `develop` and opens the PR to `main`;
- waits for the PR checks and merges;
- waits for a green `main` push CI run on the PR's **merge commit** (it reads the SHA from GitHub, because a fetch straight after the merge can still see the old `main`);
- tags `vX.Y.Z`, back-merges `main` into `develop` and deletes the release branch.

It never tags without that green run (a repo without CI on `main` stops there). If CI already made the tag on that commit, it reuses it: the client's release workflow tags the version itself (client#195). Afterwards, do step 7 and check the pods yourself.

The manual steps below are what the script does, for when it stops halfway.

The example uses version `0.2.0` in repository `api`.

### 1. Cut the release branch

```bash
git switch develop && git pull --ff-only
git switch -c release/0.2.0
git push -u origin release/0.2.0
```

CI builds and pushes `ghcr.io/voics-app/api:0.2.0-rc.1`.

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

### 5. Tag the release

```bash
git switch main && git pull --ff-only
git tag -a v0.2.0 -m "v0.2.0: <summary>"
git push origin v0.2.0
```

The tag build pushes `api:0.2.0`, `api:0.2` and `api:latest`, cosign-signed with an SBOM, and with title, description and source annotations shown on GHCR. release-please is no longer used: it could not open PRs under the org settings and failed on every release. Versions come from git tags. The full explanation of tags is in [Handbook 11, Releasing](../handbook/11-releasing.md).

### 6. Back-merge

```bash
git switch develop && git pull --ff-only
git merge --no-ff main -m "chore: merge main (v0.2.0) into develop"
git push
git push origin --delete release/0.2.0
```

### 7. Deploy

Flux image automation follows the new tag. See [Deployment via Flux](#deployment-via-flux).

### CI caches during a release

The first image build after a release of the shared `.github` workflows, or after a `Cargo.lock` change, is slower while the registry layer cache (`:buildcache` tag of each image) is rebuilt; later builds reuse it. To start from a clean cache, delete the `buildcache` tag of the image in GHCR and run the weekly `cache-cleanup` workflow by hand. The `.github` repository itself is released through a `release/X.Y.Z` branch (the git-flow guard rejects `develop` into `main`) and a `vX.Y.Z` tag. See [CI caching](../handbook/05-ci-cd-and-runners.md#ci-caching).

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

**Migrations**: never roll back a database migration automatically. If the previous version cannot run against the new schema, a validated forward fix or tested restore plan is required; production PITR is not currently established ([Postgres recovery plan](backup-restore.md#postgres)).

## Desktop client release

The client follows the same git-flow. `client/.github/workflows/release.yml` runs on every **merge to `main`** (a release in our git-flow), on a `v*` tag and on manual dispatch (use `main`). `develop` never publishes. What happens:

0. The version is decided by `scripts/release-version.mjs` against the version the feed serves now (`latest.yml`): on `main`, `apps/desktop/package.json` when it is higher (the release branch bumped it), otherwise the published patch + 1; on a tag, exactly the tag, and the run **fails** if the tag is not higher than what is published (electron-updater needs a strictly increasing semver). A run that cannot read the feed fails rather than guess. The release `vX.Y.Z` is tagged by the workflow itself.

1. A **Windows (NSIS)** build runs on a GitHub-hosted `windows-latest` runner, including the native crypto module (Rust). It is free since the client repository is public.
2. `Voics-Setup-X.Y.Z.exe`, its `.blockmap` and `latest.yml` are attached to the GitHub Release and uploaded as the `installer-windows` artifact.
3. Within 10 minutes gitops `publish-public` uploads them to the `discordy-updates` bucket, served at `https://updates.voics.nl`, and copies the installer to `Voics-Setup-latest.exe`. That stable name is the target of the website's Download button. `latest.yml` and the stable name get a 5-minute cache.
4. Installed clients read `latest.yml` (electron-updater, generic provider `brand.updateFeedHost`), so publishing it rolls the update out.

Not built yet:

- **macOS (dmg)**: the script exists (`pnpm dist:mac`), but CI does not run it yet. The website shows it as "coming soon". Linux (AppImage and deb) is built by the `linux` job of the client `release` workflow and published by gitops `publish-public` (source `client-linux`), see [Desktop client release](../handbook/09-desktop-client-release.md).
- **RC/beta channel**: RC builds don't produce installers. The dev/test environment has a dev updates host (`discordy-dev-updates.voics.nl`) for an optional dev installer channel; the client workflow that publishes to it is not built yet.
- **Code signing**: installers are unsigned (spec §10), so Windows SmartScreen shows "unknown publisher".

A manual build (when CI is unavailable) runs `pnpm dist:win` on Windows and uploads `apps/desktop/release/{Voics-Setup-X.Y.Z.exe,.blockmap,latest.yml}` to the bucket. 0.2.0 was published this way.

- **Verify**: install the previous version, start it, and confirm the update prompt arrives and the update installs.
- **To pull a bad client release**, restore the previous `latest.yml` in the bucket. Clients only update forward, so ship a fixed version quickly.

## Docs release

This repository has no image. Merging into `main` triggers:

- the Notion mirror (`notion-sync`);
- release-please, which tags `vX.Y.Z`.

Keep the docs version aligned with the platform release it describes.
