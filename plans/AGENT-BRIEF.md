# Brief for Voics workstream agents

You are one of several autonomous agents building **Voics**, a Discord-equivalent platform, in parallel. Each agent owns exactly one repository and must not modify any other repository.

## Read first, in this order
1. `C:\Users\Karma\Projects\discordy\voics\docs\specs\2026-10-16-voics-platform-design.md` (the spec)
2. `C:\Users\Karma\Projects\discordy\voics\docs\plans\2026-10-16-discordy-master-plan.md`: **Global Constraints**, the **Pinned interfaces P1–P11** (these are binding), and your workstream section.

## Environment
- **OS**: Windows 11. Use the Bash tool (Git Bash) or PowerShell.
- **Toolchains**: Rust 1.99 (`~/.cargo/bin`), Elixir 1.20 / OTP 29 (`/c/Program Files/Elixir/bin`, `/c/Program Files/Erlang OTP/bin`), Node 24, pnpm, Docker 28. If a tool isn't on PATH, prepend those paths.
- **Docker containers**:
  - Never bind the fixed host ports listed in P1. Other agents and the coordinator need them.
  - Use testcontainers (random ports), or `docker run -P` with dynamically mapped ports.
  - Name containers `<your-repo>-*` and remove them when you're done.
- **Rust**: if a crate is hard to build natively on Windows (for example `rdkafka`, which needs cmake), prefer a pure-Rust alternative such as `rskafka`, or the `cmake-build` feature. Builds must also work inside the Linux Dockerfile.
- **Elixir**: use Docker images `hexpm/elixir:1.20.x-erlang-29.x-alpine-*` (or the nearest available tag; check with `docker pull`) for the Dockerfile.

## Rules
- **git-flow**:
  - Your repo already exists with `main` and `develop`, and `develop` is checked out.
  - Create `feature/<repo>-bootstrap`, commit there in small Conventional Commits, and when finished merge into `develop` with `git merge --no-ff`.
  - Do not touch `main`.
  - Every commit message ends with a blank line followed by `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Add a `.gitattributes` containing `* text=auto eol=lf`.
- **TDD** for domain and application logic: write the failing test, watch it fail, implement, watch it pass, commit.
- **Clean Architecture**:
  - Folders `domain/`, `application/` (use cases plus ports), `infrastructure/` (adapters), `interface/` (HTTP/WS), and a composition root.
  - `domain` has no framework or IO dependencies.
  - SOLID, small focused files, intention-revealing names, no dead code, no TODO placeholders in shipped code.
- **No secrets in source**:
  - Config comes only from environment variables, using the exact names from P2, and is validated at startup.
  - Ship a `.env.example` containing dev-only values.
  - `.gitignore` must cover `.env`.
- **Required files**: `README.md` (purpose, run locally, test, configuration table), `ARCHITECTURE.md` (with a C4 component diagram in Mermaid), `Makefile` (`dev`, `test`, `lint`, `build`, `docker`), a multi-stage non-root `Dockerfile` with OCI labels, `.github/workflows/ci.yml`, `CHANGELOG.md`, `release-please-config.json` and `.release-please-manifest.json` (version `0.1.0`).
  - `ci.yml` calls the reusable workflows: `uses: discordy-voics/.github/.github/workflows/<rust|elixir|node|docker>.yml@main`, with inputs `image-name` and `description`.
- **Contracts**:
  - The `contracts` repo is being generated in parallel.
  - Until it's published, define your DTOs and constants locally in your `interface` or `infrastructure` layer, exactly matching the pinned shapes in the plan.
  - Isolate them in one module named `contracts` so they can later be swapped for the generated package.
- **Don't stop early**: implement every task in your workstream completely.
  - If something is genuinely blocked (for example it needs the GitHub org or the VM), finish everything else.
  - Document the blocked step precisely in your repo README under "Pending owner actions".
- **Verify before you claim done**: run the full test suite, the linters (`cargo clippy -- -D warnings` / `mix format --check-formatted` + `mix credo` / `eslint` + `tsc --noEmit`) and `docker build`. Report actual results.

## Final report (your last message)

Keep it under 300 words:
- What you built.
- Test, lint and docker build results, with numbers.
- The branch merged into `develop`.
- Any deviations from the pinned interfaces, and why.
- Anything still pending.

## Kanban board (mandatory)
The board is the org project "Voics": https://github.com/orgs/discordy-voics/projects/1. Every issue is assigned to @oussamaelhajoui, and each one carries the label `agent:<your-agent-name>`. Use the helper `bash /c/Users/Karma/.discordy/board.sh`:
- `board.sh list <repo>` shows your repo's issues and their status.
- `board.sh claim <issue-url> <agent-name>` runs **before** you start an issue. It adds the label, assigns the owner and moves the card to In progress.
- Keep only **one** issue In progress at a time. Move the issue you'll do next to Ready with `board.sh move <url> ready`.
- When an issue is implemented and its tests pass but it isn't merged yet, run `board.sh move <url> in-review "<what was verified>"`.
- When it's merged into develop and pushed, run `board.sh move <url> done "<commit + test results>"`. This also closes the issue.
- If something you need is missing from the board, open an issue in your repo and add it with `board.sh move <url> backlog`.
