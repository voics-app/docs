# messages

Summary: message history, reactions, pins, read states and attachments on ScyllaDB, in Rust.

| | |
|---|---|
| Repository | `discordy-voics/messages` |
| Image | `ghcr.io/discordy-voics/messages` (namespace `voics-apps`, port 8082) |
| Tech | Rust 1.99, axum 0.8, scylla driver |
| Owns | ScyllaDB keyspace `discordy` (messages, reactions, pins, read_states, channel_last_message), MinIO bucket `discordy-attachments` |
| Publishes | `discordy.message.v1`, keyed by `channel_id` |
| Catalog entry | [Service catalog: messages](../services/catalog.md#messages) |

## What it does

Stores messages in **10-day ScyllaDB buckets** with request coalescing ([ADR-0010](../adr/0010-scylladb-bucketing.md)). It accepts only `standard` delivery-mode channels; other modes get `409` with code `50160`. It asks api for channel access (`/internal/v1/channels/{id}/access/{user}`, cached 5 seconds) and verifies signed attachment download URLs ([ADR-0017](../adr/0017-signed-attachment-download-urls.md)).

## Endpoints

Public under `/api/v1`: messages CRUD and bulk delete, ack, reactions, pins, `POST /channels/{id}/attachments`. Internal under `/internal/v1`: bot, webhook and interaction messages, last message id, read states, admin stats. The full list is in the README and the [REST reference](../protocols/rest.md).

## Folder map

The same Clean Architecture crates as api: `crates/domain`, `crates/application`, `crates/infrastructure` (Scylla repositories, Kafka publisher, MinIO, api client), `crates/interface` (axum), `crates/contracts`, `bin/`, plus `migrations/` (CQL) and `ARCHITECTURE.md`.

## Run, test, release

```bash
cp .env.example .env && make dev    # set JWT_PUBLIC_KEY to the api dev public key
make test                           # integration tests start ScyllaDB, Redpanda and MinIO (Docker required)
make lint
```

Release as every service: tag `vX.Y.Z`, stable image, Flux ([Release](../runbooks/release.md)).

## Operate

- Logs: `kubectl -n voics-apps logs deploy/messages`. Metrics job `messages`.
- Data browsing: Scylla web at `discordy-scylla.voics.nl` ([Ops tools](../runbooks/ops-access.md)).
- Runbooks: [ScyllaDB maintenance](../runbooks/scylla-maintenance.md), [backup and restore](../runbooks/backup-restore.md#scylladb), [secret rotation](../runbooks/secret-rotation.md) (`ATTACHMENT_SIGNING_KEY`).
