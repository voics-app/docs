# Contributing to Discordy

These rules apply to **every** repository in `discordy-voics`. The goal is a codebase any software engineer can pick up: predictable structure, small intention-revealing units, and decisions written down.

## Contents

1. [Clean Code rules](#clean-code-rules)
2. [Clean Architecture](#clean-architecture)
3. [SOLID with examples](#solid-with-examples)
4. [Testing](#testing)
5. [git-flow](#git-flow)
6. [Conventional Commits](#conventional-commits)
7. [Pull requests](#pull-requests)
8. [Configuration and secrets](#configuration-and-secrets)
9. [Documentation duties](#documentation-duties)

## Clean Code rules

1. **Names reveal intent.**
   - Prefer `resolve_effective_delivery_mode(channel, recipients)` over `calc(c, r)`.
   - Booleans read as predicates: `is_draining`, `has_permission`.
   - Never abbreviate domain terms.
2. **Functions are small and do one thing.**
   - Aim for under 20 lines.
   - Keep one level of abstraction per function.
   - If you need "and" to describe a function, split it.
3. **Keep arguments few.**
   - Use 0–3 arguments. Beyond that, introduce a value object, for example `HistoryQuery { channel_id, before, after, around, limit }`.
   - Avoid boolean flag arguments. Write two functions instead.
4. **No side effects hidden behind innocent names.** A function called `get_*` never writes.
5. **Command-query separation.** A function either changes state or answers a question, never both.
6. **Errors are typed.**
   - Domain errors are explicit enum variants or structs (`PermissionDenied`, `DeliveryModeConflict`), mapped to the contracts error envelope only in `interface/`.
   - Never return `null` or `nil` to signal failure.
   - Never swallow errors.
7. **No dead code.** No commented-out code, no TODO placeholders in shipped code. Open an issue instead.
8. **Comments explain *why*, not *what*.** If code needs a "what" comment, rename or extract until it doesn't.
9. **No magic numbers.** Use named constants, taken from `contracts` when the value is part of the protocol: `HEARTBEAT_INTERVAL_MS = 41_250`, `RESUME_WINDOW_SECS = 120`.
10. **Small files.** One use case per file, one adapter per file. A file over about 300 lines is a smell.
11. **Formatting is automated.** Use `cargo fmt`, `mix format` and `prettier`, and never argue about style in review.
12. **The boy-scout rule.** Leave every file you touch slightly cleaner, in a separate `refactor:` commit when the change is non-trivial.

## Clean Architecture

Every service uses the same four layers plus a composition root ([spec §4](specs/2026-10-16-voics-platform-design.md#4-code-architecture-c3c4-conventions--every-service)):

```text
src/
  domain/          entities, value objects, domain services, domain events, domain errors
  application/     use cases (one per file) + ports (traits / behaviours / interfaces)
  infrastructure/  adapters implementing ports: Postgres/Scylla repos, Kafka producer, HTTP clients
  interface/       HTTP/WS handlers, DTO mapping, auth extractors, error-envelope mapping
  main.rs / application.ex / main.ts   composition root: builds adapters, injects them into use cases
```

**The dependency rule: dependencies point inward only.**

```text
interface ──▶ application ──▶ domain
infrastructure ──▶ application (implements its ports) ──▶ domain
composition root ──▶ everything (wiring only)
```

| Layer | May import | Must not import |
|---|---|---|
| `domain` | the standard library, small pure crates (e.g. `thiserror`) | frameworks, IO, async runtimes, serde (for wire formats), databases |
| `application` | `domain` | axum/Phoenix/React, SQL drivers, Kafka clients |
| `infrastructure` | `application`, `domain`, drivers | `interface` |
| `interface` | `application`, `domain`, web framework | `infrastructure` (except through the composition root) |

**Per-language mapping**:

- **Rust** (`api`, `messages`, `admin-bff`, `sfu`): a workspace with crates `crates/domain`, `crates/application`, `crates/infrastructure`, `crates/interface` and `bin/<service>`. The crate graph enforces the rule at compile time.
- **Elixir** (`gateway`, `voice-signaling`): namespaces `lib/<app>/{domain,application,infrastructure,interface}`. Ports are `@callback` behaviours, and adapters are selected in `application.ex`. Run `mix xref graph --label compile-connected` in CI to catch inward violations.
- **TypeScript** (`client`, `admin-web`): feature-sliced folders `app / features / entities / shared`, with the same inward rule enforced by `eslint-plugin-boundaries`. Electron's main process, preload and renderer are separate entry points.

**Contracts types** (DTOs) belong to `interface/` and `infrastructure/`. They are mapped to domain types at the boundary and never leak into `domain`.

## SOLID with examples

### S: Single Responsibility

A module has one reason to change.

```rust
// Bad: one use case that validates, persists, publishes and formats HTTP.
// Good: the use case orchestrates; each concern sits behind a port.
pub struct CreateMessage<R: MessageRepository, P: EventPublisher, A: ChannelAccess> {
    repo: R, publisher: P, access: A, ids: Arc<dyn IdGenerator>,
}
impl<R, P, A> CreateMessage<R, P, A> {
    pub async fn execute(&self, cmd: CreateMessageCommand) -> Result<Message, MessageError> {
        let access = self.access.for_user(cmd.channel_id, cmd.author_id).await?;
        access.ensure_standard_delivery()?;          // domain rule
        access.ensure(Permission::SEND_MESSAGES)?;   // domain rule
        let message = Message::new(self.ids.next(), cmd)?;
        self.repo.insert(&message).await?;
        self.publisher.message_created(&message).await?;
        Ok(message)
    }
}
```

### O: Open/Closed

Extend behaviour by adding code, not by editing a switch.

```rust
// Decorator: request coalescing is added around the repository without changing it.
let repo = CoalescingMessageRepository::new(ScyllaMessageRepository::new(session));
let history = GetHistory::new(Arc::new(repo));
```

The same applies to a new event type: add a variant and a handler module; leave the existing handlers untouched.

### L: Liskov Substitution

Any adapter must honour its port's contract, including its error semantics.

```elixir
# Both satisfy NodeDirectory: list/1 returns [] (never raises) when a region has no nodes.
@callback list(region :: String.t()) :: [VoiceNode.t()]
defmodule EtcdNodeDirectory,   do: @behaviour NodeDirectory  # production
defmodule InMemoryNodeDirectory, do: @behaviour NodeDirectory  # tests
```

If the in-memory fake behaves differently from etcd (it raises where etcd returns `[]`), the tests lie. Shared contract tests run against both implementations.

### I: Interface Segregation

Ports are small and shaped by the client, not by the database.

```rust
// Good: the history use case only sees what it needs.
#[async_trait] pub trait MessageHistory { async fn history(&self, q: HistoryQuery) -> Result<Vec<Message>>; }
#[async_trait] pub trait MessageWriter  { async fn insert(&self, m: &Message) -> Result<()>; }
// Bad: one 25-method `MessageStore` trait that every use case and every fake must implement.
```

### D: Dependency Inversion

High-level policy depends on abstractions. The composition root picks the concrete adapters.

```rust
// bin/api/main.rs (the only place that knows about Postgres, Redpanda and argon2)
let users = PgUserRepository::new(pool.clone());
let hasher = Argon2idHasher::default();
let tokens = Ed25519TokenIssuer::from_pem(&config.jwt_private_key)?;
let register = RegisterUser::new(users, hasher, tokens, SystemClock, snowflakes);
let app = interface::router(AppState { register, /* … */ });
```

No global state, no service locators, no singletons reached from inside use cases.

## Testing

- **TDD for `domain` and `application`**: write a failing test, watch it fail, implement, watch it pass, commit.
- **Unit tests** use in-memory fakes of the ports. **Integration tests** run adapters against real dependencies through testcontainers, on random ports.
- **Table-driven tests** for algorithms: the permission calculator, delivery-mode resolution, bucket math and node selection. The gateway's permission tests mirror api's tables case for case.
- **Contract tests** against the `contracts` schemas for every DTO and event.
- **Test names** describe behaviour: `denies_send_when_role_overwrite_denies_even_if_everyone_allows`.
- **Never bind** the fixed P1 ports from tests.

## git-flow

| Branch | From | Merges into | Purpose |
|---|---|---|---|
| `main` | — | — | Released code only. Every merge is a release (tag `vX.Y.Z`). |
| `develop` | `main` (once) | `release/*` | Integration branch; always deployable to a dev environment |
| `feature/<ws>-<topic>` | `develop` | `develop` (`--no-ff`) | One feature or fix |
| `release/X.Y.Z` | `develop` | `main` and back into `develop` | Stabilisation; fixes only |
| `hotfix/X.Y.Z` | `main` | `main` and back into `develop` | Urgent production fix |

Rules:

- Never commit directly to `main` or `develop`. Open a PR from a feature, release or hotfix branch.
- Merge features with a merge commit (`--no-ff`), so the history shows feature boundaries.
- Keep feature branches short-lived. Rebase on `develop` while the branch is private; merge once it is shared.
- The `gitflow-guard` check rejects PRs from the wrong branch type ([ADR-0007](adr/0007-github-free-workarounds.md)).
- The full release procedure is in [runbooks/release.md](runbooks/release.md).

## Conventional Commits

The format is:

```text
<type>(<optional scope>): <imperative summary, lower case, no period, ≤ 72 chars>

<optional body: what and why, wrapped at 72>

<optional footers>
Co-Authored-By: Name <email>      (when pairing or using an assistant)
```

| Type | Use for | Version bump |
|---|---|---|
| `feat` | A user-visible feature | minor |
| `fix` | A bug fix | patch |
| `perf` | A performance improvement | patch |
| `refactor` | A code change with no behaviour change | — |
| `test` | Tests only | — |
| `docs` | Documentation only | — |
| `build` | Build system, Dockerfile, dependencies | — |
| `ci` | CI configuration | — |
| `chore` | Maintenance | — |
| `revert` | Reverting an earlier commit | depends |

- **Breaking changes**: add `!` after the type (`feat(api)!: rename delivery_mode values`) and a `BREAKING CHANGE:` footer. Before 1.0.0, this bumps the minor version.
- **Scopes**: use a module or area, for example `feat(voice): add MEDIA_SINK_WANTS handling` or `fix(gateway): resume buffer off-by-one`.
- **Granularity**: one logical change per commit, and every commit builds and passes tests.

release-please derives the version and the changelog from these messages, so a wrong type means a wrong release.

## Pull requests

- Title in Conventional Commit format; the description says **what**, **why** and **how it was tested**.
- CI is green: lint, test, build, scan, and `gitflow-guard`.
- Keep PRs small: under about 400 changed lines, excluding generated files.
- At least one review, by the code owner for the area.
- Anything that changes a pinned interface (P1–P11) needs a PR to the master plan and to `contracts` **first**.
- Any architectural change needs an [ADR](adr/README.md) in the same PR, or before it.

## Configuration and secrets

- Configuration comes **only from environment variables**, using the exact names from P2, and is validated at startup. The process exits with a clear message listing every missing or invalid variable.
- Each repository ships an `.env.example` containing **dev-only** values. `.env` is git-ignored.
- **Never commit a secret**, not even a test one that looks real. gitleaks runs in CI.
- A new secret needs an entry in [`secrets/inventory.yaml`](secrets/inventory.yaml), followed by `pnpm secrets:render`.

## Documentation duties

| You changed | Update |
|---|---|
| A container, component or relationship | [`c4/workspace.dsl`](c4/workspace.dsl), then `make render` |
| One of the four C4 code modules | [`c4/code/*.puml`](c4/code/) |
| An architectural decision | A new ADR in [`adr/`](adr/README.md) |
| Ports, env vars, image, SLOs or dependencies of a service | [`services/catalog.md`](services/catalog.md) |
| A secret | [`secrets/inventory.yaml`](secrets/inventory.yaml) |
| An operational procedure | The runbook in [`runbooks/`](runbooks/README.md) |
| A repository's local setup | That repository's README and [local-development.md](runbooks/local-development.md) |
