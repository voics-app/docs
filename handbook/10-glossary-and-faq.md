# Glossary and FAQ

Summary: the words used in Voics and quick answers to "where do I find" and "how do I".

## Glossary

| Term | Meaning |
|---|---|
| ADR | Architecture Decision Record: why a decision was taken ([ADRs](../adr/README.md)) |
| ARC | Actions Runner Controller: the in-cluster GitHub runners (label `discordy`) |
| BFF | Backend for frontend: the admin portal's Rust server |
| C4 | The diagram model used in [c4](../c4/README.md) (context, containers, components, code) |
| Cloudflare Access | Identity gate in front of operator hosts (email plus one-time PIN) |
| `CI_RUNNER` | Repository variable that redirects CI jobs to another runner |
| DAVE / MLS | The end-to-end encryption schemes for voice frames and ephemeral chat |
| Delivery mode | Standard, Ephemeral (MLS) or P2P: how a channel's messages travel |
| ESO | External Secrets Operator: copies OpenBao values into Kubernetes Secrets |
| Flux | The GitOps controller that applies the gitops repository to the cluster |
| gen-serv | The Proxmox VM (192.168.1.212) running production |
| Guild | A server (Discord term); `srv_id` in some internals |
| Intent | A gateway subscription flag controlling which events a session receives |
| OpenBao | The secret store (open-source Vault fork); starts sealed |
| Outbox | Table written in the same transaction as a change, relayed to Redpanda |
| P1 to P11 | The pinned interfaces of the [master plan](../plans/2026-10-16-discordy-master-plan.md) |
| Region | A named voice placement target ([Voice regions](07-voice-regions.md)) |
| Redpanda | The Kafka-compatible event bus |
| SFU | Selective forwarding unit: relays media between call participants |
| Snowflake | The 64-bit time-ordered id format; each service has its own worker id range |
| TURN / coturn | Relay for P2P calls when direct connection fails |
| Unseal | Providing 3 of 5 key shares so OpenBao can open |
| Workstream (`ws`) | A slice of the master plan owned by one agent |

## FAQ

**Where is the list of ports and env vars of a service?** The [Services database](../services/catalog.md) and each application page ([Applications](02-apps-overview.md)).

**Why did we pick X?** Search the [ADRs](../adr/README.md).

**How do I log in to Grafana, pgweb or Headlamp?** [Ops and access](04-ops-and-access.md).

**OpenBao is sealed, secrets stopped refreshing.** [OpenBao unseal](../runbooks/openbao-unseal.md).

**How do I release a service?** Tag `vX.Y.Z` on `main` after the release branch merge ([Release](../runbooks/release.md)); see [How we work](03-how-we-work.md).

**My CI is stuck on "waiting for a runner".** `CI_RUNNER` points at a runner that is off: [CI/CD and runners](05-ci-cd-and-runners.md#troubleshooting).

**How do I rotate a secret?** [Secret rotation](../runbooks/secret-rotation.md); where it lives: [Secrets inventory](../secrets/README.md).

**How do I add a voice region?** [Voice regions](07-voice-regions.md).

**How do I rename the product or restyle the site?** `brand.json` in `website` and in `client` ([website](08-website-and-branding.md), [client](09-desktop-client-release.md#branding)).

**How do I run everything locally?** [Local development](../runbooks/local-development.md).

**How do I stand up a new environment or rebuild production?** [Environments and IaC](06-environments-and-iac.md).

**How do I add an ops tool?** Follow the example in the [Definition of Done](../CONTRIBUTING.md#definition-of-done).

**Why does Notion not match what I edited there?** Notion is a mirror: edit the Markdown in the docs repository; the next sync overwrites Notion ([README](../README.md#notion-mirror)).
