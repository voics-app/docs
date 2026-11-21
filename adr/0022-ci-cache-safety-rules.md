# 0022 — CI caches and preinstalled toolchains: the safety rules

- Status: accepted
- Date: 2026-10-23
- Deciders: @oussamaelhajoui
- Technical story: [gitops#59](https://github.com/voics-app/gitops/issues/59)
- Related: [CI/CD and runners](../handbook/05-ci-cd-and-runners.md), [`.github` README, CI cache](https://github.com/voics-app/.github#ci-cache)

## Context and Problem Statement

CI ran on the two self-hosted VM runners as if they were fresh GitHub-hosted machines: every job installed its toolchain, downloaded and re-uploaded the Actions cache over the network and compiled from a cold `target/`. Measured on the VM: api `test` 1794 s (cargo test 1477 s plus 298 s of rust-cache upload), api `clippy` 229 s, messages `test` 575 s, client `checks` 652 s (setup-node 156 s, checkout 87 s, pnpm setup 49 s), Trivy 127 s. The runners keep their disk between jobs, so almost all of that is avoidable. A cache that makes CI faster but can make a release wrong is worse than no cache, so the rules below are part of the design, not tuning.

## Decision Drivers

- Roughly 10x faster feedback on the self-hosted runners
- A release artifact must never depend on what an earlier job left on disk
- The caches must be switchable and clearable by anyone, in one step, without a code change
- GitHub-hosted runners must keep working unchanged (the fallback while the VM is down)
- The VM disk is small (73 GB, 26 GB free at the time of writing)

## Considered Options

1. **Persistent volume `/cache` on the runners, toolchains in the runner image, safety rules enforced in the shared workflows** (chosen).
2. Keep the GitHub Actions cache and only tune it (rust-cache `save-if`, smaller keys). Still pays the network round trip on every job.
3. sccache only, no persistent `target/`. Safe, but a Rust workspace still relinks and rebuilds all workspace crates; measured gain is small next to a warm `target/`.
4. A remote build cache service (Bazel-style). Too much new infrastructure for one VM.

## Decision Outcome

Chosen option: **1**, with these rules. They are enforced in `rust.yml`, `node.yml`, `elixir.yml` and `docker.yml` of `voics-app/.github`; a step named "CI cache policy" in each job computes the switches and writes the decision to the job summary.

### What is cached, and where

| Cache | Location on `/cache` | Reused when |
|---|---|---|
| cargo home (registry, git) | `cargo/` | always on self-hosted with the cache on (downloads; cargo locks it) |
| cargo `target/` | `target/<repo>/<key>/` | pull requests and develop pushes only (rule 1) |
| sccache (compiled dependency units by content) | `sccache/` | same condition as `target/` |
| pnpm store, corepack downloads | `pnpm-store/`, `corepack/` | always with the cache on |
| hex packages | `hex/` | always with the cache on |
| Elixir `deps/` + `_build` snapshot | `mixcache/<repo>/<key>/` | same condition as `target/` |
| Trivy vulnerability DB | `trivy/` | always with the cache on |
| Docker layers | host BuildKit/classic builder cache | rule 2 |

Toolchains (rust 1.99 + clippy + rustfmt, Node 22 and 24, trivy, cosign, sccache, yq) are baked into the runner image `discordy-actions-runner:<ver>`; the setup steps detect them and skip the download. A toolchain that is not in the image is installed the normal way.

### The rules

1. **Releases never reuse a persistent cargo `target/`.** Pushes to `main`, tags `v*`, `release/*`, `hotfix/*` and pull requests into `main` (or from a `release/` or `hotfix/` branch) compile from a clean workspace `target/` (the Rust `test` and `clippy` build). Only pull requests and pushes to `develop` may use a persistent target directory. Download caches (cargo registry and git, pnpm store, hex) are content-addressed and are used everywhere.
2. **Docker image builds compile from clean sources.** Image builds compile inside the Dockerfile, so no persistent cargo `target/` can enter them; the build only reuses content-keyed layers (the cargo-chef dependency layer is keyed by the recipe) and download cache mounts. On self-hosted runners the host daemon's builder cache is reused across runs (`docker` driver), plus the registry cache import. A cold build (rule 5) runs both image builds with `no-cache` and imports no cache. SBOM and cosign signing run only on `main`, tags and explicit release versions, not on develop builds.
3. **Keys include everything that changes the output.** Target dirs are keyed by a hash of `Cargo.lock` (or the manifests when there is no lock), `rustc -vV`, the toolchain input, the CPU architecture, the working directory and the extra `env` input (RUSTFLAGS and friends). Elixir snapshots are keyed by `mix.lock`, OTP and Elixir versions. A lockfile or toolchain change selects an empty directory (a cold compile, softened by sccache, which is keyed by compiler version, flags and file contents).
4. **A target directory is never shared between concurrent jobs.** A job takes `flock -n` on `<key>.lock`; if another job holds it, the job uses a private clean `target/` in its workspace instead of waiting. Elixir jobs restore a per-job copy of a snapshot and publish a new snapshot with an atomic rename, first writer wins.
5. **The cache can always be turned off.** `CI_CACHE=off` (repository or organization variable; unset or `on` means on), the pull request label `ci-no-cache`, and any `schedule` run make the job a clean from-scratch build: no `/cache`, no baked toolchain (installed fresh into a temporary `RUSTUP_HOME`), no Actions cache, `no-cache` Docker build, temporary Trivy DB. GitHub-hosted runners (`runner.environment` is not `self-hosted`) never see `/cache` and keep the original parallel jobs and Actions cache. A label added after the run started takes effect on the next run; a re-run keeps the original event payload, so push a commit or use the variable.
6. **A weekly cold build.** The `schedule` trigger (`cron: 17 4 * * 1`, on the default branch `develop`) of every heavy repository (api, messages, gateway, voice, client) runs with the cache off, so a cache that hid a real breakage is found within a week. Its failure alerts like any red CI.
7. **No automatic retry with the cache off.** A red cached run is reported red. The documented response is to re-run with the cache off (set `CI_CACHE=off` or label the PR `ci-no-cache`, then push or re-run) and, if only the cached run fails, clear the cache with `scripts/runner.sh cache-clear`. We chose not to auto-retry because it doubles the cost of every genuine failure and would hide cache corruption instead of surfacing it; the weekly cold build already bounds how long an unnoticed cache problem can live.
8. **The volume stays bounded.** A job prunes target directories of the same repository that were idle for 7 days or are older than the 2 most recently used (never one that is locked by a running job). `runner.sh cache-clear [--what cargo|target|sccache|pnpm|trivy|mix|all] [--layers]` wipes it by hand and refuses while a runner of that label is busy.

### Consequences

- Good: a warm PR run skips the toolchain download, the cache upload and download and most of the compile; releases and the weekly job stay honest.
- Good: switch-off is one variable, on every repository, with no code change.
- Bad: two code paths (parallel jobs on hosted runners, one `fmt + clippy + test` job on self-hosted). Both are exercised: hosted when `CI_RUNNER` is unset, self-hosted otherwise.
- Bad: the cache lives on one VM disk. With more runner nodes each node has its own volume and warms up independently (see the cluster plan, gitops#20 and #21).
- Neutral: the Elixir toolchain was installed by `erlef/setup-beam` on every job at first; see the amendments.

## Amendments

- 2026-11-02 (`.github` v0.6.x, gitops#63): Erlang/OTP and Elixir are baked into the runner image (`/opt/beam`) and used when the requested versions match; `setup-beam` otherwise (GitHub-hosted, cold runs, other versions). The Elixir lint and test jobs are one `checks` job.
- 2026-11-02: clean builds compile in `$RUNNER_TEMP/target` instead of the workspace, and a disk guard prunes every idle target dir under 15 GB free on `/cache` and builds clean under 8 GB (the VM disk filled to 100%).
- 2026-11-02: the pnpm store moved from `/cache/pnpm-store` to the runner work dir, so pnpm can hardlink (same filesystem as the checkout).
- 2026-11-03 (v0.6.3): a tag build skips fmt, clippy, test and audit when the same commit already has a green `main` push run of the same workflow (`verified` job; fails safe by running the checks). Rule 1 still holds for the image build. Callers grant `actions: read`.
- The operational guide for all of this is [CI runners and caching](../handbook/12-ci-runners-and-caching.md).
