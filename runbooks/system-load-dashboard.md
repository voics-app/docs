# System load dashboard

Grafana dashboard "Discordy: System load" for watching a stress test live. URL path: `/d/discordy-system-load` on the Grafana host (see [Ops access](ops-access.md)); it refreshes every 5 s and defaults to the last 30 minutes. Pick the VictoriaMetrics datasource in the `Datasource` variable at the top.

Source: `gitops/infrastructure/controllers/grafana/dashboards/discordy-system-load.json`, deployed as a ConfigMap labelled `grafana_dashboard=1` that the Grafana chart sidecar provisions. Edit the JSON in git (changes made in the UI are not persisted).

## Rows

| Row | Shows | Source |
|---|---|---|
| Overview | Scrape targets up and down, scrape duration and size, pod restarts in the last hour, pods not Ready, unavailable replicas, public endpoint probes | `up`, `scrape_*`, kube-state-metrics, blackbox |
| Traffic | Gateway and admin-bff requests/s by status and route, 5xx rate, gateway latency p50/p95/p99, messages requests/s | `http_*`, `messages_http_requests_total` |
| Apps | Gateway sessions, guild processes, voice allocations, BEAM memory and run queue, admin-bff event rates | `discordy_gateway_gauges_*`, `vm_*`, `admin_bff_*` |
| Data (Redpanda) | Produce and consume rate, records/s, request latency p95/p99, consumer lag per group, under-replicated replicas, RPC connections and errors | `redpanda_*` |
| Voice (SFU) | Sessions, rooms, ingress and egress bitrate | `sfu_*` |

## Known gaps

Only metrics that are scraped today are shown. Missing: node CPU, memory, disk, network and load; per-pod CPU, memory and throttling (cAdvisor); ingress-nginx request and latency metrics; ScyllaDB, Valkey and Postgres metrics; voice signaling and API app metrics (the `api` and `voice-signaling` jobs are up but export no application series); packet loss in the SFU; messages-service latency. Add the exporter or scrape job first, then a panel in the JSON.
