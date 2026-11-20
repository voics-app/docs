# CI runners and caching: the takeover guide

Summary: everything you need to run, change and debug CI on its own: where jobs run, what is preinstalled, what is cached and how it is keyed, how to switch caching on and off, what to do when you change a cached thing, the quirks we hit, and the measured speeds.

Last reviewed: 2026-11-03 (`.github` v0.6.3). Story: [gitops#59](https://github.com/discordy-voics/gitops/issues/59) (persistent cache), [gitops#63](https://github.com/discordy-voics/gitops/issues/63) (speed and inefficiency review). Safety rules: [ADR 0022](../adr/0022-ci-cache-safety-rules.md). Runner setup commands: [CI/CD and runners](05-ci-cd-and-runners.md).

## The big picture in five sentences

1. Every repository's `ci.yml` calls reusable workflows in the `.github` repository (`rust.yml`, `elixir.yml`, `node.yml`, `docker.yml`, `gitflow-guard.yml`), always `@main`. A change there affects every repository at once.
2. Linux jobs use the self-hosted pool labelled `vm-runner`. The runner VM is `192.168.1.219`. Docker Desktop can join the pool with additional runners.
3. A step called **CI cache policy** at the start of each job decides, writes `CI cache: on=… (why)` to the log and the job summary, and everything after it follows that decision.
4. On the VM, toolchains are baked into the runner image and build outputs live on a persistent `/cache` volume. Historical hosted-runner measurements below used setup actions and the GitHub Actions cache.
5. Releases never reuse a persistent build directory, and caching can always be turned off with one variable or one PR label.

## Where a job runs

`CI_RUNNER=vm-runner` routes shared Linux workflows and direct Linux jobs to the self-hosted pool. Inspect repository variables in **Settings → Secrets and variables → Actions → Variables**.

| Selector | Destination |
|---|---|
| `vm-runner`, empty, `github` or a legacy `ubuntu-*`, `windows-*` or `macos-*` value in the updated direct Linux selectors | The `vm-runner` pool |
| An explicit self-hosted Linux label | An online member of that pool |
| A native Windows or macOS job | A runner matching the job's platform labels |
| `discordy` | The in-cluster ARC runner for service-account operations |

```bash
gh variable get CI_RUNNER -R discordy-voics/api
gh api orgs/discordy-voics/actions/runners --jq '.runners[] | [.name,.status,.busy] | @tsv'
gh api repos/discordy-voics/api/actions/runs/RUN_ID/jobs --jq '.jobs[] | [.name,.status,.runner_name] | @tsv'
```

A repository variable takes precedence over the organization value. Use `scripts/runner.sh use vm-runner` from the shared repository to set the Linux pool for every project. When a job waits, compare its requested labels against the labels and status of available runners. Rerun the affected current check after fixing the routing. Keep release publishing on its intended branch and service account.

## What is preinstalled where

| Tool | VM runner image (`discordy-actions-runner:2.338.0`, built by `runner.sh up`) | GitHub-hosted `ubuntu-latest` |
|---|---|---|
| Rust | rustup with **1.99** + clippy + rustfmt in `/opt/rustup` | installed per job by `dtolnay/rust-toolchain` |
| sccache | 0.10.0 | not used (it made hosted runs slower) |
| Node | latest **22** and **24** in `/opt/node/<major>`; pnpm through corepack | `actions/setup-node` per job |
| Erlang/OTP + Elixir | **OTP 29.1.2** and **Elixir 1.20.5** in `/opt/beam` (checksummed builds.hex.pm tarballs) | `erlef/setup-beam` per job |
| Trivy, cosign | in the image (cosign v3.0.6, checksummed) | downloaded per job |
| jq, curl, yq, git, cmake, clang, build-essential, libssl-dev, python3 | in the image | preinstalled by GitHub (yq too) |
| `gh` CLI | **not installed**; scripts use `curl` + `jq` against the API | preinstalled |
| Docker | the host's Docker through `/var/run/docker.sock` (default `docker` driver) | Docker plus a `docker-container` buildx builder |
| Testcontainers images | pre-pulled by `runner.sh up` (`PREPULL_IMAGES`: postgres 16/17, valkey 8, scylla 2025.1, minio, redpanda) | pulled per job |

How "baked" is used: each setup step first checks whether the version the workflow asks for exists in the image (for example `/opt/beam/otp-29.1.2`). A version input like `29` or `1.20` matches the baked `29.1.2` / `1.20.5`. If it matches and the cache is on, the step only adds it to `PATH`. Otherwise the normal setup action installs it, so a version bump never breaks CI. It is just slower until the image is rebuilt.

All versions are variables at the top of `.github/scripts/runner.sh`: `RUST_TOOLCHAINS`, `NODE_MAJORS`, `SCCACHE_VERSION`, `COSIGN_VERSION`/`_SHA256`, `OTP_VERSION`/`_SHA256`, `ELIXIR_VERSION`/`_SHA256`, `PREPULL_IMAGES`, `PACKAGES`.

## What is cached where

### On the VM runners (cache on)

The named Docker volume `discordy-ci-cache-vm-runner` is mounted at `/cache` in runner containers on each host and survives `runner.sh down`/`up`.

| Cache | Location | Reused on | Key: what makes it start fresh |
|---|---|---|---|
| cargo registry and git downloads | `/cache/cargo` | every run with the cache on | content-addressed; cargo locks it |
| cargo `target/` | `/cache/target/<repo>/<key>/` | **only** PRs into develop and develop pushes | hash of `Cargo.lock`, `rustc -vV`, toolchain input, CPU arch, workdir, extra `env` input |
| sccache | `/cache/sccache` (capped at 4 GB; per-runner port `4300 + hash(runner) % 100`) | same as `target/` | compiler version, flags, file contents |
| pnpm store | `/srv/discordy-runner/<container>/_work/.pnpm-store` (the runner's work dir, **not** `/cache`) | every run with the cache on | content-addressed |
| corepack downloads | `/cache/corepack` | every run with the cache on | pnpm version |
| hex packages | `/cache/hex` | every run with the cache on | content-addressed |
| Elixir `deps/` + `_build` snapshot | `/cache/mixcache/<repo>/<key>/` | same as `target/` | `mix.lock`, OTP and Elixir versions |
| Trivy vulnerability DB | `/cache/trivy` | every run with the cache on | Trivy refreshes it itself |
| Docker layers | the host's builder cache, plus the `:buildcache` registry tag as import | develop and PR image builds | content-keyed layers; the cargo-chef layer is keyed by the dependency recipe |

Why the pnpm store is not on `/cache`: pnpm hardlinks files from the store into `node_modules`, which only works on the same filesystem. `/cache` is a different mount from the checkout, so pnpm silently fell back to copying (15.4 s instead of 2.8 s per install).

### On GitHub-hosted runners

Nothing persists between jobs, so the GitHub Actions cache (10 GB per repository) is used: `Swatinem/rust-cache` for Rust, the `setup-node` pnpm cache, `actions/cache` for Elixir `deps`/`_build`, and the GHCR registry cache (`ghcr.io/discordy-voics/<image>:buildcache`, `mode=max`) for Docker layers. The weekly `cache-cleanup.yml` trims the Actions cache. Rust runs as parallel `fmt`, `clippy`, `test` and `audit` jobs there; on the VM it is one `fmt → clippy → test` job so the workspace compiles once.

### Inside every Dockerfile (both runner types)

| Technique | Where | What it saves |
|---|---|---|
| cargo-chef: dependencies compile in their own layer, keyed by `Cargo.toml`/`Cargo.lock` | api, messages, voice sfu, admin bff | a source-only change does not recompile the dependencies |
| prebuilt cargo-chef binary (`ADD --checksum=…`, v0.1.78) instead of `cargo install` | same | 30 s → 7 s for that layer |
| BuildKit cache mounts for cargo registry, pnpm store, hex | all images | downloads |
| config layering: `config.exs` + `prod.exs` before `deps.compile`, `runtime.exs` only before the release | gateway, voice signaling | a `runtime.exs` change: 82 s → 8 s (gateway), 66 s → 6 s (signaling) |
| `.dockerignore` (excludes `.git`, `target`, `*.md`, env files, keys) | api and every other image | a README change: 60 s → 3 s; without it the build context was 18.8 GB |

## The rules that keep releases honest

The full reasoning is in [ADR 0022](../adr/0022-ci-cache-safety-rules.md).

| Rule | What it means in practice |
|---|---|
| Releases build clean | pushes to `main`, tags `v*`, `release/*`, `hotfix/*` and PRs into `main` never reuse a persistent `target/` or mix snapshot; clean builds compile in `$RUNNER_TEMP/target` (deleted after the job, so it never fills the disk) |
| Images compile from source | image builds compile inside the Dockerfile; no CI `target/` can leak in. A cold build imports no layer cache |
| One job per target dir | `flock -n` on `<key>.lock`; a second concurrent job gets a private clean dir instead of waiting |
| Weekly cold build | the Monday 04:17 UTC `schedule` run on `develop` (api, messages, gateway, voice, client) always runs with the cache off, so a cache that hides a breakage shows up within a week |
| No silent retries | a red cached run stays red; you decide whether to re-run cold |
| Bounded disk | idle target dirs (7 days, or beyond the 2 newest per repo) are pruned; the disk guard prunes all other repos' dirs under 15 GB free and builds clean under 8 GB |

### Tag builds do not repeat the checks

A tag `vX.Y.Z` is made on a `main` commit that already passed full CI. The `verified` job in `rust.yml`, `node.yml` and `elixir.yml` asks the API whether that same commit has a successful `main` push run of the same workflow. If yes, fmt/clippy/test/audit are skipped (job summary: "Checks skipped: commit … already passed in full on main") and only the image build runs. If the lookup fails for any reason, the checks run (fail safe). The release script (`.github/scripts/release.sh`) only tags after main CI is green, so the skip normally applies.

This needs `actions: read` on the token, which the organization default (contents and packages only) does not give. Every caller job that uses these workflows therefore declares:

```yaml
permissions:
  contents: read
  actions: read
  packages: read   # node callers only (private npm packages)
```

Without it, the run fails at startup with no jobs ("startup_failure").

## How to switch caching off and on

| You want | Do this | Scope | Undo |
|---|---|---|---|
| One PR built cold | add the label `ci-no-cache`, then **push a commit** (a re-run keeps the old labels) | that PR | remove the label, push |
| One repository cold | `gh variable set CI_CACHE -R discordy-voics/<repo> -b off` | every run of that repo | `gh variable delete CI_CACHE -R discordy-voics/<repo>` |
| Everything cold | `for r in api messages gateway voice admin client website gitops docs contracts .github bots-sdk; do gh variable set CI_CACHE -R discordy-voics/$r -b off; done` (per repository: on GitHub Free, private repositories cannot rely on organization-level settings, which is also why `runner.sh` sets `CI_RUNNER` per repository) | every repo | the same loop with `gh variable delete CI_CACHE -R discordy-voics/$r` |
| Wipe the cache | on the VM: `cd ~/.github && scripts/runner.sh cache-clear --what all\|cargo\|target\|sccache\|pnpm\|trivy\|mix [--layers]` | VM volume (+ Docker layers with `--layers`) | it refills on the next runs |

What "off" does: no `/cache`, no baked toolchain (Rust is installed fresh into `$RUNNER_TEMP`, Erlang/Elixir and Node through their setup actions), no Actions cache, a `no-cache` Docker build and a temporary Trivy DB. That is the same as a fresh GitHub-hosted machine.

`cache-clear` refuses while a runner is busy (a job could be writing). Wait, or add `--force` if you know the runners are stuck.

### Implications and risks

| Choice | Cost | Risk |
|---|---|---|
| Cache **on** (default) | fastest; warm api PR check about 60 s | a corrupt or stale cache could make a run green that a clean build would fail. Limited by: releases always clean, weekly cold build, keys that include the lockfile and toolchain |
| Cache **off** for a PR | that PR's checks take the cold time (api about 336 s, more if the VM is busy) | none for correctness; uses VM time |
| Cache **off** for everything | every run is cold: about 5 to 10 times slower on the VM | queues build up with only 2 runners |
| `cache-clear` | the next run of each repo is cold | never clear while a job runs (it refuses unless `--force`) |
| GitHub runners | minutes cost money; Docker image builds about 5× slower than the warm VM | none for correctness; the hosted path is the same code |

When to go cold: a PR is green but you suspect it should not be, a failure only reproduces on one runner, or a toolchain or lockfile change behaves strangely. If the cold run is red and the cached one green, the cache is wrong: run `cache-clear --what target` (or `mix`), and open an issue.

## When you change something: the checklist

| You change | You must also | Why |
|---|---|---|
| Rust toolchain in a repo (`rust-toolchain.toml`, the `toolchain` input, or the Dockerfile `FROM rust:<v>`) | bump `RUST_TOOLCHAINS` in `runner.sh`, then rebuild the runners (`runner.sh up` on the VM, when idle) | otherwise every job downloads the toolchain; the target key changes anyway, so the first run is cold |
| OTP or Elixir version (`elixir.yml` inputs or the caller) | bump `OTP_VERSION`, `ELIXIR_VERSION` **and both SHA256 values** in `runner.sh` (get them with `curl -fsSL <url> \| sha256sum`), rebuild the runners | a mismatch falls back to `setup-beam` (slower, still green); a wrong checksum fails the image build, and the old image keeps running |
| Node major | add it to `NODE_MAJORS`, rebuild | same fallback |
| pnpm version (`packageManager` in `package.json`) | nothing | corepack fetches it once into `/cache/corepack` |
| `Cargo.lock` / `mix.lock` | nothing | the key changes; the first run is cold, and sccache softens it |
| `RUSTFLAGS` or other cargo env | pass it through the workflow's `env` input, not a hidden env var | the key includes the `env` input; a hidden variable would reuse a target built with different flags |
| A new testcontainers image (a version bump in a test) | add it to `PREPULL_IMAGES` | otherwise the first job of the day pulls it (slow, but it works) |
| A shared workflow in `.github` | test on a PR in one service repo pinned to your branch (`uses: …@feature/x`) **on both runner types** (set the repo variable `CI_RUNNER=github` for one run), then release `.github` | every repository calls `@main`; a mistake breaks all CI at once |
| A reusable workflow that needs a new token permission | add it to the caller jobs' `permissions:` in every repo first | the org default token cannot grant it; a missing permission is a startup failure in every caller |
| A Dockerfile | keep the order: dependency manifests, dependency build, then sources; add new non-build files to `.dockerignore` | a `COPY . .` before the dependency build recompiles everything on every change |
| An Elixir `config/runtime.exs` | nothing | it is copied after `deps.compile` on purpose |
| The runner image itself | `runner.sh up` on the VM **only when both runners are idle** (`runner.sh status`) | it recreates the containers; a running job is killed |
| The cargo-chef version | update `CHEF_VERSION` and the `--checksum` in the four Dockerfiles together | the build fails on a checksum mismatch, by design |

## Quirks we learned the hard way

| Quirk | What happens | What we do |
|---|---|---|
| `gh` is not in the runner image | a script that calls `gh` fails, and if its error is swallowed it silently does nothing (the tag skip did that until v0.6.3) | use `curl` + `jq` against `$GITHUB_API_URL` with `$GITHUB_TOKEN` |
| Runners use the host's Docker | `docker run -v <path>` mounts a **host** path | the work dir is at the same path on host and container (`/srv/discordy-runner/<container>/_work`) |
| The VM disk filled to 100% (2026-11-02) | release builds wrote cold targets into the workspace; every job failed | clean builds go to `$RUNNER_TEMP`, the disk guard, and the disk grown to 146 GB |
| A `ci-no-cache` label added after the run started | has no effect on a re-run | push a commit |
| Docker Desktop on a PC runner | testcontainers reach containers via `host.docker.internal`, not `localhost` | `runner.sh` sets `TESTCONTAINERS_HOST_OVERRIDE` |
| ScyllaDB tests skip themselves | the VM CPU type lacks SSE4.2/PCLMUL | the Proxmox CPU type must be `host` |
| `runner.sh up` while a job runs | kills it (happened twice) | check `runner.sh status` first; re-run the killed job |
| Windows builds | a native Windows runner picked WSL `bash.exe` | Use Git for Windows Bash. `karma-win` registration is not yet verified; check availability and a safe job before relying on it. |
| An empty `.dockerignore` | sent 18.8 GB of context; the api image took 835 s | `.dockerignore` is reviewed in every Dockerfile PR |
| The runner updates itself | GitHub's runner auto-updates inside the container. The 2.338.0 → 2.338.2 update left `externals/node24/bin/npm` broken (`Cannot find module '../lib/cli.js'`), so every step that installs pnpm through `pnpm/action-setup` failed; cold client runs died after 14 s | self-hosted cold runs install pnpm with corepack instead. Also bump `IMAGE` in `runner.sh` to the latest runner release and rebuild when idle, so runners start from a clean install |

## Disk space: what grows, what cleans it, what to do when it is full

The runner VM has one 146 GB disk (Proxmox VM 108, disk on the `tb` pool). Everything below lives on it.

| What | Where on the VM | Typical size | Cleaned by |
|---|---|---|---|
| Rust build dirs | Docker volume `discordy-ci-cache-vm-runner`, path `/cache/target/<repo>/<key>/` | 25 GB | every Rust job (2 newest per repo, 7-day idle), disk guard under 15 GB free |
| sccache | volume, `/cache/sccache` | 2 GB | sccache itself (4 GB cap) |
| cargo downloads, hex, corepack, mix snapshots | volume, `/cache/cargo`, `/cache/hex`, `/cache/corepack`, `/cache/mixcache` | about 1 GB | stable; `cache-clear` by hand |
| Trivy DB | volume, `/cache/trivy` | 1.6 GB | Trivy (replaces it) |
| pnpm stores | `/srv/discordy-runner/<container>/_work/.pnpm-store` (one per runner) | 1 GB each | **daily maintenance** wipes one over 3 GB |
| Docker build cache | Docker's own storage (`/var/lib/docker`) | 17 GB before the first prune | **daily maintenance** keeps at most 15 GB and drops records unused for 14 days |
| Locally built images (`ghcr.io/discordy-voics/*`) | `/var/lib/docker` | 82 old tags, about 5 GB | **daily maintenance** removes those older than 24 h (they are already pushed to GHCR) |
| Leftover test containers | `/var/lib/docker` | small | **daily maintenance** (stopped for over 24 h) |
| Runner container logs | `/var/lib/docker/containers` | small | Docker (`max-size 20m`, 3 files per container) |
| Checkouts and job temp | `/srv/discordy-runner/<container>/_work` | 1 to 3 GB | the runner (`_temp` is emptied after every job) |
| Pre-pulled test images, runner image | `/var/lib/docker` | about 4 GB | never pruned (needed); refreshed by `runner.sh up` |

### Automatic cleanup

- **Daily maintenance:** the workflow `runner-maintenance` in the `.github` repo runs `scripts/runner-prune.sh` daily at 03:30 UTC on a VM runner.
  - It turns **red** when the disk is still under 20 GB free afterwards. GitHub then emails the owner, and the run summary shows free space before and after.
  - Run it by hand: GitHub → `.github` repo → Actions → runner-maintenance → Run workflow. It has two options: *dry run* (shows what would go) and *deep* (also wipes Rust targets and sccache).
- **Every Rust job** prunes its own repo's old target dirs. The disk guard prunes all repos' idle target dirs under 15 GB free and builds clean under 8 GB, so a full disk degrades to slow builds instead of failing.
- The prune never removes the CI cache volume, the runner image or the pre-pulled test images.

### Cleaning by hand

Log in to the runner VM with `ssh oussama@192.168.1.219`, then:

```bash
cd ~/.github && git pull                       # the scripts live in the .github repo clone in your home dir
df -h /                                        # how full is the disk
docker system df                               # Docker's share: images, build cache, volumes
scripts/runner.sh status                       # are the runners busy? (prefer cleaning when idle)

scripts/runner-prune.sh --dry-run              # what the daily prune would remove
scripts/runner-prune.sh                        # prune now (safe while jobs run)
scripts/runner-prune.sh --deep                 # also wipe Rust targets + sccache (next PR runs compile cold)

scripts/runner.sh cache-clear --what target    # or all|cargo|sccache|pnpm|trivy|mix; refuses while a runner is busy
scripts/runner.sh cache-clear --what all --layers   # everything incl. the Docker build cache: the next runs are all cold
```

What each one costs:

- `runner-prune.sh` costs almost nothing: the next image build of a repo whose layers were pruned is slower once.
- `--deep` and `cache-clear --what target` make the next PR run of each Rust repo cold (api about 5 minutes instead of 2).
- `--what all --layers` makes every first run cold.

### When the disk is full anyway (the 2026-11-02 incident)

**Symptoms:** many jobs fail at once, with "No space left on device" in checkout, cargo or Docker steps, or the runners go offline.

1. On the VM, run `df -h /` and `docker system df`, plus `docker run --rm -v discordy-ci-cache-vm-runner:/cache alpine du -sh /cache/*` to see what is big.
2. Run `scripts/runner-prune.sh`. If that is not enough, run `scripts/runner-prune.sh --deep`. Both are safe while jobs run.
3. Still full: `scripts/runner.sh cache-clear --what all --layers --force` (when the runners are stuck busy), then `docker system prune -af` as the last step. It also removes the pre-pulled images; `runner.sh up` pulls them again.
4. Re-run the failed jobs: `gh run rerun <id> --failed -R discordy-voics/<repo>`.
5. If it keeps happening, grow the disk:
   - In Proxmox (`https://192.168.1.88:8006`), VM 108 → Hardware → the `tb` disk → Disk Action → Resize. Never use the thin pool `local-lvm`.
   - Then on the VM: `sudo growpart /dev/sda 3 && sudo pvresize /dev/sda3 && sudo lvextend -r -l +100%FREE /dev/ubuntu-vg/ubuntu-lv`.
6. Keep CI routed to `vm-runner`. Verify another pool member is online while the affected host is under maintenance.

## How to read a run

- The first step of each job prints `CI cache: on=<true|false> reuse-target=<true|false> (<why>)`. The why is one of: persistent cache on, GitHub-hosted runner, no writable /cache volume, CI_CACHE=off, PR label ci-no-cache, scheduled cold build.
- The Rust step prints `target: persistent target <key>`, `target: clean target, in $RUNNER_TEMP`, `clean target (low disk)` or `private clean target (key locked by another job)`, and the sccache stats at the end.
- The Elixir step prints `using baked otp-29.1.2 and elixir-1.20.5-otp-29`, or `no baked Erlang/Elixir for otp=… elixir=…: setup-beam installs them`.
- Job and step durations: `gh api repos/discordy-voics/<repo>/actions/runs/<id>/jobs`.

## Measured speeds

Reference numbers, so a later change can be compared against them. All are job durations in seconds (`gh api repos/discordy-voics/<repo>/actions/runs/<id>/jobs`). Measured 2026-11-03 on `.github` v0.6.3 with the round-2 optimizations, on the same commits (PRs api#88, messages#50, gateway#34, client#175). Runs: VM with cache, VM with the `ci-no-cache` label, and GitHub-hosted (repo `CI_RUNNER=github`).

### PR checks: VM warm vs VM cold vs GitHub-hosted

| Repo, job | VM, cache on | VM, cache off (cold) | GitHub-hosted | Cache factor (cold ÷ warm) | VM warm vs hosted |
|---|---|---|---|---|---|
| api fmt + clippy + test | **109** | 325 | 169 wall clock (fmt 15, clippy 141, test 169 as parallel jobs; 325 runner-seconds) | 3.0× | VM 1.6× faster |
| messages fmt + clippy + test | **133** (300 in a run that shared the VM with api) | 247 | 162 wall clock (fmt 15, clippy 162, test 153) | 1.9× | VM 1.2× faster |
| gateway checks (Elixir) | **38** | 236 | 37 | 6.2× | equal |
| client checks (Node) | 210 | 191 | **121** | none (tests dominate) | hosted 1.7× faster |

What this means:

- **Rust and Elixir** profit from the persistent build dirs: 2 to 6 times faster than cold.
- **The client** does not. Its time is lint, typecheck and vitest on the CPU, and GitHub's runners have faster cores.
- **The VM is free** (no Actions minutes), runs two jobs at a time, and is fastest for anything that compiles.

### Before and after the whole effort (VM, PR checks)

| Job | Before (2026-10-23, VM without any cache) | Now, warm | Factor |
|---|---|---|---|
| api test (+ clippy job) | 1794 (+229) | 109 for fmt + clippy + test | 16× |
| messages test | 575 | 133 | 4.3× |
| gateway test | 235 | 38 | 6.2× |
| client checks | 652 | 210 | 3.1× |

### Docker image builds (develop pushes, VM, after round 2)

| Image | Source-only change | Dependency or Dockerfile change | GitHub-hosted, for reference |
|---|---|---|---|
| api | 56 | 174 to 367 | 319 warm, 467 to 708 cold |
| messages | 55 | 137 to 336 | 89 warm |
| gateway | 48 | 126 to 231 | 53 |
| client | 50 to 60 | 113 | 59 to 148 |
| voice sfu / signaling | 46 / 55 | 168 to 212 / 177 to 185 | |
| admin | 49 | 331 to 593 | |
| api tag build (docker job) | about 95 | | about 650 before the VM cache |

### Single optimizations (measured before and after, same machine)

| Optimization | Before | After | Factor |
|---|---|---|---|
| pnpm store on the same filesystem (hardlinks instead of copies) | 15.4 | 2.8 | 5.5× |
| gateway image after a `runtime.exs` change (config layering) | 82 | 8 | 10× |
| voice signaling image, same change | 66 | 6 | 11× |
| api image after a README change (`.dockerignore`) | 60 | 3 | 20× |
| cargo-chef prebuilt binary vs `cargo install` | 30 | 7 | 4.3× |
| api `cargo test --no-run`, `debug=line-tables-only` vs full debug info | 106 (13 GB) | 63 (4.2 GB) | 1.7× time, 3.1× disk |
| Release tag: checks skipped when main already passed | about 930 for the Rust job | image build only | the checks are skipped entirely |

Variance: a warm run can take twice as long when both runners compile at the same time, or when `Cargo.lock` changed (new cache key). Compare medians of a few runs, not one run.

## Who to ask, where to look

- Code: `discordy-voics/.github`, `.github/workflows/*.yml` and `scripts/runner.sh`; the README there has a short "CI cache" section.
- Decisions: [ADR 0022](../adr/0022-ci-cache-safety-rules.md).
- Runner setup and VM operations: [CI/CD and runners](05-ci-cd-and-runners.md).
- Incident history: [runbooks](../runbooks/).
