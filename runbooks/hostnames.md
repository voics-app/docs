# Public hostnames

The product runs on `voics.nl`. The old `discordy-*` names still work next to the new ones while installed apps move over.

| Purpose | Name | Old name |
|---|---|---|
| Website and invite pages | `voics.nl`, `www.voics.nl` | `discordy.voics.nl` |
| API | `api.voics.nl` | `discordy-api.voics.nl` |
| Gateway | `gateway.voics.nl` | `discordy-gateway.voics.nl` |
| Files | `cdn.voics.nl` | `discordy-cdn.voics.nl` |
| Desktop updates | `updates.voics.nl` | `discordy-updates.voics.nl` |
| Voice region | `rtc-nl-home.voics.nl` | `discordy-rtc-nl-home.voics.nl` |
| Operator tools | `admin`, `ops`, `grafana`, `headlamp`, `db`, `scylla`, `minio`, `redpanda`, `openbao` | the same names with a `discordy-` prefix |

Operator tools sit behind the IP lock and Cloudflare Access (one-time PIN, owner only).

## How it is wired

`cluster-config` holds both sets: `HOST_*` is now the public Voics name and `HOST_*_NEXT` retains the old compatibility alias (`HOST_LANDING_WWW` is `www`). Every ingress has a rule for each. `bootstrap/40-cloudflare.sh` creates missing records and Access apps; it never overwrites a record.

## The takeover of 2026-11-06

The owner approved moving `voics.nl`, `www`, `grafana`, `ops` and `headlamp` from the old product's tunnel to this cluster. Access was added first, then the records were repointed. To undo it, point those CNAMEs back at the old tunnel, `c23910f2-b539-422c-8775-c4d1137f1977.cfargotunnel.com`.

Records of the old product that stayed: `app`, `voice`, `k8s`, `elastic`, `pgadmin`, `prometheus`, `lab`, `portainer`, and the Clerk and mail records. Mail records (MX, SPF, DKIM) were not changed.

## Still to do

1. The primary-host flip is complete: services and the current client brand source hand out `api.voics.nl`, `gateway.voics.nl`, `cdn.voics.nl`, `updates.voics.nl` and the Voics landing URL. Keep aliases while supported installed clients need them.
2. Verify login, file upload, push and a real cross-device call with the actual released versions, including an external mobile network. A 200/101 health result is not media acceptance.
3. Inventory old-host use and update-feed reachability before removing any alias. No old hostname or protected record was removed during the prepare-only programme.
