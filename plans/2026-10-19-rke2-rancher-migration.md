# Voorstel: gen-serv later naar RKE2 en Rancher migreren

Status: historisch voorstel, herzien op 18 november 2026; niet goedgekeurd voor uitvoering en niet uitgevoerd.

Gerelateerd: [gitops#22](https://github.com/discordy-voics/gitops/issues/22), [gitops#21](https://github.com/discordy-voics/gitops/issues/21), [beheerkeuzes](../handbook/16-status-en-beheerkeuzes.md).

## De uitgangssituatie is veranderd

Het voorstel van 19 oktober ging uit van een nog niet gelanceerd product zonder gebruikersdata. **Die aanname is niet meer geldig.** Voics is live; productie bevat accounts, berichten en bestanden. Een clean reinstall, `snap remove --purge microk8s` of nieuwe bootstrap op gen-serv is geen toegestane voorbereidingsstap.

De bestaande machine `.212` draait Ubuntu 24.04.5, MicroK8s 1.35.6 met etcd, 8 vCPU en 12 GB toegewezen RAM. dqlite is niet meer de actieve datastore. Deze vaststelling vervangt oude geheugen-/datastoreaannames in het oorspronkelijke voorstel. De VM `.204` van het andere product blijft buiten iedere migratie.

De huidige opdracht staat alleen voorbereiding voor een extra worker toe. [De workerroute](../runbooks/server-uitbreiden.md) verandert de besturing niet en levert geen drie-server-HA op. Back-ups zijn nu uitsluitend een [plan](../runbooks/backup-restore.md), geen bewezen vangnet voor een herinstallatie.

## Wanneer dit voorstel weer relevant wordt

Een aparte migratie kan zin hebben als daadwerkelijk drie control-plane-servers, een passend opslagontwerp en beheer via Rancher gewenst zijn. RKE2/Rancher, MicroK8s-workers en een aparte ontwikkelomgeving zijn verschillende projecten. Een keuze voor een worker is geen impliciete keuze voor deze migratie.

Kies bij heropening gepinde, onderling ondersteunde RKE2-, Kubernetes-, CNI-, cert-manager- en Rancherversies op basis van de dan geldige leveranciersdocumentatie. Oude versievoorstellen uit oktober zijn geen automatische installatiekeuze. Begroot Rancher, controllers, stores en reserves per node met echte metingen; 16 GB is een te toetsen kandidaat, geen reeds uitgevoerde upgrade of bewezen voldoende capaciteit.

## Voorwaarden vóór uitvoerbare migratiecommando’s

| Voorwaarde | Vereist bewijs |
|---|---|
| Toestemming en moment | Afzonderlijke expliciete opdracht tot migreren, onderhoudsvenster en aanspreekpunt |
| Inventaris | Volumes, databases, objecten, netwerk, secrets, TLS, identities en configuratierevisies |
| Herstel | Complete onafhankelijke backupset en geslaagde geïsoleerde restore van gebruikersdata en OpenBao |
| Sleutels | Ontsleuteling mogelijk zonder verloren VM/cluster; signing-, tunnel- en externe credentials beschikbaar |
| Opslag | Expliciete mapping van hostpath-PVC’s naar doelopslag, capaciteit, rechten en integriteitscontrole |
| HA | Drie stemgerechtigde besturingsleden over geschikte failure domains; API-endpoint/VIP en uitvalproef |
| Toepassingen | Veilige ID-toewijzing, workers/consumers, ingress/WebSocket/UDP en placement onafhankelijk beoordeeld |
| Terugval | Criteria, bewaartermijn bron, DNS-/IP-route en omgang met nieuwe writes na omschakeling |

Een Proxmox-snapshot op dezelfde host is niet voldoende als enige rollback- of disaster-recoveryroute. Terugzetten nadat gebruikers op het nieuwe cluster hebben geschreven kan data verliezen; de terugvalgrens moet daarom expliciet worden gekozen.

## Gefaseerd ontwerp met behoud van data

1. **Inventariseer en bewijs herstel.** Volg het backupplan, inclusief PostgreSQL, Scylla, MinIO, PebbleDB/static seal, clusterconfiguratie en eventuele ID-watermarks.
2. **Bouw later een geïsoleerd doel.** Pas na toestemming; geen gedeelde productie-identiteit of externe meldingen. Werk alle manifests en opslinks in een aparte branch bij.
3. **Oefen migratie.** Herstel een consistente set; test rechten, gesprekken, bestanden, zoekindex, mail/push met testproviders, WebSockets en voice op daarvoor bestemde endpoints.
4. **Leg omschakeling vast.** Kies schrijfstop, laatste synchronisatie, verificatiepunten, source retention en abortcriteria. Voorkom twee actieve schrijvende omgevingen onder dezelfde identiteit.
5. **Voer het onderhoud uit.** Alleen na aparte uitvoeropdracht en met gereviewde daadwerkelijke scripts. Geen ongecontroleerde verwijdering van MicroK8s of PVC’s.
6. **Verifieer en observeer.** Technische gereedheid, twee echte clients, externe UDP/TURN-proef, belasting en uitval van één bedoeld lid.
7. **Ruim pas later op.** Bewaar bronvolumes en herstelsets tot het afgesproken bewijs en de retentie zijn gehaald. Definitieve verwijdering is een eigen actie.

## Replicatie blijft per dienst een apart ontwerp

Een nieuwe StorageClass of drie Kubernetes-nodes maakt Scylla, Postgres, Redpanda, MinIO, OpenBao en Valkey niet vanzelf HA. Scylla heeft nu een vast `scylla-0`-broadcastadres; OpenBao gebruikt PebbleDB met static seal; de notifier is singleton. Ontwerp en oefen elke omzetting afzonderlijk. Een overgang naar OpenBao-Raft of transit-seal is geen kleine helmwaarde-aanpassing zonder data-/sleutelprocedure.

## Oplevergrens

Deze herziening corrigeert gevaarlijke oude aannames en maakt de voorwaarden reviewbaar. Er is geen nieuwe server gemaakt, geen migratie uitgevoerd, geen opslag verplaatst en geen backup geactiveerd. gitops#22 en de HA-acceptatie van gitops#21 blijven daarom open.
