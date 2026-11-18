# Een tweede server voorbereiden en later toevoegen

Summary: van een lokale inventaris naar een gecontroleerde worker, met uitleg over verkeersverdeling, gegevensopslag en veilig onderhoud.

**Stand: 18 november 2026. Alleen voorbereiding is nu toegestaan.** Er is geen nieuwe VM gemaakt, geen worker aangesloten en geen productieomgeving gemigreerd. Uitvoercommando’s staan apart voor een later, uitdrukkelijk aangevraagd onderhoudsmoment. Het back-upwerk is eveneens alleen een [plan](backup-restore.md).

## Wat een tweede server oplevert

De bestaande machine is `gen-serv`, productie op `192.168.1.212`: Ubuntu 24.04.5, 8 vCPU, 12 GB toegewezen RAM en MicroK8s 1.35.6 met etcd. Opslag gebruikt `microk8s-hostpath`. De VM op `192.168.1.204` hoort hier niet bij en blijft buiten dit werk.

Een **worker** is een extra machine waarop Kubernetes geschikte toepassingen draait. Deze route houdt de besturing op gen-serv. Dat kan capaciteit vrijmaken, maar bij uitval van gen-serv zijn besturing en lokale databases nog steeds geraakt.

| Begrip | Betekenis |
|---|---|
| Extra capaciteit | Meer CPU/RAM voor workloads die veilig elders kunnen draaien |
| Load balancing | Nieuwe aanvragen verdelen over beschikbare, gezonde instanties |
| Control-plane-HA | Clusterbesturing blijft werken na verlies van een lid; een worker maakt geen derde stemgerechtigd etcd-lid |
| Data-HA | Geteste databasereplicatie en failover; een tweede lege schijf kopieert geen data |
| Back-up | Afzonderlijke herstelkopie bij verlies, corruptie of een verkeerde wijziging |

De [Canonical-documentatie](https://canonical.com/microk8s/docs/clustering) onderscheidt workers van control-plane-nodes. Deze route gebruikt `--worker` en is geen omzetting naar een drieledige HA-besturing. Twee VM’s op dezelfde fysieke Proxmox-host delen bovendien stroom-, schijf- en netwerkstoringen.

## 1. Kies de juiste route

| Doel | Route |
|---|---|
| Worker bij productie | `scripts/worker.py` in de gitopsrepo; deze handleiding |
| Afzonderlijke ontwikkelomgeving | Dev-root en `env.sh`; [omgevingen](environments.md). Nu niet uitvoeren |
| Andere geografische spraaklocatie | [Spraakregio toevoegen](voice-regions/adding-a-region.md), met eigen publieke routing |
| RKE2/Rancher | Afzonderlijk [voorstel met behoud van data](../plans/2026-10-19-rke2-rancher-migration.md), nu niet uitvoeren |

Gebruik voor een worker nooit `env.sh up gen-serv` of `bootstrap/10-prepare-node.sh`: dat zijn omgevings-/clusterbootstraproutes met andere aannames. Replica-aantallen verhogen vervangt geen workerplan.

## 2. Voorwaarden

| Onderdeel | Nodig |
|---|---|
| Werkstation | Python 3.10+, OpenSSH, Terraform 1.9.8; PowerShell is geschikt |
| Proxmox | 8 vCPU, 16 GiB RAM en 150 GiB SSD-opslag beschikbaar voor de toekomstige worker |
| Identiteit | Vrije naam, gereserveerd ongebruikt statisch IP en vrij VM-ID boven 107 |
| Image | Ubuntu 24.04 amd64 met cloud-init, snapd, openssl en util-linux/flock |
| SSH | Publieke sleutel in cloud-init; privésleutel in eigen SSH-agent; gecontroleerde hostkeys en niet-interactieve sudo |
| Cluster | Correcte `kube-system`-UID, gen-serv-adres en exacte MicroK8s-versie |
| Netwerk | Private verbinding, tijdsynchronisatie, passende MTU en de werkelijk gebruikte CNI-/etcd-poorten |
| Credentials | Proxmox-toegang via `PROXMOX_VE_ENDPOINT` en `PROXMOX_VE_API_TOKEN`; geen waarden in JSON, Git of Notion |

Tussen nodes zijn onder andere TCP 25000 (cluster agent), 16443 (API) en 10250 (kubelet) relevant. De geïnstalleerde niet-HA-etcdconfiguratie gebruikt de legacy flannel/etcd-route; controleer de feitelijke configuratie, waaronder TCP 12379 waar nodig. Neem geen willekeurige Calico-poortenlijst over. Open deze interne poorten niet op internet.

## 3. Maak de lokale inventaris

Open PowerShell in de gitopsrepo. Deze opdrachten maken alleen lokale configuratie en tonen het plan:

```powershell
Copy-Item -LiteralPath infra/workers/workers.example.json -Destination infra/workers/worker-1.local.json
python scripts/worker.py describe infra/workers/worker-1.local.json
python -m unittest discover -s tests -v
```

Gebruik bij herhaling je bestaande bestand; overschrijf het niet met het voorbeeld. `describe` doet geen netwerkaanvragen. Het voorbeeld bevat bewust geen geldige SSH-publieke sleutel.

| JSON-veld | Invullen |
|---|---|
| `name`, `host`, `ssh_user` | Werkelijke workernaam, gereserveerd adres en SSH-gebruiker |
| `control_plane_host`, `control_plane_user`, `control_plane_name` | Bestaande besturing: `.212`, `karma`, `gen-serv` |
| `cluster_uid` | UID uit het leescommando hieronder; identificatie, geen geheim |
| `microk8s_version` | Gecontroleerde control-plane-versie, nu `1.35.6` |
| `proxmox.vm_id`, `node`, `datastore` | Vrij VM-ID, feitelijke Proxmox-host en geschikte datastore |
| `proxmox.ipv4_cidr`, `gateway` | Gereserveerd adres met prefix en juiste LAN-gateway |
| `proxmox.ssh_public_keys` | Echte publieke SSH-sleutel, nooit een privésleutel |

```powershell
kubectl --kubeconfig "$env:USERPROFILE/.kube/discordy-gen-serv.yaml" get namespace kube-system -o jsonpath='{.metadata.uid}'
kubectl --kubeconfig "$env:USERPROFILE/.kube/discordy-gen-serv.yaml" get nodes -o wide
```

Voorbeeldadres `.214` en VM 109 zijn geen reserveringen: controleer eerst of ze vrij zijn. `.204`, `.212` en de productie-VM zijn geen kandidaten. Houd lokale JSON-bestanden en `.worker-state` buiten Git. Bewaar de statusmap voor veilige herhaling van de latere uitvoering.

## 4. Bekijk het Terraform-plan

Na het veilig instellen van de bestaande Proxmox-toegang:

```powershell
python scripts/worker.py plan infra/workers/worker-1.local.json
terraform show infra/workers/.worker-state/voics-worker-1/worker.tfplan
```

Het tweede pad gebruikt de `name` uit de inventaris. Pas dat naamdeel aan wanneer je een andere naam koos. `plan` leest de provider en schrijft lokaal metadata en een opgeslagen plan, zonder VM’s te maken. Providers kunnen worden gedownload. Publiceer geen plannen/state: die kunnen gevoelige configuratie bevatten.

Controleer VM-ID, adres, datastore, capaciteit en alle acties. Alleen bedoelde workerimage-/VM-creaties of geen wijziging passeren de guard. Updates, vervanging, verwijderen, clusterbootstrap en gewijzigde inventaris worden geweigerd. Omzeil dit niet met een losse `terraform apply`.

**Hier stopt de huidige opdracht.** Je hebt een reviewbaar plan en offline controles, nog geen nieuwe machine.

## 5. Later uitvoeren

Onderstaande opdrachten zijn voor een toekomstig moment waarop aanmaken en aansluiten expliciet is gevraagd. Ze zijn nu niet uitgevoerd.

```powershell
python scripts/worker.py provision infra/workers/worker-1.local.json --execute
```

Controleer vervolgens de SSH-hostkey via de Proxmox-console en voeg alleen de geverifieerde sleutel toe aan `known_hosts`. Ga pas verder als naam, adres, sleutel en lege machine overeenkomen met de inventaris.

```powershell
python scripts/worker.py prepare infra/workers/worker-1.local.json --execute
python scripts/worker.py join infra/workers/worker-1.local.json --execute
python scripts/worker.py verify infra/workers/worker-1.local.json
```

`prepare` installeert de exacte snap-revisie van de besturing en weigert een bestaande MicroK8s-installatie zonder eigen voorbereidingsmarker. Het bootstrapt geen Flux, secrets, addons of data op de worker.

`join` controleert cluster-UID, versie, adres, etcd en gereedheid. De node wordt vooraf gereserveerd met `voics.nl/workload=stateless:NoSchedule`. Alleen bewust toegelaten workloads mogen daar later landen. De tijdelijke uitnodiging gaat via SSH met TLS-fingerprintcontrole en komt niet in Terraform of loguitvoer.

`verify` controleert de worker, marker, versie, uitgeschakelde eigen datastore, kubelet-doel en taint. Na een onderbroken join herstel je de oorzaak en herhaal je de gecontroleerde join. Een taint verwijderen is geen reparatie.

## 6. Hoe verkeer wordt verdeeld

```text
Website / API: telefoon of desktop → Cloudflare-tunnel → ingress → gezonde Service-endpoints
Gateway:       dezelfde ingang → één blijvende WebSocket naar één gatewaypod
Spraak:        signaalverbinding + rechtstreeks UDP / TURN naar de gekozen spraaknode
Data:          API / messages → bestaande databases en objectopslag
```

HTTP-aanvragen kunnen over gezonde instanties worden verdeeld. Een bestaande WebSocket verhuist niet; na onderbreking verbindt de client opnieuw. [Cloudflare beschrijft](https://developers.cloudflare.com/network/websockets/) dat netwerkupdates en inactiviteit WebSockets kunnen beëindigen. Gedeelde hervatstatus en fan-out moeten ook werken wanneer een reconnect op een andere pod eindigt.

Spraak-UDP volgt niet de HTTP-verdeling. Een SFU heeft een uniek node-ID, eigen geadverteerd endpoint en publieke UDP-routing nodig. Voor de huidige thuisregio zijn UDP 50000, UDP/TCP 3478 en UDP 49160–49170 naar `.212` opgegeven. Externe bereikbaarheid is nog niet afgetekend; een HTTP-healthcheck bewijst die niet.

## 7. Replica’s: wat kan later omhoog?

Het **niet-geactiveerde** profiel `worker-capacity` bereidt twee cloudflared- en twee ingress-nginx-replica’s voor met verplichte spreiding over hostnamen en minimaal één beschikbare replica. Alleen deze workloads tolereren de workertaint. Productie en dev zijn niet omgezet.

| Onderdeel | Voorwaarde |
|---|---|
| cloudflared / ingress-nginx | Beide nodes, netwerk en foutscenario’s getest; profiel daarna via GitOps activeren |
| API / messages | Veilige unieke Snowflake-toewijzing per proces; huidige vaste worker-ID’s zijn geen veilige scale-outconfiguratie. Allocatorontwerp is nog geen afgeronde runtime |
| Gateway | Unieke runtime-identiteit, clusterverbinding, fan-out, reconnect/resume en stores op twee processen getest; gateway-ID’s zijn UUID’s, geen Snowflakes |
| Notifier | Singleton met Recreate zolang meerdere consumenten dubbele pushes kunnen veroorzaken |
| SFU / signaling / TURN | Unieke registraties, endpoints en ID’s; eigen UDP-route; geen blinde replica-verhoging van de thuisregio |
| Scylla | Nu één developer-mode-node met vast broadcastadres `scylla-0`; eerst seeds, identiteit, replicatie en herstelproef |
| Postgres, MinIO, OpenBao, Redpanda, Valkey | Eigen replicatie-/migratieplan; hostpath-PVC’s blijven op de oorspronkelijke node |

De nieuwe gatewaycontroles beoordelen verbindingen vóór eventverwerking. Een netwerkbreuk midden tijdens fan-out wordt daardoor niet transactioneel of precies-eenmaal. Een geldige voice-registratie bewijst evenmin dat elk geadverteerd endpoint bereikbaar is.

## 8. Verificatie vóór echt verkeer

Deze proef is nog niet uitgevoerd. Voer hem later eerst in een wegwerpomgeving uit:

1. Verifieer beide nodes en image pulls, inclusief geldige registrycredentials.
2. Test DNS, verkeer tussen pods in beide richtingen en Service-routing met geïsoleerde workloads op beide nodes.
3. Controleer HTTP en WebSockets via elke ingressreplica en bevestig de ontvangende pods zonder tokens te loggen.
4. Onderbreek gecontroleerd één worker; controleer nieuwe aanvragen en reconnects via de overblijvende ingress. Noteer ook bestaande verbroken verbindingen.
5. Meet plaatsing en geheugen onder belasting. Een totaalbudget voor één machine bewijst geen capaciteit per node.
6. Test voice afzonderlijk met een deelnemer buiten het LAN, inclusief TURN en reconnects.

Het controllerprofiel voegt samen 192 MiB aangevraagd geheugen en 304 MiB aan limieten toe. Elke node heeft daarnaast OS, containerd, kubelet, CNI en onder andere node-exporter nodig. Meet werkelijk gebruik.

Na de proef is een aparte GitOps-PR nodig: `infra-controllers` naar `./infrastructure/environments/worker-capacity/controllers`, `infra-configs` naar de bijbehorende `configs`, en de dormant-assertie in `scripts/check-worker-profile.sh` aanpassen. Behoud de afhankelijkheidsvolgorde. Gebruik het productieprofiel niet als dev-profiel.

## 9. Later onderhoud en verwijderen

Bekijk eerst de drain zonder uitvoering:

```powershell
python scripts/worker.py drain infra/workers/worker-1.local.json
```

Tijdens later toegestaan onderhoud:

```powershell
python scripts/worker.py drain infra/workers/worker-1.local.json --execute
python scripts/worker.py uncordon infra/workers/worker-1.local.json --execute
```

Drain respecteert PDB’s en weigert gewone pods met hostNetwork, hostPath of PVC’s. Het gebruikt geen force- of dataverwijderopties. Herstel bij een blokkade de replica’s en gereedheid; omzeil de bescherming niet.

Voor definitieve verwijdering: bewijs de drain, voer alleen op de bedoelde worker `sudo microk8s leave` uit en verwijder daarna op de besturing die specifieke node met `sudo microk8s remove-node <workernaam>`. Controleer overblijvende nodes en endpoints. Dit is een afzonderlijke expliciete onderhoudshandeling. Het hulpmiddel heeft geen destroy-commando. Bewaar Terraform-status en verwijder geen VM om een mislukte join te verbergen.

## Bewijs en resterende voorwaarden

[Gitops PR 132](https://github.com/discordy-voics/gitops/pull/132) is naar develop gemerged. De coördinator herhaalde vijftien offline veiligheidstests; vijf Terraform-roots zijn gevalideerd. JSON-velden en opdrachten in deze handleiding zijn tegen die implementatie gecontroleerd.

Dit bewijst nog geen cloud-init, snap-installatie, join, echt netwerkverkeer, drain of herstel. Zie de [technische workerhandleiding](https://github.com/discordy-voics/gitops/blob/develop/infra/workers/README.md) en [acceptatie-inventaris](https://github.com/discordy-voics/gitops/blob/develop/infra/workers/backlog-readiness.md). Bestaande registry-/ARC-credentialproblemen vereisen de aangewezen secretflow; gebruik nooit een brede GitHub-CLI-login als clustercredential.
