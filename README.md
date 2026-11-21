# Voics docs

Architecture, decisions, references and runbooks for **Voics**, a Discord-equivalent platform (without payments) built in the `voics-app` GitHub org. Git is the source of truth; the content is mirrored to Notion on every merge to `main`.

> Voics is live at `voics.nl`, with production on gen-serv (`192.168.1.212`). The approved hostname takeover is complete; compatibility aliases remain. The unrelated VM `.204` and the old product’s other records remain protected. See [public hostnames](runbooks/hostnames.md).

## Nederlandse handleidingen

- [Voics op iPhone en Android](handbook/14-handleiding-mobiele-app.md)
- [Voics op de computer](handbook/15-handleiding-desktop.md)
- [Een tweede server voorbereiden](runbooks/server-uitbreiden.md) — geen server aangemaakt of join uitgevoerd
- [Back-up- en herstelplan](runbooks/backup-restore.md) — voorstellen, nog geen geactiveerde jobs
- [Stand van zaken en beheerkeuzes](handbook/16-status-en-beheerkeuzes.md)
- [Opleverprogramma en alle toegewezen kaarten](plans/2026-11-18-completion-programme.md)

Publicatie volgt de bestaande [Notion-mirror en inhoudscontrole](runbooks/notion-publicatie-controleren.md).

De [server-template-specificatie](specs/2026-11-04-server-templates.md) beschrijft
de openbare voorvertoning, synchronisatie en de nog te bevestigen UI/livecontrole.

[Profielaanpassing](specs/2026-11-18-profile-customization.md) beschrijft de uitbreiding met
voornaamwoorden, profielkleuren en een eigen avatar, banner en bio per server (api#43).

## Start here

The [Community and discovery specification](specs/2026-11-03-server-discovery.md)
pins Community channel setup and listing reports for api#45. Implementation and
independent UI acceptance are tracked separately from the existing directory.

| If you want to… | Read |
|---|---|
| Learn how everything works and where to find it | [Handbook](handbook/01-how-discordy-works.md) |
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
handbook/     how Voics works, per-application guides, how we work, runners, regions, branding, client release
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

## Notion mirror

The Markdown in this repository is mirrored to Notion under the existing **Voics** root (historically **Home, Home Lab, Discordy**) (page id `3fb99f29-12a4-81cb-b018-ebda0f0072e8`). Git stays the source of truth: edit the Markdown, never the Notion pages, because the next sync overwrites them.

### What you get in Notion

- A dashboard (the Voics page): hero, handbook links, ops quick links, a synced "Where to find X" FAQ, toggles for common tasks and a last-synced stamp.
- Databases with properties and one page per document: **Handbook**, **Runbooks**, **ADRs**, **Services**, **Ops tools & URLs**, **Environments**, **Guides & references**, **Specs & plans** and **Protocols**. Relations link ADRs to the ones they supersede and services to what they depend on.
- Markdown is converted to Notion blocks (headings, lists, tables, code with language, callouts for blockquotes, images). Relative links point at the matching Notion page, or at GitHub for files that are not mirrored.

### How it works (`scripts/notion-sync/`, Node 24, no dependencies)

1. It reads the repository, builds one row per document and keeps the stable key (the repository path) in the hidden property **Source path** of each Notion page.
2. A **Content hash** property makes it idempotent: unchanged pages are skipped, changed pages are rewritten, pages whose source disappeared are archived. A second run changes nothing.
3. It never writes secrets: any line that looks like a token is replaced by a notice and reported as a warning.
4. It throttles to about 3 requests per second and retries on 429.

### Run it

- Automatically: the `notion-sync` workflow runs on every push to `main`, and on demand (Actions, notion-sync, Run workflow; tick *dry run* to only plan). It uses the repository secret `NOTION_TOKEN` and `runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}`.
- Locally, with the token in the environment (never commit it):

  ```bash
  export NOTION_TOKEN=...                      # internal integration shared with the Voics page
  node scripts/notion-sync/index.mjs --dry-run # plan only
  node scripts/notion-sync/index.mjs           # sync
  node scripts/notion-sync/index.mjs --prune-root  # one time: also remove unmanaged blocks and pages under the Voics page
  ```

- Rotating the token: [secret rotation](runbooks/secret-rotation.md#notion-token). The integration must stay shared with the Voics page.

### Views

The Notion API cannot create filtered or sorted database views, so those are saved in Notion itself and survive syncs.

## Pending owner actions

- **P2 addition**: `TURN_STATIC_AUTH_SECRET`, the coturn TURN REST secret, is implied by the P2P design but isn't pinned yet. It is listed in the inventory with a note.
- **Protocol references** are hand-written from P3–P9. Regenerate them from `contracts` once it publishes `v0.1.0`.

## Git hooks

Tests run locally, not in CI. Install [lefthook](https://github.com/evilmartians/lefthook) once and run `make hooks` (or `lefthook install`) to enable the pre-push hook in `lefthook.yml`: it runs this repository's lint and unit tests before every push. CI repeats only the slim gate on pull requests. Skip once with `LEFTHOOK=0 git push`.
