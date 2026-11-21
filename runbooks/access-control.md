# Kubernetes access control (RBAC): who has what, requesting and changing access

RBAC is enforced on the production cluster (`gen-serv`) since 2026-11-03 ([gitops#32](https://github.com/voics-app/gitops/issues/32)). Before that, microk8s ran without its `rbac` addon. The apiserver then allowed every request (AlwaysAllow), so every pod, every CI job and every token could do anything, including reading every Secret.

Now a request is allowed only when a Role or ClusterRole, bound to the caller, permits it. **Everything that is not granted is denied.**

Rule of thumb: **least privilege.** App services get no Kubernetes API rights at all. A controller gets what its Helm chart ships. A CI job gets only the exact objects it needs, preferably by `resourceNames`.

## Who has what

The source of truth is git: every binding below comes from a manifest or a Helm chart in the `gitops` repo. To see the live state, run:

```bash
kubectl get clusterrolebindings,rolebindings -A -o wide | grep -v ' system:'
```

### People

| Who | How they authenticate | Rights | Defined in |
|---|---|---|---|
| Owner (kubectl) | the microk8s admin kubeconfig (`microk8s config` on the node, copied to `~/.kube/discordy-gen-serv.yaml`) | everything (`system:masters` group) | microk8s itself |
| Owner (Headlamp UI) | a token of ServiceAccount `voics-system/headlamp-admin` (`kubectl -n voics-system create token headlamp-admin --duration=8h`) | `cluster-admin` (owner request 2026-10-20) | `gitops/infrastructure/controllers/headlamp/serviceaccount.yaml` |

The Headlamp **pod** has no rights of its own: chart value `clusterRoleBinding.create: false`. It shows nothing until someone signs in with a token.

### CI (GitHub Actions runner pods in the cluster)

| Who | Rights | Why | Defined in |
|---|---|---|---|
| `voics-system/discordy-runner` | `get` on Secret `voics-data/minio` only | `minio-publish.yml` (gitops publish-site) and gitops `publish-public` read the MinIO key to upload installers, the APK and website files | `gitops/infrastructure/controllers/actions-runner-controller/runner-scale-set/publish-rbac.yaml` |
| same | no Kubernetes rights. `secrets-sync.yml` logs in to **OpenBao** with its service account token (OpenBao role `secrets-sync`, write-only on the secret paths) | OpenBao checks the token through a TokenReview, using its own `system:auth-delegator` binding | OpenBao config (`bootstrap/20-openbao.sh`) |

### Platform controllers (rights come with their Helm chart or manifest)

| Service account | Rights | Defined in |
|---|---|---|
| `flux-system/kustomize-controller`, `helm-controller` | `cluster-admin` (Flux applies everything in git) | Flux install (`gotk-components.yaml`) |
| other Flux controllers | CRDs and their own objects (`crd-controller-flux-system`) | Flux install |
| `voics-system/external-secrets` (+ cert-controller) | read/write Secrets and ExternalSecrets (ESO's chart ClusterRoles) | ESO HelmRelease |
| `voics-system/arc-controller-gha-rs-controller`, listener | runner pods and scale sets in `voics-system` | ARC HelmReleases |
| `voics-system/cloudnative-pg` | Postgres clusters, pods, PVCs and Secrets | CNPG HelmRelease |
| `voics-data/postgres` | its own cluster objects (CNPG-generated Role) | CNPG |
| `voics-system/discordy-ingress-nginx` | Ingresses, Services, Endpoints, its ConfigMap and leader lease | ingress-nginx HelmRelease |
| `voics-system/openbao` | `system:auth-delegator` (validates service account tokens for the OpenBao Kubernetes login) | OpenBao HelmRelease |
| `observability/victoria-metrics` | read pods, nodes, endpoints and services for scraping | VictoriaMetrics manifest |
| `observability/kube-state-metrics` | read cluster objects, including Flux ImageRepositories | `infrastructure/controllers/alerting/kube-state-metrics.yaml` |
| `observability/grafana` | read ConfigMaps and Secrets for dashboard and datasource sidecars | Grafana HelmRelease |
| `kube-system/coredns`, `metrics-server`, `microk8s-hostpath` | microk8s system components | microk8s addons |

### Apps, data stores and jobs: no API access

`voics-apps/api`, `gateway`, `messages`, `admin` and the voice pods have **no bindings**. So do every pod running as `default` in `voics-data`, `voics-system`, `voics-voice` and `observability`: ScyllaDB, Redpanda, Valkey, MinIO, etcd, pgweb, cloudflared, vmalert, alert-relay, blackbox, coturn, and the jobs minio-buckets, redpanda-topics, readonly-grants and openbao-seal-check.

None of them calls the Kubernetes API, as audited on 2026-11-03. The gateway finds its Erlang peers through DNS (`Cluster.Strategy.DNSPoll`), not the API.

## How to request access

1. Open an issue in **gitops** titled `Access request: <who> needs <what>`, labelled `type:infra` and `needs:owner`. Fill in:
   - **Who:** a person, or a service account `<namespace>/<name>`.
   - **What:** API groups, resources, verbs, and the namespace (or cluster-wide). Name objects (`resourceNames`) when you can.
   - **Why:** what breaks without it, and which code or job makes the call.
   - **How long:** permanent, or until a date or ticket.
2. The owner approves or narrows it on the issue. Cluster-wide rights, any `*` verb or resource, and reading Secrets need explicit owner approval.
3. It gets implemented as below, through a PR. **Never with `kubectl create rolebinding` by hand**: Flux would not know about it, and a rebuilt cluster would lose it.

## How to grant access (implementation)

Put the Role and RoleBinding next to the component that needs it in `gitops`, and add the file to that folder's `kustomization.yaml`. Prefer a namespaced `Role` over a `ClusterRole`. Example, modelled on the runner's MinIO read:

```yaml
# Why: <job or code> needs <what> (gitops#<issue>).
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: <component>-<purpose>
  namespace: <namespace of the objects>
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["<exact-name>"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: <component>-<purpose>
  namespace: <namespace of the objects>
subjects:
  - kind: ServiceAccount
    name: <service account>
    namespace: <its namespace>
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: <component>-<purpose>
```

- **A workload that needs API access gets its own ServiceAccount.** Never bind rights to `default`: every other pod in that namespace would inherit them.
- **Helm-managed components:** change the chart's `rbac` and `serviceAccount` values in the HelmRelease instead of adding manifests.
- **Check before merging,** with a dry run against the live cluster, then after Flux applies it:

  ```bash
  kubectl auth can-i get secrets/<name> -n <ns> --as=system:serviceaccount:<sa-ns>:<sa>   # expect yes
  kubectl auth can-i list secrets -n <ns> --as=system:serviceaccount:<sa-ns>:<sa>        # expect no
  ```

- **Update the "Who has what" tables on this page in the same change.** Definition of Done: gitops PR plus this page plus the issue closed with the `can-i` output.

## How to change or revoke access

- **Narrow or remove:** edit or delete the Role/RoleBinding manifest (or the chart values) in gitops through a PR. Flux prunes deleted objects. Check with `kubectl auth can-i ... --as=...` (expect `no`) and update the tables here.
- **Headlamp sessions:** tokens are short-lived (`--duration`). To cut off everyone at once, delete and recreate the `headlamp-admin` ServiceAccount (Flux recreates it), which invalidates all tokens.
- **A leaked token** of any service account: delete the pod (projected tokens are bound to it) or recreate the ServiceAccount.

## Break-glass and rollback

- **Lost kubectl access:** on the node, `microk8s config > ~/.kube/config` prints a fresh admin kubeconfig (`system:masters`).
- **A component broke because RBAC denied it:**
  1. Find the denial with `kubectl get events -A | grep -i forbidden`, or in the component's logs (`... is forbidden: User "system:serviceaccount:..." cannot ...`).
  2. Add the narrow Role/RoleBinding through a PR as above.
  3. Only as a last resort, turn RBAC off on the node (`microk8s disable rbac`, about a minute of control-plane restart), fix it, and turn RBAC back on.
- **New environments get RBAC automatically:** `bootstrap/10-prepare-node.sh` enables the `rbac` addon, and `bootstrap/60-verify.sh` fails if an app service account can list Secrets.

## Checks

```bash
bash bootstrap/60-verify.sh        # includes "RBAC enforced (app service accounts cannot read Secrets)"
kubectl auth can-i --list --as=system:serviceaccount:voics-system:discordy-runner -n voics-data
kubectl auth can-i list secrets -n voics-data --as=system:serviceaccount:voics-apps:api   # no
```

## History

- **2026-10-20:** found that the cluster had no RBAC (gitops#32, P0).
- **2026-11-03:** audit showed nothing outside the bound controllers uses the API. Headlamp's own service account lost its chart-default `cluster-admin`. RBAC was enabled on `gen-serv` and added to bootstrap.
