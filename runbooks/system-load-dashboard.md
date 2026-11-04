# System load dashboard

Grafana dashboard "Discordy: System load" for watching a stress test live. URL path: `/d/discordy-system-load` on the Grafana host (see [Ops access](ops-access.md)); it refreshes every 10 s and defaults to the last 30 minutes. Pick the VictoriaMetrics datasource in the `Datasource` variable at the top.

Source: `gitops/infrastructure/controllers/grafana/dashboards/discordy-system-load.json`, deployed as a ConfigMap labelled `grafana_dashboard=1` that the Grafana chart sidecar provisions. Edit the JSON in git (changes made in the UI are not persisted).

## Variables

`Datasource` (VictoriaMetrics) and `Namespace` (multi-select over `voics-apps`, `voics-data`, `voics-voice`, default all). Namespace filters the pod health, per-pod and HTTP panels.

## Rows

All rows except "Stress test overview" and "Traffic and apps" are collapsed by default; Grafana only queries panels of a row once you expand it.

| Row | Shows | Source |
|---|---|---|
| Stress test overview | Stat tiles with green/amber/red thresholds: messages/s, gateway sessions, API p99, produce p99, ingress 5xx %, node CPU % and memory %, pod restarts in 15 m | `messages_created_total`, gateway, ingress-nginx, node-exporter (cAdvisor fallback), kube-state-metrics |
| Node (node-exporter) | Host CPU % by mode, memory used and available, load1/5/15, disk IO, filesystem usage, network, errors and drops | `node_*` |
| Node (cAdvisor fallback) | CPU % and memory % (all containers summed), disk usage %, throughput, network errors and drops, public endpoint probes | cAdvisor, blackbox |
| Pod health | Restarts in the last hour, pods not Ready, unavailable replicas, StatefulSet ready versus desired | kube-state-metrics |
| Per-pod resources | CPU, memory and network per pod | cAdvisor |
| Traffic and apps | Requests/s by job and status, 5xx rate, top routes, latency p95/p99 per job and route (api, gateway, messages, admin-bff) | `http_requests_total`, `http_request_duration_seconds` |
| Gateway | Sessions, guild processes, voice allocations, events consumed and dispatched, session start and close rate, admin-bff event rates | `discordy_gateway_*`, `admin_bff_*` |
| Data: Redpanda | Produce and consume rate, records/s, request latency, consumer lag per group, under-replicated replicas, RPC connections and errors | `redpanda_*` |
| Ingress | Requests/s by host and status, 4xx and 5xx rate, request duration p50/p95/p99 by host, upstream latency, bytes in and out, active connections | `nginx_ingress_controller_*` |
| Data: ScyllaDB | Coordinator reads and writes/s, read and write latency p95/p99 (microseconds), cache hit rate, pending compactions, disk usage, CQL connections, errors and timeouts, pod CPU and memory | `scylla_*` (job `scylla`) |
| Data: Valkey | Commands/s, hit rate, memory used versus max, clients, evicted and expired keys, command latency, network, pod CPU and memory | `redis_*` (redis_exporter) |
| Data: Postgres | Backends by state, commits and rollbacks/s, database size, replication lag, WAL, deadlocks and conflicts, buffer cache hit ratio, pod CPU and memory | `cnpg_*` (job `postgres`) |
| Messages service and API internals | Messages created, edited and deleted/s, Kafka produce latency and errors by topic, DB query p95 by job, rate-limit decisions | `messages_*`, `kafka_produce_*`, `db_query_duration_seconds`, `rate_limit_decisions_total` |
| Voice | SFU sessions, rooms, ingress and egress bitrate; signaling users, rooms and SFU connections; voice pod CPU and memory | `sfu_*`, `discordy_voice_node_*`, cAdvisor |

## Known gaps

- The Valkey, node-exporter and messages-service panels show no data until gitops 0.17.0 and the next messages release are deployed; the overview tiles for node CPU, memory and produce latency fall back to cAdvisor and Redpanda until then.
- Scylla write latency shows no data while there are no writes (the histogram has no samples to quantile).
- No CPU throttling metrics (`container_cpu_cfs_*` is not exported by this kubelet).
- No SFU packet loss.
