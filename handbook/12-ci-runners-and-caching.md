# CI runners and caching: the takeover guide

Summary: everything you need to run, change and debug CI on its own: where jobs run, what is preinstalled, what is cached and how it is keyed, how to switch caching on and off, what to do when you change a cached thing, the quirks we hit, and the measured speeds.

Last reviewed: 2026-11-03 (`.github` v0.6.3). Story: [gitops#59](https://github.com/discordy-voics/gitops/issues/59) (persistent cache), [gitops#63](https://github.com/discordy-voics/gitops/issues/63) (speed and inefficiency review). Safety rules: [ADR 0022](../adr/0022-ci-cache-safety-rules.md). Runner setup commands: [CI/CD and runners](05-ci-cd-and-runners.md).

## The big picture in five sentences

1. Every repository's `ci.yml` calls reusable workflows in the `.github` repository (`rust.yml`, `elixir.yml`, `node.yml`, `docker.yml`, `gitflow-guard.yml`), always `@main`. A change there affects every repository at once.
2. Jobs run on the self-hosted VM runners (label `vm-runner`, 2 runners on VM `192.168.1.219`), or on GitHub-hosted `ubuntu-latest` when the variable `CI_RUNNER` is unset or `github`.
3. The same workflow code serves both. A step called **CI cache policy** at the start of each job decides, writes `CI cache: on=… (why)` to the log and the job summary, and everything after it follows that decision.
4. On the VM, toolchains are baked into the runner image and build outputs live on a persistent `/cache` volume. On GitHub runners nothing is preinstalled for us, so the normal setup actions and the GitHub Actions cache are used.
5. Releases never reuse a persistent build directory, and caching can always be turned off with one variable or one PR label.

## Where a job runs

```text
runs-on = (CI_RUNNER set and != "github") ? CI_RUNNER : "ubuntu-latest"
```

| `CI_RUNNER` (repository variable, or organization variable as fallback) | Jobs go to |
|---|---|
| `vm-runner` (current value in all 12 repositories) | the two VM runners |
| unset, or `github` | GitHub-hosted `ubuntu-latest` (costs GitHub minutes; $15/month budget) |
| any other label | runners registered with that label (a PC, another VM) |

- A **repository** variable beats an organization variable, so you can move a single repository: `gh variable set CI_RUNNER -R discordy-voics/<repo> -b github`, and later `gh variable delete CI_RUNNER -R discordy-voics/<repo>`.
- `.github/scripts/runner.sh use github` or `use vm-runner` switches every repository at once.
- Jobs that name a runner explicitly ignore `CI_RUNNER`: `windows-latest` for the desktop installer, the in-cluster `discordy` runners for secrets-sync and minio-publish.
- If `CI_RUNNER` names a label with no online runner, jobs queue forever without failing. That is the first thing to check when CI "hangs".

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

The named Docker volume `discordy-ci-cache-vm-runner` is mounted at `/cache` in both runner containers and survives `runner.sh down`/`up`.

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
| Everything on GitHub runners | `scripts/runner.sh use github` | every repo | `scripts/runner.sh use vm-runner` |

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
| `CI_RUNNER=github` | used to queue jobs forever for a non-existent runner label "github" | the expression maps `github` to `ubuntu-latest` |
| `CI_RUNNER` beats the workflow's `runs-on` input | a test meant for hosted runners still lands on the VM | set or delete `CI_RUNNER` on the repo instead |
| Runners use the host's Docker | `docker run -v <path>` mounts a **host** path | the work dir is at the same path on host and container (`/srv/discordy-runner/<container>/_work`) |
| The VM disk filled to 100% (2026-11-02) | release builds wrote cold targets into the workspace; every job failed | clean builds go to `$RUNNER_TEMP`, the disk guard, and the disk grown to 146 GB |
| A `ci-no-cache` label added after the run started | has no effect on a re-run | push a commit |
| Docker Desktop on a PC runner | testcontainers reach containers via `host.docker.internal`, not `localhost` | `runner.sh` sets `TESTCONTAINERS_HOST_OVERRIDE` |
| ScyllaDB tests skip themselves | the VM CPU type lacks SSE4.2/PCLMUL | the Proxmox CPU type must be `host` |
| `runner.sh up` while a job runs | kills it (happened twice) | check `runner.sh status` first; re-run the killed job |
| Windows builds | a native Windows runner picked WSL `bash.exe` | the installer builds on GitHub `windows-latest`; no self-hosted Windows runner |
| An empty `.dockerignore` | sent 18.8 GB of context; the api image took 835 s | `.dockerignore` is reviewed in every Dockerfile PR |

## How to read a run

- The first step of each job prints `CI cache: on=<true|false> reuse-target=<true|false> (<why>)`. The why is one of: persistent cache on, GitHub-hosted runner, no writable /cache volume, CI_CACHE=off, PR label ci-no-cache, scheduled cold build.
- The Rust step prints `target: persistent target <key>`, `target: clean target, in $RUNNER_TEMP`, `clean target (low disk)` or `private clean target (key locked by another job)`, and the sccache stats at the end.
- The Elixir step prints `using baked otp-29.1.2 and elixir-1.20.5-otp-29`, or `no baked Erlang/Elixir for otp=… elixir=…: setup-beam installs them`.
- Job and step durations: `gh api repos/discordy-voics/<repo>/actions/runs/<id>/jobs`.

## Measured speeds

The full table (VM with cache, VM without cache, GitHub-hosted, before and after each optimization, as factors) is kept on [gitops#63](https://github.com/discordy-voics/gitops/issues/63) and the Notion page **CI speed reference**. Headline numbers, medians in seconds:

| Job | GitHub-hosted (before 10-23) | VM, no cache | VM, cache |
|---|---|---|---|
| api PR test | 63 | 576 | 60 to 273 |
| messages test | 94 | 378 | 84 to 320 |
| gateway test | 30 | 235 | 51 |
| api docker image | 582 | 680 | 108 |
| api tag docker job | | about 650 | about 95 |

Plain test jobs are about as fast on GitHub's runners as on the warm VM (their CPUs are faster per core). Image builds and anything that profits from a warm build directory are 5 to 7 times faster on the VM.

## Who to ask, where to look

- Code: `discordy-voics/.github`, `.github/workflows/*.yml` and `scripts/runner.sh`; the README there has a short "CI cache" section.
- Decisions: [ADR 0022](../adr/0022-ci-cache-safety-rules.md).
- Runner setup and VM operations: [CI/CD and runners](05-ci-cd-and-runners.md).
- Incident history: [runbooks](../runbooks/).
