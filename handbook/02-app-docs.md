# docs

Summary: this repository: specs, plans, ADRs, runbooks, service catalog, secrets inventory, C4 model and the Notion mirror.

| | |
|---|---|
| Repository | `discordy-voics/docs` |
| Output | GitHub (source of truth) and the Notion space Home, Home Lab, Discordy |
| Tech | Markdown, Structurizr DSL, a Node script for the Notion mirror |

## Folder map

| Path | What is there |
|---|---|
| `handbook/` | This handbook. |
| `adr/` | Architecture Decision Records (MADR). Never rewrite an accepted ADR; supersede it. |
| `runbooks/` | Operating procedures, including `voice-regions/`. |
| `services/catalog.md` | Ports, env vars, SLOs and owners of every service. |
| `secrets/` | `inventory.yaml` (no values) and the generated `README.md` (`pnpm secrets:render`). |
| `protocols/` | Human-readable wire protocol references. |
| `specs/`, `plans/`, `research/` | Design specification, master plan and feature specs, research notes. |
| `c4/` | `workspace.dsl` is the only source for the diagrams; `rendered/` is generated (`make render`). |
| `scripts/notion-sync/` | The Notion mirror. |
| `CONTRIBUTING.md` | Clean code rules, git-flow, Conventional Commits and the Definition of Done. |

## Checks

`pnpm lint` runs markdownlint and the secrets inventory check; CI also runs a link check (lychee). Update the docs in the same PR as the change ([Documentation duties](../CONTRIBUTING.md)).

## Notion mirror

Every merge to `main` runs the `notion-sync` workflow, which updates this space. Details and how to re-run: [README, Notion mirror](../README.md#notion-mirror).
