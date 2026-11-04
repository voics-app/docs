# Metrics and exporters

Every Discordy component exports Prometheus metrics into VictoriaMetrics (`observability/victoria-metrics`, ClusterIP `victoria-metrics:8428`), and Grafana reads them from there. This page lists every scrape job, its port and its main series. Manifests: `gitops/infrastructure/controllers/victoria-metrics/helmrelease.yaml` (jobs found by label) and the exporters named below (generic `kubernetes-pods` job through `prometheus.io/scrape|port|path` pod annotations).

## Scrape jobs

| Job | What | Port, path | Main series |
|---|---|---|---|
| `api` | api service | 8080 `/metrics` | `http_requests_total`, `http_request_duration_seconds`, `db_query_duration_seconds{db="postgres"}`, `rate_limit_decisions_total{scope,result}` |
| `messages` | messages service | 8082 `/metrics` | `http_requests_total`, `http_request_duration_seconds`, `db_query_duration_seconds{db="scylla\|postgres"}`, `messages_created_total`, `messages_edited_total`, `messages_deleted_total`, `kafka_produce_duration_seconds{topic}`, `kafka_produce_errors_total{topic}` |
| `gateway` | gateway | 4000 | `http_*`, `discordy_gateway_*` (sessions, dispatch, consumed events) |
| `admin-bff` | admin backend | 8090 | `http_*` |
| `voice-signaling`, `sfu` | voice node | 4100, 4102 | `discordy_voice_node_*` |
| `scylla` | ScyllaDB | 9180 | `scylla_*` (latency, cache, compaction, reactor load) |
| `postgres` | CloudNativePG instances | 9187 | `cnpg_*`, `pg_*`, `cnpg_collector_up` |
| `kubernetes-pods` | Redpanda (annotations) | 9644 `/public_metrics` | `redpanda_*` |
| `kubernetes-pods` | `valkey-exporter` Deployment (redis_exporter v1.67.0, `voics-data`) | 9121 | `redis_up`, `redis_memory_used_bytes`, `redis_commands_processed_total`, `redis_keyspace_hits_total`, `redis_keyspace_misses_total`, `redis_connected_clients` |
| `kubernetes-pods` | `node-exporter` DaemonSet (v1.9.1, `voics-system`, hostNetwork) | 9100 | `node_cpu_seconds_total`, `node_memory_*`, `node_filesystem_*`, `node_network_*`, `node_load*` |
| `kubernetes-pods` | ingress-nginx controller | 10254 | `nginx_ingress_controller_requests`, `..._request_duration_seconds`, `..._response_size` |
| `kube-state-metrics`, `blackbox` | alert inputs | 8080, 9115 | see [Alerting](alerting.md) |

Scylla and Postgres are discovered by pod label, so adding a scrape never restarts them. The Valkey exporter authenticates with the existing `valkey` Secret (OpenBao `kv/discordy/valkey`).

## Checking

Port-forward and query `up`; every job above must be `1`:

```
kubectl -n observability port-forward service/victoria-metrics 18428:8428
curl -s 'http://127.0.0.1:18428/api/v1/query?query=up' 
```

If `up{job="scylla"}` is 0 while the pod is healthy, Scylla's Prometheus listener is bound to localhost; add `--prometheus-address=0.0.0.0` to the scylla args (this restarts Scylla).
