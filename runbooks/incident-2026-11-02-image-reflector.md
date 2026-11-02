# Incident 2026-10-31 → 11-02: image automation frozen (image-reflector crash loop)

**Impact:** no new image rolled out to production for about 2 days. Running services were not affected. voice 0.1.6 was published to GHCR on 11-02 but production stayed on 0.1.5.

**Timeline (UTC)**
- 2026-10-31 10:43: last successful image scan. `image-reflector-controller` starts crash-looping (exit 2 right after its Badger tag DB opens).
- 2026-10-31 10:45: vmalert `DeploymentNotReady flux-system/image-reflector-controller` fires. **No one is notified:** the `ops-alerts` webhook Secret does not exist (gitops#56). Only the ops portal banner shows it.
- 2026-11-02 19:00: found during the voice 0.1.6 rollout check (the image policy still resolved 0.1.5; `lastScanTime` was 10-31, with a 5m interval). The pod had restarted 1024 times.
- 2026-11-02 19:40: gitops#60 (memory 64Mi → 256Mi) merged; a fresh pod (new emptyDir) scanned at 19:41.
- 2026-11-02 19:44: voice-signaling 0.1.6 rolled out, 1/1 Ready.

**Cause:** the reflector keeps its tag database in Badger on an emptyDir and replays it at startup. With a 64Mi limit (set when Flux was sized down for the 7.7 GiB VM) the replay no longer fit once the tag history grew, and the container died on every start.

**Fix:** `clusters/gen-serv/flux-system/kustomization.yaml` (and dev, 160Mi to stay inside its memory budget): request 64Mi, limit 256Mi.

**How to spot it next time**
```sh
kubectl -n flux-system get pods | grep image-reflector             # restarts / 0/1
kubectl -n flux-system get imagerepositories -o custom-columns=NAME:.metadata.name,SCANNED:.status.lastScanResult.scanTime
```
A `SCANNED` time older than a few intervals means image automation is frozen.

**Follow-ups:** create the `ops-alerts` webhook Secret (gitops#56), the real gap. An image-scan staleness alert is optional. Tracked in gitops#61.
