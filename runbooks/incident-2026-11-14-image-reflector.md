# Incident 2026-11-14: image scans frozen after reflector OOM

## Impact and evidence

Production on `gen-serv` (`192.168.1.212`) stopped discovering new images around
2026-11-14 21:00 UTC. The application, database and voice pods continued running.
On 17 November the API, gateway, CDN and update endpoint probes were successful.

- `flux-system/image-reflector-controller-859b566bb6-grkw4` had more than 1180 restarts.
- Kubernetes recorded `OOMKilled`, exit 137, with a 256Mi container limit.
- The node kernel independently recorded `CONSTRAINT_MEMCG` kills for this pod.
- The last successful scans of all seven ImageRepositories were on 14 November,
  between 20:54 and 20:59 UTC. Their old Ready conditions did not mean scans were current.
- The node had about 6Gi available RAM and 58GB free disk, with no MemoryPressure or DiskPressure.

`FluxImageScanStale` names each ImageRepository separately. Seven such alerts, plus
`PodCrashLooping` and `DeploymentNotReady`, can therefore describe one failed controller.
The alert relay repeats firing alerts hourly and can report transient resolution when the
controller briefly becomes Ready between restarts.

## Why low application activity did not prevent this

The reflector scans registries and maintains a Badger tag database independently of chat and
voice activity. Its memory consumption is not a measure of the number of active users.

Six-hour maxima from VictoriaMetrics showed its container working set rising from 70.5Mi
on 4 November to 178.6Mi on 14 November, then reaching approximately 256Mi during the crash loop.
Over the first two sample windows, the Go heap allocation peak stayed near 108Mi, while
container cache and resident memory grew. During the first failing window the reported heap
allocation peak reached about 383Mi. These are independent maxima, not simultaneous samples.

This confirms an insufficient container limit. It does not prove a memory leak or identify a
particular retained allocation. The pre-failure measurements are consistent with database/cache
growth rather than continuous Go heap growth; sustained measurements or profiles are needed
before claiming a leak is fixed or ruled out.

## Recovery through GitOps

[gitops PR 131](https://github.com/discordy-voics/gitops/pull/131) restores the production reflector
limit to 1Gi in `clusters/gen-serv/flux-system/kustomization.yaml`, matching the
[upstream v1.2.5 Deployment](https://github.com/fluxcd/image-reflector-controller/blob/v1.2.5/config/manager/deployment.yaml).
Its 64Mi request and concurrency of one stay unchanged. `GOMEMLIMIT` already uses a
`resourceFieldRef` to `limits.memory`, so it follows the new limit automatically.

The production memory-budget check accounts for all workloads, including the maximum ARC runner
count. Requests remain 6144Mi within the 9216Mi budget. The total limit budget increases from
12288Mi to 12320Mi to accommodate the upstream reflector limit. This is an overcommit ceiling,
not a claim that all workloads can consume their limits simultaneously. Dev budgets are unchanged.

Follow the [release runbook](release.md): merge the hotfix into `main` only after CI passes, then
bring the change back into `develop`. Flux follows gitops `main` and rolls out the Deployment.
Do not patch the live resource or disable the alerts.

Verify against the production kubeconfig:

```sh
kubectl -n flux-system rollout status deployment/image-reflector-controller
kubectl -n flux-system get pods -l app=image-reflector-controller
kubectl -n flux-system top pod -l app=image-reflector-controller
kubectl -n flux-system get imagerepositories -o custom-columns=NAME:.metadata.name,SCANNED:.status.lastScanResult.scanTime
```

Confirm all seven timestamps advance, the new pod has no restarts, and stale-scan, deployment
and crash-loop alerts clear. Observe at least several scan intervals; continue watching the
memory trend over subsequent days. A short healthy rollout alone cannot exclude slow growth.

## Separate ARC authentication failure

During the same inspection, `voics-system/discordy-56d88649-listener` repeatedly exited because
GitHub returned `401 Unauthorized: Bad credentials` while obtaining a runner registration token.
This was not an OOM. OpenBao and ExternalSecrets were healthy; syncing an invalid credential
does not make it valid. Three other VM runners were online, so this did not mean all CI was down.

The memory hotfix does not repair ARC authentication. Follow
[ARC credential rotation](secret-rotation.md#arc-github-credentials), including the documented
OpenBao recovery path when the in-cluster runner cannot run `secrets-sync` itself.

## Related history

The [earlier incident](incident-2026-11-02-image-reflector.md) raised the limit from 64Mi to 256Mi.
That earlier recovery did not provide enough headroom for the later workload.
