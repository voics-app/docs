# Architecture Decision Records

This directory holds Discordy's architecture decisions. The records use the [MADR](https://adr.github.io/madr/) format, and each one captures the context, the options considered and the decision taken.

| # | Decision | Status |
|---|---|---|
| [0001](0001-technology-stack.md) | Elixir gateway, Rust data services, Electron client | accepted |
| [0002](0002-repo-per-service.md) | One repository per service in the `discordy-voics` org | accepted |
| [0003](0003-delivery-modes.md) | Three message delivery modes: Standard, Ephemeral (MLS) and P2P | accepted |
| [0004](0004-custom-sfu.md) | Home-grown SFU (Rust/str0m) with Elixir voice signaling | accepted |
| [0005](0005-cloudflare-tunnel.md) | Cloudflare Tunnel ingress with one-level hostnames under `voics.nl` | accepted |
| [0006](0006-secrets-flow.md) | Secrets flow: GitHub secrets → OpenBao → External Secrets Operator | accepted |
| [0007](0007-github-free-workarounds.md) | Working within GitHub Free for private repositories | accepted |
| [0008](0008-microk8s-reuse.md) | Reuse the existing microk8s cluster on `gen-serv` | accepted |
| [0009](0009-redpanda-over-kafka.md) | Redpanda as the Kafka-API event bus | accepted |
| [0010](0010-scylladb-bucketing.md) | ScyllaDB message store with 10-day buckets and request coalescing | accepted |
| [0011](0011-no-drm-capture-watch-together.md) | No capture of DRM-protected video; offer Watch Together instead | accepted |
| [0012](0012-search-deferred.md) | Full-text message search is deferred | accepted (deferred) |
| [0013](0013-search-index-topology.md) | Search index topology for guild message search | proposed |
| [0014](0014-gateway-compression.md) | Gateway compression: per-connection zstd streaming, opt-in | proposed |
| [0015](0015-webauthn-second-factor.md) | WebAuthn as a second factor next to TOTP | proposed |
| [0016](0016-push-backpressure.md) | Push delivery with bounded back-pressure | proposed |
| [0017](0017-signed-attachment-download-urls.md) | Signed, expiring attachment download URLs | proposed |
| [0018](0018-link-unfurling-and-media-proxy.md) | Link unfurling and the embed media proxy | proposed |

## Writing a new ADR

1. Copy [`0000-template.md`](0000-template.md) to `NNNN-short-title.md`, using the next free number.
2. Fill in the context, the drivers, at least two options and the outcome. Open a PR as `docs(adr): NNNN short title`.
3. Merge with status `accepted` once the owner approves it.
4. Never rewrite an accepted ADR. To change a decision, write a new ADR that supersedes it, then set the old ADR's status to `superseded by NNNN`.
