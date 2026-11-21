# 0002 — One repository per service in the `voics-app` org

- Status: accepted
- Date: 2026-10-16
- Deciders: @oussamaelhajoui
- Technical story: [spec §3](../specs/2026-10-16-voics-platform-design.md#3-containers-c2)

## Context and Problem Statement

The platform has eleven deliverables: `api`, `gateway`, `messages`, `voice`, `admin`, `client`, `bots-sdk`, `contracts`, `gitops`, `docs` and `.github`. They are built in parallel, in three languages, partly by autonomous agents. Should they live in one monorepo or in separate repositories?

## Decision Drivers

- Independent semver releases and GHCR images per service
- Parallel work without merge contention between workstreams
- Per-repo CI that fits within GitHub Free minutes
- Ownership boundaries that match the C2 containers

## Considered Options

1. A repository per service, with shared contracts and reusable workflows
2. A polyglot monorepo with a build tool (Bazel, Nx or Pants)
3. A monorepo with path-filtered workflows and no build tool

## Decision Outcome

Chosen option: **1**, a repository per service in the `voics-app` org (private at first; public except `gitops` since 2026-11-21, see [ADR-0007](0007-github-free-workarounds.md)).

- Repositories are coupled only through two published artifacts:
  - `contracts`, a semver-tagged package published for TS, Rust and Elixir.
  - The reusable workflows in `.github`.
- Deployment is coordinated in `gitops`.
- Every repository follows the same skeleton: README, ARCHITECTURE, Makefile, Dockerfile, `ci.yml` and release-please.

### Consequences

- Good, because release-please, image tags and Flux image policies map one-to-one onto repositories.
- Good, because agents and contributors work in isolation, and a red build in one service never blocks another.
- Bad, because a cross-cutting change such as a new event type needs coordinated PRs: `contracts` first, then each consumer. The pinned interfaces in the master plan and the contract tests reduce the risk.
- Bad, because shared tooling must be versioned. Consumers reference `@main` today and will move to tags later.

### Confirmation

The [service catalog](../services/catalog.md) lists exactly one repository per container. A new service gets a new repository, not a directory in an existing one.

## Pros and Cons of the Options

### Option 2 — Polyglot monorepo with a build tool

- Good, because cross-service changes are atomic and there is one dependency graph.
- Bad, because Bazel or Pants across Rust, Elixir and Electron is a large maintenance burden, and full-graph CI is expensive on GitHub Free.

### Option 3 — Plain monorepo

- Good, because it is the simplest way to start.
- Bad, because per-path release-please and image versioning get awkward, and parallel workstreams contend for the same branches.
