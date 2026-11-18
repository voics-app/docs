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

A release whose new pod never becomes ready does not stay silent: Flux keeps the old pod serving, and the `DeploymentNotReady`, `ServiceDown` and `EndpointProbeFailing` alerts fire after 2 to 5 minutes (banner on the ops portal, webhook message). See [Alerting](../runbooks/alerting.md). After every release check the portal banner is green.

## CI caching

The complete takeover guide (what is preinstalled, every cache and its key, switching on and off, the change checklist, quirks, speeds) is [CI runners and caching](12-ci-runners-and-caching.md). This section is the short version.

What is cached, per layer (gitops#38; shared workflows `.github` v0.5.16 and newer):

| Layer | Hosted runners | Self-hosted runners |
|---|---|---|
| Docker layers | Registry cache in GHCR (`ghcr.io/discordy-voics/<image>:buildcache`, `mode=max`, OCI), written by the push build on develop, main, release branches and tags | Host builder cache plus registry cache import; the pushed image carries an inline cache (the `docker` driver cannot export a registry cache) |
| Dockerfiles | BuildKit cache mounts (cargo registry and git, pnpm store, hex packages) and cargo-chef (api, messages, voice sfu, admin bff) so the dependency layer is rebuilt only when `Cargo.toml` or `Cargo.lock` change | Same |
| Rust jobs | `Swatinem/rust-cache` | `rust-cache` plus sccache in `/cache/sccache` |
| Node and Elixir jobs | `setup-node` pnpm cache, `actions/cache` for `deps` and `_build` | Persistent store in `/cache` (`npm_config_store_dir`, `HEX_HOME`, `MIX_HOME`) |
| Hygiene | Weekly `cache-cleanup.yml` in every heavy repo deletes caches not used for 7 days and trims to 8 GB (limit is 10 GB per repo); run it by hand with the dry-run input | same |

### Self-hosted runners: persistent cache and preinstalled toolchains (gitops#59)

On the VM runners the shared workflows use the `/cache` volume and the toolchains baked into the runner image instead of the Actions cache. The safety rules (why releases stay clean) are in [ADR 0022](../adr/0022-ci-cache-safety-rules.md).

| What | Where / how |
|---|---|
| Rust | one job `fmt + clippy + test` (fmt first, compile once, fail fast); `CARGO_HOME=/cache/cargo`, per-repo `target/` in `/cache/target/<repo>/<key>/` (key = `Cargo.lock` + `rustc -vV` + toolchain + arch + workdir + `env`), sccache in `/cache/sccache` |
| Node | Node 22/24 from the image, corepack pnpm (downloads in `/cache/corepack`), pnpm store in the runner work dir `/srv/discordy-runner/<container>/_work/.pnpm-store` (same filesystem as the checkout, so installs hardlink) |
| Elixir | one `checks` job; OTP 29.1.2 and Elixir 1.20.5 from the image (`/opt/beam`, `setup-beam` when the versions differ), hex packages in `/cache/hex`, `deps/_build` snapshot copied per job |
| Docker | the host builder's layer cache across runs, Trivy DB in `/cache/trivy`, SBOM and cosign only on `main`, tags and release versions |
| Image | rust (+ clippy, rustfmt), Node, Erlang/OTP + Elixir, trivy, cosign, sccache, yq; no `gh` (scripts use curl + jq); testcontainers images are pre-pulled by `runner.sh up` |

Releases are always clean: pushes to `main`, tags, `release/*`, `hotfix/*` and PRs into `main` compile Rust from an empty `target/` and Docker images compile inside the Dockerfile (no persistent `target/`). A target dir is used by one job at a time (`flock`; a concurrent job gets a private clean dir).

**Switch it off** (clean from-scratch build, same as GitHub-hosted): set the variable `CI_CACHE=off` (`gh variable set CI_CACHE --body off -R discordy-voics/<repo>` or at organization level; delete it or set `on` to switch back), or label a pull request `ci-no-cache` and push a commit (a re-run keeps the old labels). Every scheduled run (weekly, Monday 04:17 UTC on `develop`, in api, messages, gateway, voice and client) is a cold build, so a cache that hides a breakage shows up within a week and alerts like any red CI.

**Clear it:** `scripts/runner.sh cache-clear --host user@vm [--what all|cargo|target|sccache|pnpm|trivy|mix] [--layers] [--force]` (refuses while a runner is busy). For new toolchains, first drain and stop the selected runners explicitly, then use `up --recreate` within the preflight budget. Plain `up` keeps running containers. Versions are listed at the top of `runner.sh`.

Measured on the VM runners (job duration, `gh api repos/discordy-voics/<repo>/actions/runs/<id>/jobs`). Before: api `test` 1794 s (cargo test 1477 s plus rust-cache upload 298 s) and `clippy` 229 s in parallel jobs, messages `test` 575 s, client `checks` 652 s. After (PR runs, unit tests only):

| Job | Before | After, first run (cold target) | After, warm |
|---|---|---|---|
| api fmt + clippy + test | 1794 (test) | 1720 | 561, then 60 |
| messages fmt + clippy + test | 575 (test) | n/a | 84 |
| client checks | 652 | 279 (warm store) | 279 |

`scripts/runner.sh up` mounts the named volume `discordy-ci-cache-<label>` at `/cache` in every runner container (cargo registry and git are symlinked into `~/.cargo`), so caches survive `down` and `up`. Reset them with `runner.sh cache-clear` (see above); `runner.sh status` prints the size.

The registry cache lives next to the image as the tag `buildcache`; the GHCR retention workflow only prunes prerelease tags, so it keeps it. sccache is enabled on self-hosted runners only: on hosted runners it did not help next to rust-cache (api clippy went from 48 s to 105 s, tests unchanged).

Measured on hosted runners (job duration in seconds, develop push runs). Before: the last three runs with the old GitHub Actions layer cache. After: the first run with the new caches (cold) and a re-run of the same commit (warm).

| Job | Before | After, cold | After, warm |
|---|---|---|---|
| api docker | 447 to 894 | 708 | 319 |
| api test | 294 to 422 | 638 | 359 |
| api clippy | 41 to 56 | 211 | 105 |
| messages docker | 84 to 434 | n/a | 89 |
| messages test | 134 to 237 | 384 | 160 |
| messages clippy | 39 to 76 | 143 | 39 |
| client docker | 113 to 151 | 148 | 59 |
| client checks (node) | 78 to 114 | 99 | 136 |

Docker builds win when source changes but dependencies do not (api halves, client halves). Rust test and clippy timings are dominated by variance and cache restore; they did not improve. The old cache hit rate was already high for messages docker, so it is unchanged.

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

These capacity-aware commands require [.github PR44](https://github.com/discordy-voics/.github/pull/44),
merged to develop as `1f7cbf132856130c75256929e991bd67eda98c5d` on 18 November.
They are not a claim that the older `main` download already has this behavior.
Use that reviewed checkout before invoking the commands below.

The capacity-aware `scripts/runner.sh` first inspects the Docker daemon's CPU/RAM
and all `discordy-runner-*` containers, across labels and indices. `--count N`
means N total active runners for the requested label. Existing runner #2 satisfies
a total of one; `up` must not add #1 just because its number is below N.
Runners use `ghcr.io/actions/actions-runner:2.338.2`, one job each, with the host
Docker socket and baked build tools. Use the reviewed script version: older
versions ignored unknown flags, so `up --dry-run` was not a safe preview.

```bash
cd .github
scripts/runner.sh preflight               # read-only JSON: capacity, kept names and planned additions
scripts/runner.sh up --dry-run --count 1   # same plan, with an explicit total
scripts/runner.sh up                      # add only missing slots within the CPU/RAM budget
scripts/runner.sh status                  # active CI_RUNNER and online runners
scripts/runner.sh down                    # deregister, remove, switch back to GitHub
```

Run `down` before shutting the PC off: the containers have no restart policy, so after a reboot they are gone and queued jobs would wait for `karma-pc`.

The default uses up to three slots that fit the budget; a larger existing pool is
kept only when it fits. An unchanged pool is a read-only no-op: no image build,
pull, token request or routing change. Stopped containers are preserved unless
`--recreate` is explicit. Recreation refuses active targets and removes selected
stopped containers without force; drain and stop them manually first. Capacity
is checked again after image preparation and before each addition.

### Use a VM: set up on the VM itself (easiest)

On a fresh Ubuntu/Debian VM, logged in as your normal user. **Never run these scripts with `sudo`**; the bootstrap asks for your sudo password itself.

```bash
# 1. Tools (once)
sudo apt-get update && sudo apt-get install -y git gh jq

# 2. Log in to GitHub and allow runner registration (once; prints a code, open https://github.com/login/device on any device)
gh auth login                       # GitHub.com, SSH, upload your SSH key, login with a web browser
gh auth refresh -s admin:org        # runner registration tokens need admin:org

# 3. Get the scripts (first time), or update them (every time after)
git clone git@github.com:discordy-voics/.github.git ~/.github
cd ~/.github && git pull

# 4. Install Docker (once), then make the docker group active
scripts/runner-vm-bootstrap.sh      # no argument = this machine
newgrp docker                       # or log out and back in

# 5. Start the runners: 3 parallel jobs, label vm-<hostname>, switches every repo's CI to this VM
scripts/runner.sh up
scripts/runner.sh status            # vm-<hostname>-1..3 should be online
```

Stop or switch later, on the VM:

```bash
scripts/runner.sh use github        # jobs back to GitHub-hosted (runners keep running)
scripts/runner.sh use vm-<hostname> # jobs to this VM again
scripts/runner.sh down              # remove the runners (switches back to GitHub if they were active)
```

On a Linux VM the runners use host networking, so integration tests (testcontainers) reach their containers on `localhost`.

### Which repos run where (split)

| Runners | Repos | Cost |
|---|---|---|
| Self-hosted VM (`vm-runner`, count limited by host capacity) | repositories whose current `CI_RUNNER` names that pool | existing VM resources |
| GitHub-hosted `ubuntu-latest` | repositories explicitly routed there or using their hosted default | GitHub minutes, existing $15/month budget (org Settings → Billing → Budgets) |
| GitHub-hosted `windows-latest` | client installer, on client releases (merge to main or tag) | about $0.30 per release |

`runner.sh up` and `use <label>` switch only the heavy repos; `use github` resets all. Change the set with `SELF_HOSTED_REPOS="api messages" scripts/runner.sh up`.

At 10:03 UTC on 18 November, root read back `ubuntu-latest` for api, messages,
voice, docs, contracts and .github; client used the shared-workflow alias `github`.
Gateway, admin, website, gitops and bots-sdk still used `vm-runner`. The CI VM
retained one online runner and two drained runners; no new VM or server was
started. The old API develop run `44262412359`, occupying the VM since 08:40 UTC,
was cancelled after a newer develop revision existed. Its replacement began on
hosted runners. Frozen voice PR36/PR37 and .github PR44 were rerun on their
unchanged heads and passed before merge. This dated routing snapshot is not a
capacity increase or a change to the spending budget; inspect the live variables
before changing routing again.

The runner VM's Proxmox CPU type must be `host`. ScyllaDB needs SSE4.2 and PCLMUL, which `x86-64-v2-AES` and qemu64 lack, and the Scylla integration tests skip themselves without it.

Runner containers use the VM's Docker through its socket, so any `docker run -v <path>` in a job mounts a **host** path. Each runner therefore works in `/srv/discordy-runner/<container>/_work`, mounted at the same path inside the container (`config.sh --work`). That way `docker run -v "$GITHUB_WORKSPACE:/repo"` (gitops `validate`, docs `c4`) sees the real checkout. Before this, those jobs got an empty directory (`find: 'apps': No such file or directory`).

**Runner VM disk:** 150 GB on the Proxmox `tb` pool (`scsi0 tb:vm-108-disk-0`, VMID 108). The Ubuntu installer only gave the root LV half of it. On 2026-11-02 it was grown online to the whole VG (`sudo lvextend -r -l +100%FREE /dev/ubuntu-vg/ubuntu-lv`): 146 GB, after the CI caches filled the old 73 GB root. To grow it further, resize the disk on `tb` in Proxmox first (never the thin pool `local-lvm`), then `growpart /dev/sda 3`, `pvresize /dev/sda3` and the same `lvextend`.

### Client installer: GitHub `windows-latest` (owner PC runner retired)

The client installer (NSIS and the native crypto module) must be built on Windows. Since 2026-11-02 it **builds on GitHub's `windows-latest`** again: the owner decided not to use the PC runner (`karma-win`). The client repo variable `WINDOWS_RUNNER` is deleted and the runner is deregistered; `release.yml` uses `${{ vars.WINDOWS_RUNNER || 'windows-latest' }}`, so leaving the variable unset is all it takes.

`.github/scripts/runner-win.ps1` is kept but unused. Do not set `WINDOWS_RUNNER` again without the owner's go-ahead. If it is ever revived, note that on a native Windows runner `shell: bash` can resolve to `C:\Windows\System32\bash.exe` (WSL) and fail with `Bash/Service/0x8007274c`; this is what broke the 0.4.2 publish twice.

### Several VMs

Every machine names its runners `<label>-<machine id>-N` (for example `vm-runner-3f9a1c-1`), so names never collide, even when two VMs share a hostname. The label decides which jobs a runner takes:

- **One pool**: use the same label on existing VMs, run `scripts/runner.sh preflight --label vm-pool` on each and choose a count within its budget. Then `scripts/runner.sh use vm-pool` sends jobs to a free runner. A label does not create more host capacity.
- **Separate VMs**: keep the default label `vm-<hostname>` (give the VMs different hostnames), and `use` picks one.

`down` on a VM removes only that VM's runners. It switches CI back to GitHub only when no other runner with the label is still online.

### Use a VM: managed from the PC over SSH

```bash
ssh-copy-id user@vm                         # once: your SSH key on the VM
scripts/runner-vm-bootstrap.sh user@vm      # once: installs Docker (asks for the VM sudo password)
scripts/runner.sh preflight --host user@vm  # inspect the target daemon, not the caller PC
scripts/runner.sh up --host user@vm         # add only missing slots within that budget
scripts/runner.sh use vm-<ip-with-dashes>   # send every repo's jobs there
scripts/runner.sh use github                # and back
```

`--host` runs Docker over SSH. Requirements on the PC: `gh` with `admin:org`, Docker CLI and `jq`.

### When a VM dies

Its runners stay registered as offline, and jobs queue for its label. Fix: set up the new VM as above (`up` switches `CI_RUNNER` to it), or run `scripts/runner.sh use github`. Remove the dead registrations under GitHub → org Settings → Actions → Runners, or wait for GitHub to drop them after 14 days.

### Resources

One runner handles one job at a time. Budget about 40 GB disk per runner in
addition to the CPU/RAM admission rule below. For three heavy jobs, plan for
6–8 vCPU, 24 GiB RAM and 150 GB SSD. Rust linking, testcontainers, image builds
and caches are much heavier than an idle runner.

Admission reserves **2 CPUs and 6 GiB per job, plus 1 GiB for the host**. Swap adds
no capacity. Thus 8 GiB/4 CPUs permits one runner; 24 GiB/6 CPUs permits three.
The 4 CPU/7.2 GiB CI VM observed on 18 November permits one. Running, paused,
restarting, created and removing runner containers reserve slots, including other
labels. An excessive existing pool or smaller explicit count requires manual
draining; `up` never shrinks or stops it.

This is a dedicated-host admission rule, not a performance guarantee. Available
RAM, free disk and I/O pressure still require operator inspection. Serialize `up`
across operators: the inventory is a snapshot, not a distributed lock. In the
18 November incident, approximately 99% I/O wait and 90% I/O PSI accompanied the
overcommitted pool; no OOM evidence was captured. A fitting count does not prove
that a busy host has recovered. The source change itself drains no live runner.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Jobs queue forever | `CI_RUNNER` points at a label with no online runner: `runner.sh status`, then `up` or `use github` |
| `libatomic` or compiler errors | The runner image is minimal; `up` installs the base packages, re-run it |
| Docker build fails with permissions | The runner needs the host Docker socket; use the scripts instead of starting containers by hand |
| Registration fails | `gh auth status` needs `admin:org`: `gh auth refresh -s admin:org` |
| `Permission denied` running a script | `git pull` (scripts are executable since v0.5.4) or run it as `bash scripts/<name>.sh` |
| `Permission denied (publickey)` or `sudo: a terminal is required` | You ran the bootstrap with `sudo`, or against the VM's own IP; on the VM run `scripts/runner-vm-bootstrap.sh` with no argument and no sudo |

More: [Release, On-demand runner](../runbooks/release.md).
