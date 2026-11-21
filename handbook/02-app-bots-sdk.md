# bots-sdk

Summary: the TypeScript SDK for building bots on Voics.

| | |
|---|---|
| Repository | `voics-app/bots-sdk` |
| Package | npm `@voics-app/bots` on GitHub Packages (Node.js 22 or newer) |
| Catalog entry | [Service catalog: bots-sdk](../services/catalog.md#bots-sdk) |

## What it provides

A gateway client with intents, heartbeats and resume, a rate-limited REST client, builders for slash commands, components, modals and embeds, interaction handlers and webhooks.

## Folder map

| Path | What is there |
|---|---|
| `src/domain` | Bitfields, builders, errors, gateway rules. |
| `src/application` | Gateway, REST and event use cases and ports. |
| `src/infrastructure`, `src/interface` | WebSocket and HTTP adapters, the public API. |
| `src/contracts` | Hand-kept copy of the wire types (gateway, intents, permissions, REST). |
| `docs/getting-started.md` | Application, token, invite URL, intents and a first bot. |
| `docs/api` | TypeDoc output; CI fails if it is stale (`make docs`). |
| `examples/moderation-bot` | `/ping`, `/kick` and `/purge`. |

## Run and test

```bash
make install && make build
make test && make lint
make docs            # regenerate docs/api
```

Install by pointing the `@voics-app` scope at `https://npm.pkg.github.com` in `.npmrc`. Releases tag `vX.Y.Z` and publish the package.
