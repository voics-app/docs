# C4 model

[`workspace.dsl`](workspace.dsl) (Structurizr DSL) is the only source of truth for the architecture diagrams. Everything under [`rendered/`](rendered/) is generated from it, so don't edit those files by hand.

## Views

| Level | View | Rendered |
|---|---|---|
| C1 | System context | [SVG](rendered/structurizr-C1-SystemContext.svg) · [PNG](rendered/structurizr-C1-SystemContext.png) |
| C2 | Containers | [SVG](rendered/structurizr-C2-Containers.svg) · [PNG](rendered/structurizr-C2-Containers.png) |
| C3 | Desktop client | [SVG](rendered/structurizr-C3-Client.svg) |
| C3 | api | [SVG](rendered/structurizr-C3-api.svg) |
| C3 | messages | [SVG](rendered/structurizr-C3-messages.svg) |
| C3 | gateway | [SVG](rendered/structurizr-C3-gateway.svg) |
| C3 | voice-signaling | [SVG](rendered/structurizr-C3-voice-signaling.svg) |
| C3 | sfu | [SVG](rendered/structurizr-C3-sfu.svg) |
| C3 | admin-bff | [SVG](rendered/structurizr-C3-admin-bff.svg) |
| C3 | admin-web | [SVG](rendered/structurizr-C3-admin-web.svg) |
| C4 | Permission calculator | [C4 view](rendered/structurizr-C4-PermissionCalculator.svg) · [UML](rendered/code-permission-calculator.svg) |
| C4 | Request coalescer | [C4 view](rendered/structurizr-C4-RequestCoalescer.svg) · [UML](rendered/code-request-coalescer.svg) |
| C4 | SFU forwarder | [C4 view](rendered/structurizr-C4-SfuForwarder.svg) · [UML](rendered/code-sfu-forwarder.svg) |
| C4 | VoiceAllocator | [C4 view](rendered/structurizr-C4-VoiceAllocator.svg) · [UML](rendered/code-voice-allocator.svg) |
| Deployment | gen-serv (production) | [SVG](rendered/structurizr-Deployment-gen-serv.svg) |
| Deployment | Voice-region template | [SVG](rendered/structurizr-Deployment-RegionTemplate.svg) |

## Conventions

- **Layer colours** in the C3 views: yellow is `domain`, green is `application`, purple is `infrastructure` and blue is `interface`. They follow the Clean Architecture layering in [CONTRIBUTING.md](../CONTRIBUTING.md#clean-architecture).
- **Code elements.** Structurizr has no code-level view type, so C4 code elements are modelled as components tagged `Code` plus one `Code<Module>` tag. The C3 views exclude them, and each C4 view includes only its own tag.
- **UML class diagrams.** The class diagrams in [`code/`](code/) are hand-written PlantUML that sits next to the C4 code views. When you change one of these modules in its service repo, update its diagram in the same release.
- **Relationships.** `!impliedRelationships false` is set, so every container-level relationship is declared explicitly. When you add a component relationship to another container, add the matching container relationship as well.

## Rendering

```bash
make render        # or: bash scripts/render-c4.sh
```

The render runs two steps, both in Docker with pinned images:

1. `structurizr/cli` exports every view to C4-PlantUML.
2. `plantuml/plantuml` renders the result to SVG and PNG.

The [`c4` workflow](../.github/workflows/c4.yml) validates the DSL on every pull request and fails when `rendered/` is stale. On `develop` and `main` it re-renders the diagrams and commits the result.

> `structurizr/cli:latest` is now a deprecation stub, so the render script pins `2025.11.09`, the last working release. Migrating to `structurizr/structurizr` (vNext) is tracked as a follow-up.
