# Load testing

How to measure message throughput, gateway fan-out latency and concurrent sessions on the production
cluster (gen-serv). The harness lives in `gitops/loadtest/` (README there has the flags). Results of
the first run: [capacity baseline 2026-11-04](../reports/2026-11-04-capacity-baseline.md).

## Before you start

- **Production has real users.** The api (192 Mi), gateway (256 Mi), messages (224 Mi) and SFU (128 Mi)
  pods have small memory limits and no CPU limits. The first run OOM-killed the api (4 concurrent
  registrations) and the gateway (about 100 msg/s to 50 receivers, or about 500 sessions). Each
  restart drops every connected client for 10 to 60 s. Tell the owner first and avoid active hours.
- Never touch 192.168.1.204 (another product). Never change Cloudflare DNS. Do not lift rate limits
  or any production config to make a test pass; report the cap instead.
- Everything runs against the ingress on the LAN, not the Cloudflare hostnames. The ingress is a
  ClusterIP Service: reach it with a route to 10.152.183.0/24 via 192.168.1.212 (needs root) or with
  `kubectl port-forward` (no privileges, but the apiserver tunnel limits throughput).
- Check that traffic to 192.168.1.212 uses the LAN adapter, not a VPN: `Find-NetRoute -RemoteIPAddress 192.168.1.212`.

## Procedure

1. `node guard.mjs` in its own terminal (restarts, memory over 85 % of limit, node CPU over 90 % for
   60 s, disk over 85 %). It writes the `ABORT` file the scripts watch.
2. `node seed.mjs --users 200 ...` (sequential: argon2 hashing needs about 50 MB per attempt).
3. `node messages.mjs --steps 10,25,50,100 --step-secs 60 --receivers 50` and
   `node users.mjs --users 2000` (pass/fail: p95 500 ms, p99 1000 ms, errors 1 %).
4. `node summarize.mjs` to join results and pod samples.
5. After each run: all pods 1/1 Ready (`kubectl get pods -A`), no restart count increase, no pending
   Redpanda lag, then `node cleanup.mjs` (sequential).

## Safety thresholds

Stop immediately on: error rate above 2 % (messages) or 1 % (sessions), p95 above 2 s (messages) or
500 ms (sessions), any pod restart or not Ready, pod memory above 85 % of its limit, node CPU above
90 % for 60 s, disk above 85 %. Guard samples have a 15 s resolution (metrics-server); a pod can
fill its memory between two samples, so ramp slowly near the limits.

## Rate limits to know

api: 50 requests per 5 s per credential and route bucket; unauthenticated routes are per source
address (so a seed or refresh loop from one machine shares one 10 req/s budget). messages send has no
per-user limit. Gateway: 120 frames per 60 s per connection. Details in the harness README.

## Cleanup

`node cleanup.mjs` deletes the guilds and schedules account deletion (`POST /users/@me/delete`);
accounts are anonymized after the retention window. Logging in to a scheduled-for-deletion account
cancels the deletion. Messages cannot be deleted through the API.
