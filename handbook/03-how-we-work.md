# How we work

Summary: git-flow, the board, issue templates, Definition of Done, the agent and coordinator model, merge policy, releases and the never-touch rules.

The authoritative rules are in [CONTRIBUTING](../CONTRIBUTING.md) and the [release runbook](../runbooks/release.md). This page is the map.

## Board and issues

Work is tracked as GitHub issues on the org project board **<https://github.com/orgs/discordy-voics/projects/1>**.

| Column | Meaning |
|---|---|
| Backlog | Known, not scheduled |
| Ready | Scoped and unblocked |
| In progress | Someone (a person or an agent) is working on it |
| In review | A PR is open |
| Done | Merged, verified, closed |

Issues are created from the forms in the `.github` repository: **bug report**, **feature request** and **platform change**. Labels carry the priority (`priority:p0` to `p2`), the workstream (`ws:*`), the type and the owner (`agent:<name>`). Questions that wait for the owner carry `needs:owner` and are collected in [docs#10](https://github.com/discordy-voics/docs/issues/10).

## git-flow

| Branch | From | Into | Purpose |
|---|---|---|---|
| `feature/<ws>-<topic>` | `develop` | `develop` (merge commit) | One feature or fix |
| `develop` | | | Integration; dev images `X.Y.Z-dev.N` |
| `release/X.Y.Z` | `develop` | `main` and back into `develop` | Stabilisation |
| `main` | | | Released code; tag `vX.Y.Z` |
| `hotfix/X.Y.Z` | `main` | `main` and `develop` | Urgent production fix |

Never commit to `main` or `develop` directly. The `gitflow-guard` check rejects PRs from the wrong branch type ([ADR-0007](../adr/0007-github-free-workarounds.md)). Commits follow Conventional Commits (`feat(scope): summary`).

## Definition of Done

An issue is done only when all of this holds ([CONTRIBUTING](../CONTRIBUTING.md#definition-of-done)):

1. **Merged** to `develop` through a PR with green CI (lint, tests, scan).
2. **Tested**: tests added or updated, behaviour verified (live or end-to-end for calls, delivery and deploys).
3. **Documented**: docs repo (runbooks, ADRs, specs, service catalog, secrets inventory), the repo README and, for operator tools, the ops portal.
4. **Reproducible** (platform and CI/CD items): everything a new environment needs is in code. Nothing is changed by hand on a cluster unless it is also in git.
5. **Board**: the card is moved to Done, and the closing comment says how it was verified.

## Agents and the coordinator

Most work is done by autonomous agents, each owning one repository or workstream, under one coordinator.

- The coordinator splits the master plan ([plan](../plans/2026-10-16-discordy-master-plan.md), [agent brief](../plans/AGENT-BRIEF.md)) into issues and hands them out.
- An agent claims an issue (`board.sh claim <issue-url> <agent>` adds the label, assigns the owner and moves it to In progress), works in its own git worktree on a feature branch, opens a PR and moves the card as it goes.
- An agent changes only its own repository. Cross-repository needs go through the coordinator or an issue.
- Questions only the owner can answer are recorded as `needs:owner` instead of being guessed.

## Merge policy

- A PR needs green CI. The owner has authorised agents to merge their own PRs when CI is green (`gh pr merge --merge --delete-branch`, a merge commit, never a squash).
- No force pushes, and no skipping hooks.
- Production is changed only by a release: a tag on `main` ([below](#releases-and-versioning)) or a merge to `main` in `gitops`.

## Releases and versioning

Semantic versions, one per repository, cut by release-please from Conventional Commits. A merge to `main` of a service repo does not deploy by itself; the release tag `vX.Y.Z` builds the stable image and Flux rolls it out. The table of what triggers what, with timings, is in [Release](../runbooks/release.md#how-changes-reach-production). The standard release is: cut `release/X.Y.Z`, stabilise, merge into `main`, let release-please tag, back-merge into `develop`.

## Secrets rule

Secret values are never written to git, issues, PRs, logs or Notion. Docs describe where a secret lives (OpenBao path, GitHub secret name, DPAPI file), not what it is. The flow is GitHub secrets, then `secrets-sync`, then OpenBao, then External Secrets Operator, then Kubernetes Secrets ([ADR-0006](../adr/0006-secrets-flow.md), [inventory](../secrets/README.md)). The Notion sync withholds any line that looks like a token.

## Never-touch rules

- The existing **Voics** product (the Proxmox VM at 192.168.1.204, `voics.nl`, `app.voics.nl` and its DNS records) is never modified, not even read from automation. Discordy lives on its own VM `gen-serv` (192.168.1.212) and its own `discordy-*` hostnames.
- Existing DNS records are never edited; Discordy adds new one-level records only ([Cloudflare setup](../runbooks/cloudflare-setup.md)).
- Production gen-serv is adopted into Terraform by import only; `destroy` is never run against it ([Environments and IaC](06-environments-and-iac.md)).
- No payments and no capture of DRM-protected video ([ADR-0011](../adr/0011-no-drm-capture-watch-together.md)).

## Local hooks and the slim CI gate

GitHub-hosted minutes are budgeted (about 15 USD a month), so tests live in git hooks. Each repository has a committed `lefthook.yml`: `make hooks` installs a pre-push hook that runs the repository's lint and unit tests. On a pull request CI runs only lint/format, build/typecheck and unit tests (docs-only changes skip it), with a concurrency group that cancels superseded runs. Integration tests (testcontainers), the image build with Trivy, SBOM and cosign, and `cargo audit` run on develop, main, release/hotfix branches and tags (and a weekly scheduled run for audit), on the self-hosted `vm-runner` where a repository uses it.
