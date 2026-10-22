# Alerting

Outages must not go unnoticed (the gateway was down for 2+ hours on 2026-10-22 and nobody knew; gitops#52). The platform now evaluates alert rules every 30 seconds, shows firing alerts as a red banner on the ops portal and, once the owner adds a webhook, posts them to Discord or Slack.

## How it works

| Piece | Where | Role |
|---|---|---|
| VictoriaMetrics | `observability/victoria-metrics` | Scrapes the services, kube-state-metrics and the blackbox probes |
| kube-state-metrics | `observability/kube-state-metrics` | Deployment and StatefulSet replica counts; Flux Kustomization, HelmRelease and GitRepository Ready state (`gotk_resource_info`). The other collectors are off to save memory |
| blackbox-exporter | `observability/blackbox-exporter` | Probes the public endpoints end to end through Cloudflare, the tunnel and the ingress |
| vmalert | `observability/vmalert` | Evaluates `infrastructure/controllers/alerting/rules.yml` every 30 s; API at `/api/v1/alerts` |
| alert-relay | `observability/alert-relay` | Receives vmalert's posts and sends one message per change to the webhook |
| Ops portal | `https://discordy-ops.voics.nl` | "Active alerts" banner, polls vmalert every 30 s; red while anything fires |

All manifests live in `gitops/infrastructure/controllers/alerting/` (production and dev use the same files; dev probes the dev hostnames). Together they request about 100 MiB of memory.

## Rules

| Alert | Fires when | For |
|---|---|---|
| `DeploymentNotReady` | ready replicas < desired, or any unavailable pod (a rollout whose new pod never turns ready) | 5 m |
| `StatefulSetNotReady` | ready replicas < desired replicas | 5 m |
| `ServiceDown` | `up == 0` for job api, messages, gateway, admin-bff, voice-signaling or sfu | 3 m |
| `ServiceTargetMissing` | one of those jobs has no scrape target at all (no pod) | 3 m |
| `EndpointProbeFailing` | a blackbox probe fails: `api-auth-gate` (API `/api/v1/users/@me` must answer 401), `gateway-websocket` (upgrade must answer 101), `cdn` (200), `update-feed` (200) | 2 m |
| `FluxNotReady` | a Kustomization, HelmRelease or GitRepository is not Ready and not suspended | 10 m |
| `OpenBaoSealed` | `openbao_sealed == 1` or `openbao_reachable == 0` | 4 m |
| `OpenBaoCheckMissing` | no `openbao_sealed` metric (the seal-check CronJob stopped) | 10 m |

A scale-to-zero on purpose does not fire `DeploymentNotReady` (desired is 0); it fires `ServiceTargetMissing` for the service jobs.

To add or change a rule edit `rules.yml`, merge through the normal flow (`feature/*` to `develop`, then `release/*` to `main`). The rules ConfigMap is generated, so vmalert restarts on the new hash.

## Add the webhook (one-time, owner action)

Create a Discord or Slack incoming webhook, then store it by hand (never in git):

```bash
kubectl -n observability create secret generic ops-alerts --from-literal=WEBHOOK_URL='https://discord.com/api/webhooks/...'
kubectl -n observability rollout restart deploy/alert-relay
```

The relay posts JSON with both `content` (Discord) and `text` (Slack). It sends a message when an alert starts firing, repeats it every hour while it keeps firing, and sends `RESOLVED` once. Without the Secret the relay only logs (`kubectl -n observability logs deploy/alert-relay`); the portal banner and vmalert still work. The old `openbao-alert` Secret is no longer read: `OpenBaoSealed` replaces its CronJob post, so delete it if you created one.

Rotate the webhook: delete the Secret, create it again, restart `alert-relay`.

The dev environment runs the same stack and needs its own Secret in the dev cluster (same command with the dev kubeconfig); use a different webhook or channel so dev noise never mixes with production. The relay prefixes dev messages with `[dev]`.

## Look at alerts

- Ops portal banner (red when firing, amber text when pending).
- `kubectl -n observability port-forward svc/vmalert 8880` then `http://localhost:8880/` (rules, state, last evaluation) or `/api/v1/alerts`.
- Grafana, series `ALERTS{alertstate="firing"}` (vmalert writes it back to VictoriaMetrics).
- Probe detail: `probe_success`, `probe_http_status_code`, `probe_duration_seconds` with `job="blackbox"`.

## When an alert fires

| Alert | First steps |
|---|---|
| `DeploymentNotReady`, `ServiceDown` | `kubectl -n <ns> get pods`, `describe pod`, `logs`; if a new release never became ready, roll the image tag back (see [Release](release.md#rollback)) |
| `EndpointProbeFailing` | Is the pod up? Then the tunnel or ingress: `kubectl -n voics-system get pods` (cloudflared, ingress-nginx); Cloudflare status; the probe name tells which endpoint |
| `FluxNotReady` | `flux get kustomizations -A`, `flux get helmreleases -A`; read the message, fix in git, never `kubectl edit` |
| `OpenBaoSealed` | [OpenBao unseal](openbao-unseal.md) |

## Alerting is down

If vmalert or the relay is unreachable the portal shows a red "alerting is unreachable" banner. Check `kubectl -n observability get pods` (vmalert, alert-relay, blackbox-exporter, kube-state-metrics, victoria-metrics-0). If VictoriaMetrics itself is down, no rule can evaluate: the first pod to check is `victoria-metrics-0`.

## Test the chain

Create a throwaway deployment whose readiness never passes, wait 5 minutes, see the banner and the webhook message, delete it:

```bash
kubectl -n voics-system create deployment alert-test --image=nginxinc/nginx-unprivileged:1.27-alpine
kubectl -n voics-system patch deployment alert-test -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx-unprivileged","readinessProbe":{"httpGet":{"path":"/nope","port":8080}}}]}}}}'
kubectl -n voics-system delete deployment alert-test
```
