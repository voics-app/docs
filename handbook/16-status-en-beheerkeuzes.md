# Stand van zaken en open beheerkeuzes

Summary: welke gebruikersfuncties en beheeronderdelen aantoonbaar bestaan, welke alleen zijn voorbereid en welke keuzes nog van de eigenaar afhangen.

Momentopname: **18 november 2026**. Dit is geen lijst met automatisch afgeronde kaarten. De [GitHub-projectkaart](https://github.com/orgs/voics-app/projects/1) en [het opleverprogramma](../plans/2026-11-18-completion-programme.md) blijven leidend voor latere wijzigingen. Een lokale test, groene PR, merge naar develop, uitgebrachte versie en praktijkproef zijn verschillende bewijzen.

De uitgebreidere onafhankelijke controles staan in het [testverslag van 18 november](../plans/2026-11-18-acceptance-evidence.md). De nieuwe features hieronder zijn nog geen productie- of store-release.

## Gebruikersfuncties

| Onderdeel | Bewijs op deze datum | Nog nodig / beperking |
|---|---|---|
| Windows-app | Publieke basis 0.9.10 | Nieuwe functies vereisen volgende installer en soms backendrelease |
| iPhone | App Store 1.0.0 READY_FOR_SALE; TestFlight 6/7 IN_BETA_TESTING, geldig tot 4 februari 2027 | Nieuwe ReplayKit-code zit niet automatisch in oude builds |
| Externe testers | [Openbare TestFlight-link](https://testflight.apple.com/join/2zQRFhHH), maximaal 100; client#311 door coördinator geverifieerd | Tester moet uitnodiging accepteren en daadwerkelijk installeren |
| Android | QA-app geïnstalleerd; aanmelden, berichten, bijlagewijzigingen en tweerichtingsvideo geverifieerd. Client350 corrigeert native aanrakingen, toetsenbordindeling en leespositie; herhaalde native reeks en 60 gerichte componenttests slagen | PR/build/release; geen volledige productiepush- of fysieke-telefoontest |
| Mobiele achtergrondstatus | Client339/gateway59/contracts35 gemerged; Android Home geeft standaard Idle, expliciet Online blijft Online en terugkeer herstelt de verbinding; tweede account controleerde de status | Uitrol van client én gateway; fysieke iPhone-proef. Force quit en crash hebben platform-/TTL-beperkingen |
| iOS video/schermdelen | Client338 gemerged als `fba4db0`, head `36cd35e` groen. Native iOS-app plus ReplayKit-uitbreiding gebouwd, simulator-start/formulieren geslaagd. Android-video inclusief oriëntatie en twee desktop-rejoins onafhankelijk gecontroleerd | Fysieke iPhone naar tweede apparaat, start/stop/rejoin en camera/schermwissel; release van juiste native build |
| Rapporteren en leden opruimen | Bestaande API-endpoints met echte HTTP-tests; report 7 en prune 4 controles | Afzonderlijke desktop-/mobiele-/adminacceptatie; geen algemene klaarclaim |
| Sessiebeveiliging | API143 en client345 gemerged: verloren refreshantwoord herstelbaar met duurzaam verzoek-ID. Echte Electron-herstart/DPAPI-proef geslaagd. Push145 gecombineerd met herstel: 47 onafhankelijke Postgres-tests geslaagd | Push145-CI en compatibele releases; historische api#121-flake blijft apart |
| Passkeys | API140/142, client346 en website20 gemerged. Coördinator controleerde registratie/login/herstel/verwijderen met Chromium CTAP2 en echte Postgres | Fysieke Windows Hello/Touch ID/beveiligingssleutel, mobiele bridge, productie-HTTPS/RP en release |
| Permanente uitnodiging / auditbeleid | Contracts PR 37 gemerged; coördinator herhaalde tien echte Postgres-tests op API PR 139, plus lokale clienttests | API/clientreview, compatibele releases en onafhankelijke gebruikersproef; [contract](../protocols/community-settings.md) |
| TTS / alttekst / spoilers | Messages79 en client344 gemerged. Android-beschrijvingen en spoilerflags opgeslagen, via tweede account gelezen; Cancel bewaart eerdere waarden | Releases; TTS apart van de bijlageproef; [contract](../protocols/message-metadata.md) |
| Templates | API144, contracts43, website21 en docs172 gemerged. Drie echte Postgres-tests en websiteproeven onafhankelijk geslaagd | Client347 en gekoppelde gebruikersproef/release |
| Community en listingmeldingen | API147: 16 onafhankelijke Postgres-tests. Client348: 27 unit-/interactietests en twee Chromium-scenario's. Admin34 en docs173 gemerged | Clientbrowser gebruikt geïsoleerde REST/WS-fixture; geïntegreerde API/adminproef en release blijven open |
| Profielen | API148/client349: negen onafhankelijke Postgres-tests; na clientintegratie 45 gerichte tests, typecontrole/lint/build en browserbediening gecontroleerd. Docs175 gemerged; contracts47 opnieuw gegenereerd en getest | Geïntegreerde CI, gekoppelde echte UI/API-acceptatie en release |
| Ongelezen tellers | Messages82 en docs176 gemerged; coördinator herhaalde negen HTTP-/Scylla-tests en een 1024-berichtencontentieproef zonder uitgeputte retries | Versies/snapshots bij READY en hervatten worden apart gebouwd; duurzame accounting-outbox, gecoördineerde uitrol en herstelproef blijven open |
| Desktopnavigatie / safety | Eerste werkende verbeteringen in PR 342 met core-/desktoptests | Visuele en gebruikersacceptatie; ontbrekende API-features blijven afzonderlijk open |
| Overige pariteitsfeatures | Alle toegewezen kaarten opgenomen in het programma | Geen blanket-Done: onder meer volledige privacyfilters, gekoppelde accounts, export, polls en geplande berichten hebben verdere implementatie nodig |

De [mobiele handleiding](14-handleiding-mobiele-app.md) en [desktophandleiding](15-handleiding-desktop.md) gebruiken echte menunamen en markeren de nieuwe builds afzonderlijk.

## Platform en beheer

| Onderdeel | Stand |
|---|---|
| Productie | Eén gen-serv op `.212`, 8 vCPU, 12 GB RAM, Ubuntu 24.04.5, MicroK8s 1.35.6 met etcd; bevat gebruikersdata |
| Tweede server | Workerworkflow met vijftien onafhankelijke offline tests en vijf Terraform-roots; geen VM gemaakt/join uitgevoerd |
| Verkeersverdeling | Twee-replica-ingress-/tunnelprofiel voorbereid maar niet geactiveerd; stateful diensten niet automatisch schaalbaar |
| App-identiteit bij opschalen | Allocatorcode in API141/messages80 gemerged; productie draait nog op de oude werkwijze. Een gecoördineerde ID-grens en uitschakeling van oude schrijvers zijn vereist vóór uitrol. Gateway gebruikt UUID’s; SFU vereist unieke registraties én endpoints |
| Gateway | Twee-BEAM-tests voor fan-out/readiness geslaagd; geen transactionele garantie bij een partitie midden tijdens verdeling |
| Voice-registratie | PR 33 naar develop gemerged (`da80415`): atomische claim en lease-eigendom. Externe endpoint-/mediaproef blijft apart |
| Actieve voicecontrole | Contract45 en gateway61 gemerged; coördinator controleerde 15 prober-, 49 gateway- en 101 signalingtests, met echte lokale ICE/DTLS/RTP-uitval en herstel. Geïntegreerde voice36/37-CI loopt; observer en `probe_required` blijven uit |
| Notifier | Coördinator zag 1/1 Ready op v0.15.0 en gezonde APNs/FCM-ExternalSecrets; gitops#69 afgesloten |
| Echte push | Configuratiegereedheid is geen bewijs van zichtbare melding op een echt APNs-/FCM-toestel |
| Image reflector | OOM-probleem onder 256 MiB hersteld met 1 GiB-limiet; gitops 0.25.1; lange periode zonder herstart geobserveerd. Geen geheugenlek aangetoond |
| GitHub-credentials | Zeven imagescans en ARC hebben invalid-GHCR-/PAT-401-afhankelijkheden; aangewezen vervanging nog nodig. Geen brede gh-OAuthcredential hergebruiken |
| Router | UDP 50000, UDP/TCP 3478, UDP 49160–49170 naar `.212` gevraagd; echte externe call/relayproef niet afgetekend |
| Back-ups | Alleen [geschreven plan](../runbooks/backup-restore.md); geen bewezen offsite-set, jobs of hersteldoel gehaald |
| OpenBao | PebbleDB met static seal; transit-seal vereist afzonderlijke provider, nog niet afgerond |
| RKE2 / HA / aparte dev | Voorstellen/voorbereiding; geen migratie, nieuwe besturing of dev-VM uitgevoerd |

## Besluiten die al zijn genomen

- De productnaam is Voics. Website en de goedgekeurde publieke/opsnamen zijn al overgezet; [hostnamen](../runbooks/hostnames.md) onderscheidt huidige namen en compatibiliteitsaliases.
- Alleen de goedgekeurde oude hostnamen zijn overgenomen. `.204` en de overige diensten/records van het eerdere product blijven buiten dit werk.
- TestFlight en App Store Connect zijn ingericht; de oude vraag om eerst de app aan te maken is achterhaald. De publieke App Store-versie is live.
- APNs- en FCM-configuratie en de notifierdeployment bestaan. Een oorspronkelijke vraag om de sleutel nog voor het eerst te leveren is niet meer hetzelfde als de resterende toestelproef.
- De nieuwe serveropdracht is **prepare-only**. Back-ups zijn **plan-only**. Er is geen toestemming afgeleid voor provisioning, migratie, een nieuwe transit-provider of het activeren van backupschema’s.
- De V-markering blijft de huidige visuele basis. De mobiele app-identiteit is `nl.voics.app`.

## Open keuzes en externe voorwaarden (docs#10)

| Keuze / actie | Wat nodig is voordat dit klaar is |
|---|---|
| Extra servers / echte HA | Moment van uitvoeren, fysieke failure domains, netwerk/adressen en besturings-/opslagontwerp. Twee workers zijn geen HA-migratie |
| Offsite-back-up | Bestemming/regio, budget, bewaartermijnen, gewenste RPO/RTO, onafhankelijke sleutelbewaring en afspraak over herstelproeven |
| GitHub registry/ARC | Eigenaar levert toepasselijke beperkte credentials via de bestaande intake-/secretflow; daarna sync en read-only verificatie |
| Router | Configuratie en test vanaf buiten het LAN, inclusief TURN |
| Fysieke iPhone/Android | Gesprek, camera, schermdelen, push, vergrendelde app, wifi en mobiel netwerk met twee deelnemers |
| Juridische naam / teksten | Naam van verantwoordelijke en overige beleidskeuzes expliciet vaststellen; de brede featureopdracht kiest geen juridische identiteit |
| Frankrijk / encryptie | Frankrijk en China blijven uitgesloten; `ITSAppUsesNonExemptEncryption` blijft false. ANSSI-/BIS-vraagstukken zijn afzonderlijk te beoordelen, geen impliciete goedkeuring |
| E-mailcredential | Eerdere Brevo-keyrotatie blijft te verifiëren via [het e-mailrunbook](../runbooks/email-brevo.md); geen waarden publiceren |
| Externe featureproviders | accountproviders (een GIF-picker wordt niet aangeboden, zie runbooks/gif-provider.md), bijbehorende voorwaarden en credentials zijn afzonderlijke afhankelijkheden wanneer de feature die nodig heeft |
| Alarmkanaal | Historische ops-alerts-actie opnieuw op werkelijke bereikbaarheid controleren; een portalbanner is geen bezorgde externe alarmmelding |

De vroegere algemene vraag ‘Notion-token nog leveren’ is achterhaald: de bestaande mirror heeft al gewerkt. Deze documentatie wordt via de bestaande `main`-workflow bijgewerkt. Succes van eerdere synchronisaties bewijst niet dat deze nieuwe pagina’s al zijn gepubliceerd.

## Naamwijziging en Notion

Publieke kopij en actuele handleidingen gebruiken Voics. GitHub-organisatie, package-/crate-identiteiten, compatibiliteitsaliases en gegevensnamen zijn nog legacy. Ze worden niet blind hernoemd: database-, bucket-, secret- en installerwijzigingen vragen een geteste migratie en herstelroute. Daarom zijn docs#69 en docs#135 nog geen volledig voltooide kaarten. Zie [rebrand](../runbooks/rebrand.md).

Git blijft de bron. De bestaande Notion-mirror gebruikt stabiele bronpaden en contenthashes; nieuwe bestanden in handbook, runbooks en protocols worden zonder een nieuwe database-indeling meegenomen. De coördinator controleert na de release de workflow en de daadwerkelijke pagina’s. [Publicatiecontrole](../runbooks/notion-publicatie-controleren.md) legt het bewijs vast dat daarvoor nodig is.
