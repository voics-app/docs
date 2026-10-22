# Incident 2026-10-22: gateway never ready (eetcd already_started)

Summary: gateway 0.3.0 and 0.4.0 stayed 0/1 Ready on production for 2+ hours (realtime down); fixed in gateway 0.4.1.

| | |
|---|---|
| Impact | The gateway (WebSocket realtime) was down on production until the rollback to 0.2.1; the rest of the platform kept working |
| Detected | By hand after 2+ hours; no alert fired (led to [Alerting](alerting.md), gitops#52) |
| Root cause | `VoiceNodeDirectory` reopened the shared eetcd connection on every (re)start and resync, and handled the `already_started` answer wrongly |
| Fix | gateway#28 (code), release 0.4.1, gitops#55 (cap removed, tag pinned) |
| Tracking | gateway#27 |

## Timeline (UTC, 2026-10-22)

- after 16:23 gateway 0.3.0 released (release PR merged) and rolled out by image automation. The pod stays 0/1: `/readyz` returns 503, logs loop `Failed to connect ETCD ... by :already_started`.
- Later 0.4.0 rolled out with the same result; a pod restart did not help.
- Rollback to 0.2.1 (healthy), gitops v0.11.2 caps the gateway image policy at `<0.3.0` and pins `newTag 0.2.1`.
- 19:18 fix merged to gateway `develop`; verified locally against a real etcd (below).
- 19:21 gateway 0.4.1 tagged, image built.
- 19:27 gitops#55 merged; Flux rolled 0.4.1 out; pod 1/1 Ready in about a minute; the WebSocket upgrade on `https://discordy-gateway.voics.nl/gateway?v=1&encoding=json` answers `101 Switching Protocols`.

## Cause

eetcd's connection (`:discordy_etcd`) is owned by eetcd's own supervisor, not by the gateway process that opened it, and it reconnects by itself. When `VoiceNodeDirectory` restarted, or a sync failed after a successful open, the next attempt called `:eetcd.open/2` again with the same name. eetcd answers that with a failure list `[{{host, port}, :already_started}]`, which the code did not match (it only matched `{:already_started, pid}`), so every retry failed and `ready?` stayed false for good. Because `/readyz` required etcd, the pod never became ready.

The diff `v0.2.1..v0.4.0` contains no etcd change (only guild event handling, HTTP metrics and Dockerfile caching), so the code path was latent in 0.2.1 too; 0.3.0 and 0.4.0 hit it on their first start. The first trigger that made the directory restart or a sync fail after the connection was opened could not be recovered (pod logs of the failed pods were gone; there is no log store). The fix makes the outcome independent of that trigger.

Reproduced locally with real etcd (v3.6.5): start the directory, kill the process, start it again: before the fix the exact `already_started` loop and `ready? = false`; after the fix `ready? = true`.

## Fix (gateway 0.4.1)

- `ensure_connection` looks the connection up (`:eetcd_conn.lookup/1`) and only opens when none is registered; `already_started` in any shape counts as success.
- The sync step catches errors and exits, so etcd trouble schedules a retry instead of crashing the process.
- etcd is a soft readiness check (`:readiness_soft`): reported in `/readyz` but not gating. With etcd down the gateway stays ready and only voice allocation degrades.
- Verified with the built image against etcd: ready, directory killed through `rpc` then ready again, etcd stopped then `etcd:false` with `status: ready`, etcd started then `etcd:true`, no `already_started` in the logs.
- The voice signaling service already carries the same handling for its own etcd registry (voice#14).

## Prevention

- Any code that calls `:eetcd.open/2` must be idempotent (look up first, accept `already_started` as a list or tuple).
- Dependencies that only enable an optional feature must not gate `/readyz`.
- Alerting (gitops#52) now pages on a deployment with 0 ready replicas.
- Roll out gateway changes watching `kubectl -n voics-apps rollout status deploy/gateway`; roll back with `kubectl -n voics-apps set image deploy/gateway gateway=ghcr.io/discordy-voics/gateway:<previous>` and re-apply an image policy cap.
- CI note: `guild_flow_test` "a removed member is told GUILD_DELETE" is timing-sensitive and failed once on the release branch (green on rerun of the same code); worth hardening.
