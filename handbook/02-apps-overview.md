# Applications: where to find what

Summary: one page per repository, with the folder map, key files, configuration, local run, tests and release.

The `discordy-voics` GitHub organisation has one repository per deployable unit ([ADR-0002](../adr/0002-repo-per-service.md)). Each repository has a `README.md` (run, test, configure) and an `ARCHITECTURE.md` (layers and diagram). Every page below follows the same outline.

| Repository | Page | One line |
|---|---|---|
| `api` | [api](02-app-api.md) | REST API, Postgres owner |
| `messages` | [messages](02-app-messages.md) | Message history on ScyllaDB |
| `gateway` | [gateway](02-app-gateway.md) | Realtime WebSocket edge |
| `voice` | [voice](02-app-voice.md) | Voice signaling, SFU and `regionctl` |
| `admin` | [admin](02-app-admin.md) | Operator portal |
| `client` | [client](02-app-client.md) | Electron desktop app |
| `website` | [website](02-app-website.md) | Marketing site |
| `gitops` | [gitops](02-app-gitops.md) | Cluster manifests, bootstrap, local stack |
| `docs` | [docs](02-app-docs.md) | This documentation |
| `contracts` | [contracts](02-app-contracts.md) | Wire contracts and generated packages |
| `.github` | [.github](02-app-github.md) | Shared workflows, org defaults, runner scripts |
| `bots-sdk` | [bots-sdk](02-app-bots-sdk.md) | TypeScript SDK for bots |

## Conventions shared by every repository

- **Clean Architecture** layers: `domain` (no IO), `application` (use cases and ports), `infrastructure` (adapters), `interface` (HTTP, WebSocket, UI) and a composition root. The rules are in [Contributing](../CONTRIBUTING.md#clean-architecture).
- `make dev`, `make test`, `make lint` and `make docker` exist in every service repository.
- Configuration is environment variables validated at startup; the process refuses to boot with a message naming the variable.
- Local infrastructure comes from the compose stack in `gitops/local` ([Local development](../runbooks/local-development.md)).
- CI calls the reusable workflows of the `.github` repository; releases follow [How we work](03-how-we-work.md#releases-and-versioning).
