# CI/CD and runners

Summary: the pipelines of every repository, how a deploy reaches production, and how to build, run and switch CI runners.

## Pipelines

Every repository has a `ci.yml` that calls the reusable workflows of the `.github` repository ([.github](02-app-github.md)):

| Repository type | Workflows | Result |
|---|---|---|
| Rust services (api, messages, admin bff, sfu) | `rust.yml` (fmt, clippy, test, audit), then `docker.yml` | Image on GHCR, scanned with Trivy, signed with cosign, SBOM attached |
| Elixir services (gateway, voice signaling) | `elixir.yml` (format, compile, credo, sobelow, audit, test), then `docker.yml` | Same |
| Node (client, contracts, bots-sdk, website) | `node.yml` | Tests, build; client and website have their own release or publish jobs |
| Every PR | `gitflow-guard.yml` | Fails PRs from the wrong branch type |
| gitops | validator (kustomize, helm, kubeconform, inventory, memory budget) | Flux applies `main` |
| docs | markdownlint, secrets inventory check, link check | Notion mirror on `main` |

Images are tagged `X.Y.Z-dev.N` (develop), `X.Y.Z-rc.N` (release and hotfix branches) and `X.Y.Z`, `X.Y`, `latest` (tag). Production selects stable tags only.

## From tag to production

1. Tag `vX.Y.Z` on `main` (release-please) builds the stable image.
2. Flux image automation notices the tag and commits the bump to gitops `main`.
3. Flux applies it; timings and how to force it are in [Release, Timings](../runbooks/release.md#timings) and [Deploying now](../runbooks/release.md#deploying-now-without-waiting).

The website and the invite page publish on every merge to `main`; the desktop installer on a tag ([Desktop client release](09-desktop-client-release.md)).

## Where jobs run

GitHub-hosted `ubuntu-latest` is the default. When the GitHub Free minutes run low you can send every repository to your own machines and back with one command.

| Where | Label | How |
|---|---|---|
| GitHub-hosted (default) | `ubuntu-latest` | `scripts/runner.sh use github` |
| Owner PC (Docker Desktop) | `karma-pc` | `scripts/runner.sh up` starts the runners and switches |
| A VM | `vm-<host>` | bootstrap once, `up --host`, then `use vm-<host>` |
| In-cluster ARC | `discordy` | named explicitly by jobs that need the cluster network (secrets-sync, minio-publish) |
| GitHub-hosted Windows | `windows-latest` | the desktop installer build |

### How switching works

The shared workflows' default `runs-on` follows the caller repository variable **`CI_RUNNER`** when it is set. `runner.sh use <label>` sets that variable in every repository; `use github` deletes it. Jobs that name a runner explicitly keep it. This repository's own `notion-sync` workflow reads the same variable.

### Build a runner

`scripts/runner.sh up` starts `--count` containers (default 3) of `ghcr.io/actions/actions-runner:2.338.0`, one job each. Each registers at org level with the label, mounts the host Docker socket for image builds and installs the packages `ubuntu-latest` ships (`libatomic1`, build tools, cmake, clang, jq).

```bash
cd .github
scripts/runner.sh up                      # three runners on this PC, label karma-pc, switches CI_RUNNER
scripts/runner.sh up --count 5            # five parallel jobs on this machine
scripts/runner.sh status                  # active CI_RUNNER and online runners
scripts/runner.sh down                    # deregister, remove, switch back to GitHub
```

Run `down` before shutting the PC off: the containers have no restart policy, so after a reboot they are gone and queued jobs would wait for `karma-pc`.

### Use a VM

```bash
scripts/runner-vm-bootstrap.sh user@vm      # once: installs Docker Engine, adds the user to the docker group, log limits
scripts/runner.sh up --host user@vm --count 3
scripts/runner.sh use vm-<host>             # send every repo's jobs there
scripts/runner.sh use github                # and back
```

`--host` runs Docker over SSH, so the VM needs SSH access and nothing else. Requirements on your side: `gh` with `admin:org` (registration tokens), Docker and `jq`.

### Resources

One runner handles one job at a time and needs about 2 vCPU, 6 to 8 GB RAM and 40 GB disk. Rust builds (api, messages, sfu, native crypto) are the heaviest. A VM for three runners needs about 6 to 8 vCPU, 16 to 24 GB RAM and 150 GB disk, SSD preferred. An idle runner uses about 100 MB.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Jobs queue forever | `CI_RUNNER` points at a label with no online runner: `runner.sh status`, then `up` or `use github` |
| `libatomic` or compiler errors | The runner image is minimal; `up` installs the base packages, re-run it |
| Docker build fails with permissions | The runner needs the host Docker socket; use the scripts instead of starting containers by hand |
| Registration fails | `gh auth status` needs `admin:org` |

More: [Release, On-demand runner](../runbooks/release.md).
