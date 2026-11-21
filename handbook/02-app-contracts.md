# contracts

Summary: the single source of truth for every wire contract, with generated TypeScript, Rust and Elixir packages.

| | |
|---|---|
| Repository | `voics-app/contracts` |
| Artifacts | npm `@voics-app/contracts`, Rust crate `discordy-contracts`, Elixir `Discordy.Contracts` |
| Catalog entry | [Service catalog: contracts](../services/catalog.md#contracts) |

## Folder map

| Path | What is there |
|---|---|
| `openapi/discordy.yaml`, `openapi/internal.yaml` | OpenAPI 3.1 for the public and the service-to-service APIs. |
| `schemas/` | JSON Schema 2020-12 for objects, REST, gateway, events, voice, auth, internal, registry. |
| `permissions.json`, `intents.json`, `protocol.json` | Registries: permission bits, intents, opcodes, topics. |
| `fixtures/` | Valid and invalid sample payloads. |
| `codegen/` | The validation and generation pipeline. |
| `packages/{ts,rust,elixir}` | The generated packages. |
| `reference/*.md` | Generated protocol docs, copied into [protocols](../protocols/README.md). |
| `dist/` | Generated bundles. |

Everything under `dist/`, `reference/` and the `generated` folders is generated: never edit it by hand.

## Run and test

```bash
pnpm install
pnpm validate        # redocly lint, ajv compile, registry checks, fixtures
pnpm codegen         # validate, then regenerate everything
make test            # golden tests in TypeScript, Rust and Elixir
make check-generated # fails when the tree drifts
```

Golden tests assert `ADMINISTRATOR == 8`, `VIEW_CHANNEL == 1024` and `CONNECT == 1048576` in all three languages. A protocol change starts here, then each service updates its dependency.
