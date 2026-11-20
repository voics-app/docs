# Runbooks

Desktop user privacy: [Streamer mode](desktop-streamer-mode.md).

[Read-state accounting rollout and recovery](read-accounting.md) covers the proposed companion keyspace, coordinated writer drain and paired backups.

| Runbook | Use it when |
|---|---|
| [Incident 2026-11-14: image reflector OOM](incident-2026-11-14-image-reflector.md) | Seven stale image scans, a 256Mi crash loop, memory evidence and GitOps recovery |
| [Incident 2026-10-22: gateway never ready](incident-2026-10-22-gateway-etcd.md) | Gateway 0.3.0/0.4.0 never ready (eetcd already_started); cause, fix, prevention |
| [Adding a voice region](voice-regions/adding-a-region.md) | Bringing up a new region or another node in a region |
| [Draining a voice node or region](voice-regions/draining-a-region.md) | Maintenance, decommissioning, moving calls |
| [Voice failover](voice-regions/failover.md) | SFU, node, region, etcd or tunnel failures |
| [Voice troubleshooting](voice-regions/troubleshooting.md) | Symptom-driven diagnosis of voice problems |
| [Gatewaycluster en voice-registraties](gateway-cluster.md) | DNS/distributie, readiness, reconnects, lease-eigendom en endpointidentiteit vóór opschaling |
| [OpenBao unseal](openbao-unseal.md) | After every OpenBao restart; bootstrap; rekeying |
| [Alerting](alerting.md) | Which alerts exist, adding the owner webhook (`ops-alerts`), what to do when one fires |
| [Profile badge visibility](profile-badges.md) | Owner controls, public filtering, test coverage and open product choices |
| [Push notifications](push-notifications.md) | APNs/FCM flow, deployed notifier status, credential maintenance and remaining real-device acceptance |
| [Scheduled event reminders](scheduled-events.md) | Proposed outbox, deduplication, verification and offline push gap |
| [Metrics and exporters](metrics-exporters.md) | Which components export metrics, scrape jobs, ports and main series; verifying a target is up |
| [ScyllaDB maintenance](scylla-maintenance.md) | Adding a node, rolling restart, repair or draining ScyllaDB |
| [Back-up- en herstelplan](backup-restore.md) | Voorgestelde doelen, sleutelbewaring en herstelproeven; nog geen geactiveerde jobs |
| [Een tweede server voorbereiden](server-uitbreiden.md) | Nederlandse workerhandleiding, load balancing, replicavoorwaarden en veilig later onderhoud |
| [Notion-publicatie controleren](notion-publicatie-controleren.md) | Bestaande mirror gebruiken en commit, pagina’s en inhoud verifiëren |
| [Secret rotation](secret-rotation.md) | Scheduled or emergency rotation of any secret in the inventory |
| [Environments](environments.md) | Standing up a new environment (Proxmox, Hetzner, AWS) with one command, the dev/test environment, rebuilding production after a disaster |
| [Load testing](load-testing.md) | Measuring messages per second and concurrent sessions on production (harness, safety, cleanup) |
| [Release](release.md) | git-flow releases, **how each component reaches production** (pipelines, Flux timings, intervals), hotfixes, rollback, desktop installers, website |
| [Run the mobile app](run-the-mobile-app.md) | Seeing the Expo mobile app on a phone, an Android emulator or a dev build, on Windows without a Mac |
| [Local development](local-development.md) | Running the stack on a workstation |
| [Cloudflare setup](cloudflare-setup.md) | Tunnel, DNS and Access configuration |
| [How to rebrand](rebrand.md) | Changing the product name or domain: every file and variable, rebuild and redeploy steps, Cloudflare and DNS steps |
| [Access control (RBAC)](access-control.md) | Who and what may do what in the cluster, how to request access, how to grant, change or revoke it, break-glass |
| [Sessies en accountveiligheid](account-security.md) | Atomische intrekking/pushcleanup, replay, bewezen regressies en nog ontbrekende accountfuncties |
| [System load dashboard](system-load-dashboard.md) | Watching a stress test live in Grafana: what each row shows and which metrics are missing |
| [Ops access](ops-access.md) | Logging in to the ops portal, Headlamp, Grafana, pgweb, MinIO, Redpanda, OpenBao and admin; changing the allowed IP |
