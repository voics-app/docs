# Runbooks

| Runbook | Use it when |
|---|---|
| [Incident 2026-10-22: gateway never ready](incident-2026-10-22-gateway-etcd.md) | Gateway 0.3.0/0.4.0 never ready (eetcd already_started); cause, fix, prevention |
| [Adding a voice region](voice-regions/adding-a-region.md) | Bringing up a new region or another node in a region |
| [Draining a voice node or region](voice-regions/draining-a-region.md) | Maintenance, decommissioning, moving calls |
| [Voice failover](voice-regions/failover.md) | SFU, node, region, etcd or tunnel failures |
| [Voice troubleshooting](voice-regions/troubleshooting.md) | Symptom-driven diagnosis of voice problems |
| [OpenBao unseal](openbao-unseal.md) | After every OpenBao restart; bootstrap; rekeying |
| [Alerting](alerting.md) | Which alerts exist, adding the owner webhook (`ops-alerts`), what to do when one fires |
| [Metrics and exporters](metrics-exporters.md) | Which components export metrics, scrape jobs, ports and main series; verifying a target is up |
| [ScyllaDB maintenance](scylla-maintenance.md) | Adding a node, rolling restart, repair or draining ScyllaDB |
| [Backup and restore](backup-restore.md) | Backup policy, restore drills and disaster recovery |
| [Secret rotation](secret-rotation.md) | Scheduled or emergency rotation of any secret in the inventory |
| [Environments](environments.md) | Standing up a new environment (Proxmox, Hetzner, AWS) with one command, the dev/test environment, rebuilding production after a disaster |
| [Release](release.md) | git-flow releases, **how each component reaches production** (pipelines, Flux timings, intervals), hotfixes, rollback, desktop installers, website |
| [Local development](local-development.md) | Running the stack on a workstation |
| [Cloudflare setup](cloudflare-setup.md) | Tunnel, DNS and Access configuration |
| [How to rebrand](rebrand.md) | Changing the product name or domain: every file and variable, rebuild and redeploy steps, Cloudflare and DNS steps |
| [Access control (RBAC)](access-control.md) | Who and what may do what in the cluster, how to request access, how to grant, change or revoke it, break-glass |
| [Ops access](ops-access.md) | Logging in to the ops portal, Headlamp, Grafana, pgweb, MinIO, Redpanda, OpenBao and admin; changing the allowed IP |
