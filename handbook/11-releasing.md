# 11 Releasing: git tags, how to release, what happens

## What a git tag is

A git tag is a fixed, named pointer to one commit. Unlike a branch it never moves. We use **annotated tags** named `vX.Y.Z` (semantic versioning: `MAJOR.MINOR.PATCH`) to mark "this exact commit is release X.Y.Z" of one repository.

- `PATCH` (0.3.**1**): fixes only.
- `MINOR` (0.**4**.0): new features, backwards compatible.
- `MAJOR` (**1**.0.0): breaking changes; we are pre-1.0, so minors may still break.

Each repository has its own version line. `api v0.3.0` and `gateway v0.2.1` are unrelated numbers.

A tag is what turns code into a **release**. CI sees the tag and builds the stable artifacts for it. Tags are never moved or deleted: a wrong release is fixed with a new patch tag.

## What a tag (or a merge to `main`) produces, per repository

| Repository | Trigger | Result | Live where, and when |
|---|---|---|---|
| api, messages, gateway, voice, admin | tag `vX.Y.Z` | Docker image `ghcr.io/discordy-voics/<image>` with tags `X.Y.Z`, `X.Y` and `latest`, with title, description and source on GHCR, cosign-signed, SBOM | Production: Flux image automation sees the stable tag within 5 min, commits the bump to gitops `main`, Flux rolls the pod (about 10 min total) |
| client (desktop) | merge to `main` **or** tag `vX.Y.Z` | Windows installer `Discordy-Setup-X.Y.Z.exe`, `latest.yml`, `Discordy-Setup-latest.exe` and a GitHub Release | Installed clients update themselves (electron-updater reads `latest.yml`); the website button serves the new installer within about 5 min (Cloudflare cache) |
| website | merge to `main` or tag | Static site uploaded to the `discordy-site` bucket | <https://discordy.voics.nl> after about 2 min |
| gitops | merge to `main` (the tag is a marker) | Flux applies the manifests | Cluster, within 1 to 2 min |
| docs | merge to `main` (the tag is a marker) | Notion sync | Notion → Home → Home Lab → Discordy |
| contracts, .github | tag | Version marker; `.github` callers use `@main`, so a merge to `main` already changes CI everywhere | n/a |

Develop builds never reach production: they get pre-release versions `X.Y.(Z+1)-dev.N`, which the production image policies ignore.

## How to release (one repository)

From a clean checkout of the repository:

```bash
git fetch --tags origin
git switch develop && git pull --ff-only          # everything to release is merged into develop, CI green
git describe --tags --abbrev=0 origin/main        # current release, e.g. v0.3.0
git switch main && git pull --ff-only
git merge --no-ff develop -m "Merge release/0.3.1"
git tag -a v0.3.1 -m "v0.3.1: <one line of what changed>"
git push origin main v0.3.1                       # this triggers the release build
git switch develop && git merge main && git push origin develop   # back-merge, so develop sees the tag
```

For a bigger release, stabilise on a `release/X.Y.Z` branch first (fixes only, `-rc.N` images), then merge that into `main` instead of `develop` ([Release runbook](../runbooks/release.md)).

**Which number?** Use the next patch for fixes, the next minor when features were added. The client computes its own number on a merge to `main` (higher than the published one); tag it yourself only to force a specific version.

**Release order** when several repositories change together: contracts → gitops (new databases or config first) → api, messages, gateway, voice → admin and client → docs.

## Check that the release worked

```bash
gh run list -R discordy-voics/<repo> --branch v0.3.1        # the tag build must be green
flux get images policy -A                                    # production follows the new X.Y.Z
kubectl -n voics-apps get deploy -o wide                     # running image tags
curl -s https://discordy-updates.voics.nl/latest.yml | head -1   # client: version: X.Y.Z
```

## When a release is bad

- **Service**: fix it on a `hotfix/X.Y.Z` branch from `main`, tag the next patch. For an immediate rollback, pin the previous version in gitops (`apps/<service>/production/kustomization.yaml`) and suspend image automation (`flux suspend image update discordy`). See the [Release runbook → Rollback](../runbooks/release.md#rollback).
- **Client**: clients only update forward, so ship a fixed patch quickly. To stop the rollout, restore the previous `latest.yml` in the update bucket.
- **Never** delete or move a published tag.
