# 0007 — Working within GitHub Free for private repositories

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §13](../specs/2026-10-16-voics-platform-design.md#13-cicd-and-git-flow)

## Context and Problem Statement

The `discordy-voics` org is on GitHub Free and every repository is private. Free gives 2,000 Actions minutes a month (macOS minutes count 10×) and 500 MB of package storage. Rulesets and branch protection are not available for private repositories. How do we still get full CI/CD with semver images and an enforced git-flow?

## Decision Drivers

- Full pipeline on every change: lint → test → build → scan → SBOM → push → sign
- Stay inside the free minute and storage quotas
- Enforce git-flow without branch protection
- Signed, labelled, semver images on GHCR

## Considered Options

1. Keep GitHub Free and work around its limits: an in-cluster runner, GHCR retention, macOS builds only on release, git-flow enforced by a CI check
2. Upgrade to GitHub Team
3. Make the repositories public
4. Self-host Gitea or Forgejo with their own runners

## Decision Outcome

Chosen option: **1**.

- **Heavy builds** (Rust release builds, Electron packaging for Windows and Linux, SFU images) run on the self-hosted Actions Runner Controller scale set inside the cluster (`runs-on: [self-hosted, discordy]`). Every reusable workflow takes `runs-on` as an input that defaults to `ubuntu-latest`.
- **`ghcr-retention.yml`** keeps every stable version and the latest 5 prereleases of each image.
- **macOS client builds** run only on `release/*` and tags.
- **git-flow is enforced by a CI check.** `gitflow-guard.yml` fails a PR to `main` that does not come from `release/*` or `hotfix/*`. It also fails a PR to `develop` that does not come from `feature/*`, `release/*`, `hotfix/*` or `dependabot/*`.
- **Image signing** uses cosign keyless signing through GitHub OIDC, so no signing key needs to be stored.

### Consequences

- Good, because there is no subscription cost and the full pipeline still runs.
- Good, because the in-cluster runner can also do privileged in-cluster work (`secrets-sync`) without exposing OpenBao.
- Bad, because the guard check only signals a violation; it cannot physically block a push. Admins could still push directly. The CONTRIBUTING guide makes PR-only flow mandatory, and the guard flags violations.
- Bad, because builds compete with production workloads for the VM's 7.6 GB. The runner pod has requests and limits and scales to zero when idle.

### Confirmation

- Every repository's `ci.yml` calls the reusable workflows.
- `gitflow-guard` is a required status in the PR template checklist.
- The GHCR usage is reviewed monthly against the 500 MB quota.

## Pros and Cons of the Options

### Option 2 — GitHub Team

- Good, because it adds branch protection, rulesets and 3,000 minutes.
- Bad, because it costs a recurring per-seat fee for a solo-owned project.

### Option 3 — Public repositories

- Good, because public repositories get unlimited minutes and branch protection.
- Bad, because the owner wants the code private.

### Option 4 — Self-hosted forge

- Good, because there are no limits.
- Bad, because it is one more critical service to run on a small VM, and it loses GHCR, Dependabot and the Actions ecosystem.
