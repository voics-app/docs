# .github

Summary: org defaults, the reusable CI workflows and the self-hosted runner scripts.

| | |
|---|---|
| Repository | `voics-app/.github` (the name must be exactly `.github`) |
| Tech | GitHub Actions reusable workflows, bash |

## Folder map

| Path | What is there |
|---|---|
| `.github/workflows/` | Reusable workflows (`on: workflow_call`): `rust.yml`, `elixir.yml`, `node.yml`, `docker.yml`, `release-please.yml`, `gitflow-guard.yml`, `ghcr-retention.yml`, `secrets-inventory-check.yml`, `minio-publish`. |
| `.github/ISSUE_TEMPLATE/` | Issue forms: bug report, feature request, platform change. |
| `.github/pull_request_template.md` | The PR template with the Definition of Done checklist. |
| `.github/CODEOWNERS`, `dependabot.yml` | Ownership and pin updates. |
| `profile/README.md` | The org profile. |
| `templates/dependabot.yml` | Template for service repositories. |
| `scripts/runner.sh` | Build, start, stop and switch self-hosted runners. |
| `scripts/runner-vm-bootstrap.sh` | Prepare a fresh VM for runners. |
| `scripts/pc-runner.sh` | Older entry point for the PC runner. |
| `tests/` | Unit tests that execute the embedded scripts (`make test`); `make lint` runs actionlint. |

Callers reference `voics-app/.github/.github/workflows/<name>.yml@main`. How the pipelines and runners work: [CI/CD and runners](05-ci-cd-and-runners.md).
