# Discordy docs

Architecture, decisions, references and runbooks for **Discordy**, a Discord-equivalent platform (without payments) built in the `discordy-voics` GitHub org. Git is the source of truth; the content is mirrored to Notion on every merge to `main`.

> Discordy lives at `discordy.voics.nl`. It is unrelated to the existing `voics.nl` / `app.voics.nl` product, which must never be touched.

## Start here

| If you want to… | Read |
|---|---|
| Understand the product and architecture | [Design specification](specs/2026-10-16-voics-platform-design.md) |
| See the implementation plan and pinned interfaces | [Master plan](plans/2026-10-16-discordy-master-plan.md) |
| See the diagrams | [C4 model](c4/README.md): [context](c4/rendered/structurizr-C1-SystemContext.svg) · [containers](c4/rendered/structurizr-C2-Containers.svg) · [deployment](c4/rendered/structurizr-Deployment-gen-serv.svg) |
| Know why something is the way it is | [Architecture Decision Records](adr/README.md) |
| Find a service's ports, env vars, owner or SLOs | [Service catalog](services/catalog.md) |
| Find a secret's purpose, path or rotation policy | [Secrets inventory](secrets/README.md) |
| Look up a wire protocol | [Protocol references](protocols/README.md) |
| Operate the platform | [Runbooks](runbooks/README.md) |
| Run everything locally | [Local development](runbooks/local-development.md) |
| Contribute code | [CONTRIBUTING](CONTRIBUTING.md) |

## Repository layout

```text
specs/        design specification (owned by the coordinator)
plans/        master implementation plan (owned by the coordinator)
c4/           Structurizr workspace.dsl, PlantUML code diagrams, rendered SVG/PNG
adr/          Architecture Decision Records (MADR)
services/     service catalog
secrets/      inventory.yaml (no values) + generated README.md
protocols/    gateway, voice, events and REST references
runbooks/     operational procedures (voice regions, OpenBao, backups, rotation, release, …)
scripts/      render-c4.sh, render-secrets.mjs
```

## Runbooks

- **Voice regions**: [adding a region](runbooks/voice-regions/adding-a-region.md) · [draining](runbooks/voice-regions/draining-a-region.md) · [failover](runbooks/voice-regions/failover.md) · [troubleshooting](runbooks/voice-regions/troubleshooting.md)
- **Platform**: [OpenBao unseal](runbooks/openbao-unseal.md) · [backup and restore](runbooks/backup-restore.md) · [secret rotation](runbooks/secret-rotation.md) · [Cloudflare setup](runbooks/cloudflare-setup.md)
- **Delivery**: [release (git-flow)](runbooks/release.md) · [local development](runbooks/local-development.md)

## Working on the docs

Requirements: Node 24, pnpm 10 and Docker.

```bash
make install       # markdownlint + yaml renderer
make lint          # markdownlint + secrets inventory check
make links         # lychee link check (Docker)
make render        # re-render every C4 view to c4/rendered/ (Docker)
make secrets-render
```

CI ([`.github/workflows/`](.github/workflows/)) runs markdownlint, the secrets-inventory check and the link check on every PR. The `c4` workflow validates the workspace and fails on stale renders. On `develop` and `main` it re-renders and commits.

## Pending owner actions

- **Notion mirror (WS10.4)**: the `notion-sync` workflow and the Notion page tree are created by the coordinator. It needs a `NOTION_TOKEN` secret on the docs repository (GitHub Free: private repos cannot read org secrets) (see the [inventory](secrets/README.md#notion-token)).
- **P2 addition**: `TURN_STATIC_AUTH_SECRET`, the coturn TURN REST secret, is implied by the P2P design but isn't pinned yet. It is listed in the inventory with a note.
- **Protocol references** are hand-written from P3–P9. Regenerate them from `contracts` once it publishes `v0.1.0`.
