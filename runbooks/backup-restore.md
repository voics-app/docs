# Back-up- en herstelplan

Summary: wat Voics moet kunnen herstellen, benodigde kopieën, voorgestelde bewaartermijnen en de latere herstelproef.

**Status op 18 november 2026: plan, niet geactiveerd.** Er is geen offsite-bestemming ingericht, geen job of schema geactiveerd en geen herstelproef uitgevoerd. Er is nog geen bewezen RPO of RTO. [gitops#117](https://github.com/discordy-voics/gitops/issues/117) blijft open.

Productie is live en bevat gebruikersdata. De ene VM, hostpath-volumes en lokale MinIO delen een storingsrisico. Een extra [worker](server-uitbreiden.md), lokale snapshot of kopie in dezelfde MinIO neemt dat niet weg.

## 1. Huidige toestand

| Onderdeel | Vastgesteld / in repository | Nog niet aangetoond of ingericht |
|---|---|---|
| Postgres | CloudNativePG, één instantie, PostgreSQL 17.6; `infrastructure/data/postgres/postgres.yaml` | Geen backupsectie, ScheduledBackup of hersteltemplate in deze root; geen bewezen WAL-archief/PITR |
| Scylla | Eén node, CQL-migraties in messages | Geen `scylla-backup`-CronJob of bewezen offsite-SSTablekopie |
| MinIO | Eén instantie; buckets `discordy-assets`, `discordy-attachments`, `discordy-updates`, `discordy-site` | Geen `infrastructure/data/minio/offsite.yaml`; versiebeheer, object lock, retentie en offsite-kopie niet bewezen |
| OpenBao | PebbleDB op `/openbao/data/pebbledb`, static-key-seal | Geen Raft-opslag of dagelijks Raft-snapshotproces; oude lokale kopie is geen actuele herstelgarantie |
| Clusterbesturing | MicroK8s 1.35.6 met etcd op gen-serv | Geen hier geverifieerd schema voor herstelbare control-plane-snapshots |
| Applicatie-etcd | Afzonderlijke etcd in `voics-data` voor leased voice-registraties | Geen volledige afhankelijkhedeninventaris/herstelproef |
| Valkey | Lokale AOF met `appendfsync everysec` | AOF is geen offsite-back-up; bevat ook tijdelijke bezorging en sessiestaat |
| Redpanda | Eén broker; events en offsets | Geen garantie dat alle verloren events opnieuw kunnen worden gemaakt |
| Proxmox | Productie-VM bestaat | Wekelijkse `vzdump`, opslag buiten de host en werkende restore niet vastgesteld |
| Code/configuratie | Git en declaratieve manifests | Git bevat geen database-inhoud, appbestanden, alle signing keys of automatisch alle secrets |

De vorige tekst beschreef geplande jobs alsof ze draaiden. Die claims en instructies om zomaar PVC’s te verwijderen zijn vervallen. Een ontbrekend bestand of oude tekst bewijst geen bestaande back-up.

## 2. Gegevensinventaris

| Gegevens | Hersteldoel en aandachtspunt |
|---|---|
| Postgres `discordy` | Accounts, credentials, sessies, servers, rollen, rechten, instellingen, uitnodigingen, auditdata, outbox; schema/migratieversie |
| Postgres `discordy_admin` | Beheerdersdata, schema en rollen afzonderlijk meenemen |
| Postgres `discordy_search` | Afgeleide zoekindex; herbouwbaar vanuit Scylla, maar backfill/checkpoints kosten tijd en moeten zijn getest |
| Scylla-keyspace `discordy` | Berichten, reacties, pins, read states; schema, volledige SSTablecomponenten en migratiestatus |
| Voorgestelde poll-keyspace `<SCYLLA_KEYSPACE>_polls` | Stemrevisies, tellingen, definitieve/verwijderde status en vervalindex; samen met het hoofdkeyspace back-uppen en herstellen nadat alle poll-writers/workers zijn gedraind. Een leeg companion-keyspace is geen geldige nulstand. Zie [ADR0029](../adr/0029-persistent-polls.md). |
| MinIO | Gebruikersassets/bijlagen met metadata en beleid; daarna updatefeed, installers, website en uitnodigingspagina’s |
| OpenBao | Consistente PebbleDB-data, configuratie, versie en secret-inventaris; static seal key onafhankelijk bewaren |
| Kubernetes-etcd | Clusterobjecten, PVC-/PV-koppelingen, Secrets; gevoelige data. Niet dezelfde etcd als voice-discovery |
| Terraform/operatorstatus | State, provider-/lockversies, inventories, Git-commits, herstelbare DNS-/hosting-/registrytoegang |
| Signing/externe accounts | Apple/Android signing, push, tunnel, e-mail en CI-toegang inventariseren zonder waarden te publiceren |
| Toekomstige ID-allocator | Reserveringen en hoogste ooit toegekende tijdgrens; een oudere databasekopie alleen mag geen ID-hergebruik veroorzaken |

Leg per bron volume, versie, omvang, laatste wijziging en eigenaar vast. Een bericht zonder bijbehorend object is geen complete bijlage. Losse snapshots van verschillende databases zijn niet automatisch onderling consistent. Voor de eerste complete herstelset kan een onderhoudsvenster met gestopte schrijvers nodig zijn.

## 3. Voorgestelde doelen en retentie

**Voorstellen, geen SLA of bestaande planning.** RPO is het gewenste maximale dataverlies in tijd. RTO is de gewenste tijd tot bruikbaar herstel inclusief controles. Het hele product herstellen duurt langer dan één bestand terugzetten.

| Onderdeel | Voorgesteld doel na inrichting | Frequentie / retentie als voorstel | Eerste mijlpaal |
|---|---|---|---|
| Postgres | RPO 1 uur, later 5 minuten met bewezen WAL; RTO 4 uur | Eerst dagelijkse logische dumps, 14 dagen; daarna base backups/WAL en 14 dagen PITR | Dump inclusief rollen en beide primaire databases herstellen. Dagelijks alleen haalt het uurdoel nog niet |
| Scylla | RPO 24 uur, RTO 8 uur | Dagelijks snapshot/schema; 14 dagen + 3 maandsets | Benodigde tabellen in geïsoleerde instantie teruglezen |
| Gebruikersobjecten | RPO 1 uur, RTO 8 uur afhankelijk van volume/bandbreedte | Uurlijkse kopie met versies, 30 dagen bescherming | Inhoud, metadata en referenties herstellen |
| OpenBao | RPO 24 uur en vóór sleutel-/configuratieverandering; RTO 2 uur | Consistente kopie 30 dagen, sealversies overeenkomstig bewaren | Herstellen zonder productie of het verloren cluster nodig te hebben |
| Cluster/operatorconfiguratie | RPO 24 uur en vóór risicowijziging; RTO 4 uur | Versleutelde etcd-/statekopieën 7 dagen; commits in Git | Geïsoleerde besturing met juiste koppelingen |
| Hele VM | Aanvullend vangnet; RPO 7 dagen, RTO meten | Wekelijks, 4 generaties, buiten fysieke host | Booten zonder productienetwerk en integriteit testen |

Pas doelen aan op kosten en gemeten herstelduur voordat beleid wordt vastgesteld. Een mislukte dagelijkse kopie kan meer dan 24 uur verlies betekenen. Monitor daarom de leeftijd van de laatste **herstelbare** set.

## 4. Bestemming en sleutelbewaring

Kies een S3-compatibele bestemming buiten het huis en de Proxmox-host. Leg leverancier, regio, kostenplafond, retentie en toegangsbeheer vast. Dit plan kiest of bestelt geen leverancier. Lokale staging helpt eventueel met upload, maar telt niet als offsite-kopie.

Versleutel vóór upload en tijdens transport. Scheid productiecredentials, beperkte backup-writer en het account dat mag herstellen/retentie wijzigen. De writer hoort beschermde oude versies niet te kunnen wissen. Test versiebeheer, object lock en lifecyclebeleid op een proefbucket. Een mirror die verwijderingen doorgeeft kan een ongeluk verspreiden.

Bewaar decryptiesleutels en de OpenBao-static-seal-key buiten backupbucket en cluster. De bestaande DPAPI-kluis op de eigenaarspc is een opslagplaats, maar onafhankelijke escrow is nog niet geverifieerd. Het plan is onvolledig als verlies van die pc ook de enige sleutel vernietigt.

Noteer zonder waarden: key-ID, aanmaak-/rotatiedatum, bewaarder, tweede herstelroute en bijbehorende sets. Recovery shares vervangen niet de static seal key. Bewaar oude sleutels zolang een bijbehorende herstelset nodig is. Een Kubernetes-etcd-kopie kan de seal-secret bevatten en vraagt extra afscherming; die mag niet de enige sleutelroute zijn.

## 5. Procedure per bron, later te implementeren

Dit zijn ontwerpprocedures, geen beschikbare jobs. Voor uitvoering komen gereviewde scripts/manifests met expliciete context, doelcontroles, foutafhandeling, beperkte credentials, hashes en hersteltests. Hier wordt geen live data geëxporteerd.

### Postgres

Begin met logische dumps per database in custom formaat en een beveiligde dump van rollen/globals. Controleer versies, eigenaren, extensies en rechten. [PostgreSQL documenteert](https://www.postgresql.org/docs/current/backup-dump.html) dat `pg_dump` één database dekt en clusterbrede rollen afzonderlijk moeten worden meegenomen. Tools moeten passen bij de serverversie.

Herstel naar lege geïsoleerde databases. Controleer aantallen, steekproeven, foreign keys, authenticatie en transacties. Voeg daarna een versiegeschikte CloudNativePG-backupintegratie voor base backups/WAL toe en test een gekozen herstelmoment. Beloof vóór die proef geen PITR en verwijs niet naar een ontbrekende `restore-template.yaml`.

Oud herstel kan afgehandelde outboxevents opnieuw aanbieden en latere sessie-intrekkingen terugdraaien. Houd consumenten tijdens de proef uit en bereid bij echt herstel sessie-invalidatie en reconciliatie voor. Niet alle neveneffecten zijn bewezen precies-eenmaal of automatisch veilig.

### ScyllaDB

Voor de voorgestelde [atomische read-accounting](read-accounting.md) horen de hoofdkeyspace en `SCYLLA_READ_STATE_KEYSPACE` (standaard `<hoofdkeyspace>_reads`) bij **één herstelset**. Neem beide schema's, alle tabellen/migratiemarkers, replicatie-instellingen en de effectieve namen mee. Fence alle messages-schrijvers tijdens een coherent checkpoint en restore. Herstel van maar één keyspace kan discovery, tellers en deduplicatie uit elkaar trekken. Oude en nieuwe schrijvers mogen niet overlappen; een binary-only rollback na nieuwe writes leest verouderde legacy-tellers. Volg het gekoppelde runbook; deze tekst bewijst geen bestaande backupjob.

Plan een native snapshot met expliciete tag, schema en manifest van alle SSTablecomponenten per tabel. Upload na integriteitscontrole; ruim lokale snapshots pas op als de externe set compleet is. Een snapshot op dezelfde schijf beschermt niet tegen schijfverlies.

Herstel eerst naar een geïsoleerde passende Scylla-versie/topologie met een geteste importprocedure en juiste tabelidentiteit. Controleer geschiedenis, reacties, pins, read states en bijlagereferenties. Er is hier geen bewezen `messages-migrate`-CronJob of algemene replaytool die verloren berichten automatisch uit Redpanda terugzet.

### MinIO

Inventariseer buckets, aantallen, grootte, versiebeheer, lifecyclebeleid en toegang. Kopieer objecten en metadata en controleer een geschikte inhoudshash. Een multipart-ETag is niet altijd een eenvoudige checksum.

Herstel naar een aparte naamruimte. Controleer avatars, gewone bijlagen, spoilers, updatefeed/installers en afgeschermde toegang. Maak pas daarna de productieprocedure. Een bronmirror mag niet een ontbrekend/beschadigd bestand over alle herstelversies heen laten verwijderen.

### OpenBao

De backend is **PebbleDB met static seal**, geen Raft. `bao operator raft snapshot` is daarom niet de backupmethode. [OpenBao beschrijft](https://openbao.org/docs/configuration/storage/pebbledb/) PebbleDB als één-serveropslag zonder HA.

Ontwerp een consistente offline kopie: onderhoud plannen, voorkomen dat Flux een bewust gestopte instantie opnieuw start, schrijver stoppen, volledige datadir vanaf de juiste PVC kopiëren met benodigde metadata, oorspronkelijke toestand herstellen. Een tar van een actief veranderende database is geen bewezen consistente kopie.

Test een afgeschermde restore met passende versie en onafhankelijke seal-key-toegang. Controleer sealstatus, een onschadelijke testsecret en policies/auth zonder waarden te loggen. [Unseal](openbao-unseal.md) beschrijft de huidige keyflow. Neem niet aan dat GitHub alle geheimen reconstrueert. De toekomstige transit-seal heeft een afzonderlijke bereikbare provider nodig; die is nog niet als herstelroute opgeleverd.

### Kubernetes-etcd en applicatie-etcd

Maak een versiegeschikt control-plane-snapshot-/restoreplan inclusief certificaten, datastoreconfiguratie en PV-/nodekoppelingen. Applicatiebestanden moeten apart worden hersteld. Gebruik geen dqlite-herstelprocedure voor deze etcd-configuratie.

Voice-etcd bevat leased registraties. Na volledige inventarisatie kan het ontwerp die opnieuw laten registreren in plaats van oude leases te herstellen. Bewijs daarna nodebeschikbaarheid en een oproep. Verwar dit nooit met Kubernetes-etcd: die leegmaken verliest clusterstaat.

### Valkey

AOF helpt na een procesherstart maar is geen back-upbeleid. Resume, presence en rate limits kunnen worden herbouwd; verlies heeft gevolgen voor verbindingen en limieten. Tijdelijke E2EE-inboxen hebben een afzonderlijk privacy-/bezorgcontract: beloof geen herstel van niet-afgeleverde privéberichten en voeg ze niet ongemerkt toe aan lang bewaarde back-ups.

Inventariseer actuele sleuteltypen/TTL’s zonder waarden te exporteren. Bepaal welke beveiligingsstaat niet mag terugkeren en hoe sessies na een disaster restore ongeldig worden. De standaardherstelactie is niet ‘verwijder de PVC’.

### Redpanda en zoekindex

Stem events, offsets en retentie met databronnen af. API-outbox kan ongepubliceerde events opnieuw aanbieden; reeds verwijderde outboxrijen of een event tussen berichtopslag en publish zijn daarmee niet gegarandeerd herstelbaar. Geschiedenis opnieuw lezen helpt clients, maar herstelt niet elke push of elk neveneffect.

De zoekindex gebruikt PostgreSQL full-text search; zie het [ADR-overzicht](../adr/README.md) en ADR 0018. Leg een geteste Scylla-backfill met checkpointcorrectie vast. Houd notificatie-/e-mailconsumenten uit tijdens replay totdat duplicaat- en toestemmingsgevolgen zijn beoordeeld.

### ID-reserveringen na databaseherstel

De nieuwe Snowflake-allocator is nog ontwerp-/implementatiewerk. Zijn gereserveerde tijdintervallen zijn een duurzaam veiligheidsgegeven. Teruggaan naar een oudere reserveringstabel kan al uitgegeven ID’s opnieuw beschikbaar maken, ook wanneer berichten elders nieuwer zijn.

De voorgestelde herstelprocedure stopt alle ID-uitgevers, bewaart vooraf de hoogste ooit gereserveerde eindtijd buiten de te herstellen database en verhoogt na restore alle toewijzingsgrenzen tot minstens die waarde en de gecontroleerde actuele UTC-tijd plus de vereiste marge. Nieuwe uitgifte wacht tot de klok de grens passeert. Bij onbekende oudere high-watermark of teruggezette klok mag niet worden aangenomen dat opnieuw starten veilig is. Concrete floor-commando’s en marges volgen pas uit geteste allocatorcode. Dit plan activeert die code niet.

## 6. Geïsoleerde herstelproef

Maak de doelomgeving pas nadat dat apart is toegestaan. Geen productie-DNS, gedeelde publieke IP’s, e-mail, APNs/FCM, webhooks of live gebruikersverkeer. Gebruik testcredentials en geredigeerd bewijs.

1. Leg incidenttijd, gekozen herstelpunt, complete set, hashes, versies en gewenste verliesgrens vast.
2. Verkrijg sleutels via de onafhankelijke route; bewijs dat de verloren VM niet nodig is.
3. Bouw de geïsoleerde basis/controllers zonder openbare routing of appschrijvers.
4. Herstel OpenBao/configuratie, pas testcredentials aan en synchroniseer alleen naar gecontroleerde consumenten.
5. Herstel databases/objecten, stem tijdstippen af en controleer referenties en ID-watermarks.
6. Herbouw indexen en bepaal veilige broker-/consumerreplay. Voorkom externe meldingen.
7. Test login met testaccount, rechten, bewaard gesprek, bijlage, zoeken en nieuw bericht. Test ook weigering van een ongeautoriseerde actie.
8. Meet tijd, dataverlies, ontbrekende delen en handwerk. Een podstart is onvoldoende bewijs.
9. Laat de uitkomst beoordelen en stel doelen/scripts bij. Voorstel: maandelijks een deelrestore, elk kwartaal een volledige oefening.

Bij een echte ramp volgt publieke omschakeling pas na controles. Bewaar oorspronkelijke volumes en incidentinformatie zolang oorzaak/terugvalroute niet vaststaan. Oude en herstelde productie mogen niet gelijktijdig onder dezelfde identiteit schrijven.

## 7. Bewijsformulier

| Veld | Vastleggen zonder klantinhoud of geheimen |
|---|---|
| Set en doel | Backup-ID, bron, herstelpunt UTC, geïsoleerd doel, Git-commits |
| Integriteit | Manifesthash, telling, ontbrekende onderdelen |
| Toegang | Of onafhankelijke sleutels werkten; geen waarden |
| Duur | Start, data hersteld, app bruikbaar, controles afgerond |
| Verlies | Gemeten RPO per bron, inconsistenties, ID-watermarks |
| Functioneel | Login, autorisatie, berichten, bestanden, zoeken, eventuele spraakproef |
| Beperkingen | Fouten, credentials, versieverschillen, handwerk |
| Besluit | Reviewer, vervolgactie, datum volgende proef |

## 8. Invoering in fasen

1. **Nu: plan en inventaris.** Geen infrastructuur of planning activeren; [beheerkeuzes](../handbook/16-status-en-beheerkeuzes.md) bijhouden.
2. **Later: bestemming en sleutels.** Regio/leverancier/retentie, beperkte credentials, budget en onafhankelijke escrow kiezen.
3. **Later: één complete set en proef.** Aantonen dat data en sleutels bruikbaar zijn.
4. **Daarna: automatisering.** Jobs, timeouts, retries, manifest, beperkte resources, gecontroleerde retentieverwijdering en storingseigenaar.
5. **Daarna: monitoring.** Alarmeer op mislukking, te oude succesvolle set, ontbrekende WAL/onderdelen, capaciteit en credentials via een bewezen alarmkanaal.
6. **Pas met bewijs: beleid vaststellen.** Echte jobnamen, bron-/doelconfiguratie, gemeten RPO/RTO en geteste restorecommando’s toevoegen; daarna pas de implementatiekaart sluiten.
