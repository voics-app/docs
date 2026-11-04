# System load dashboard

Grafana dashboard "Discordy: System load" for watching a stress test live. URL path: `/d/discordy-system-load` on the Grafana host (see [Ops access](ops-access.md)); it refreshes every 5 s and defaults to the last 30 minutes. Pick the VictoriaMetrics datasource in the `Datasource` variable at the top.

Source: `gitops/infrastructure/controllers/grafana/dashboards/discordy-system-load.json`, deployed as a ConfigMap labelled `grafana_dashboard=1` that the Grafana chart sidecar provisions. Edit the JSON in git (changes made in the UI are not persisted).

## Variables

`Datasource` (VictoriaMetrics) and `Namespace` (multi-select over `voics-apps`, `voics-data`, `voics-voice`, default all). Namespace filters the pod health, per-pod and HTTP panels.

## Rows

| Row | Shows | Source |
|---|---|---|
| Node | CPU % and memory % (all containers summed over `machine_cpu_cores` / `machine_memory_bytes`), disk usage %, disk and network throughput, network errors and drops, public endpoint probes | cAdvisor, blackbox |
| Pod health | Restarts in the last hour, pods not Ready, unavailable replicas, StatefulSet ready versus desired | kube-state-metrics |
| Per-pod resources | CPU, memory and network per pod | cAdvisor |
| Traffic and apps | Requests/s by job and status, 5xx rate, top routes, latency p95/p99 per job and route (api, gateway, messages, admin-bff) | `http_requests_total`, `http_request_duration_seconds` |
| Gateway | Sessions, guild processes, voice allocations, events consumed and dispatched, session start and close rate, admin-bff event rates | `discordy_gateway_*`, `admin_bff_*` |
| Data: Redpanda | Produce and consume rate, records/s, request latency, consumer lag per group, under-replicated replicas, RPC connections and errors | `redpanda_*` |
| Data: ScyllaDB, Valkey, Postgres | Pod CPU and memory only | cAdvisor |
| Voice | SFU sessions, rooms, ingress and egress bitrate; signaling users, rooms and SFU connections; voice pod CPU and memory | `sfu_*`, `discordy_voice_node_*`, cAdvisor |

## Known gaps

- No node-exporter: node CPU and memory are the sum of container usage (cAdvisor does not export the root cgroup), so host processes outside pods are not counted; no host load average.
- No CPU throttling metrics (`container_cpu_cfs_*` is not exported by this kubelet).
- No ingress-nginx metrics: no per-host request rate, status or latency at the edge.
- No ScyllaDB, Valkey or Postgres exporters: no reads/writes, latency, ops/s, connections or TPS.
- No SFU packet loss.
