# Stand van zaken en open beheerkeuzes

Summary: welke gebruikersfuncties en beheeronderdelen aantoonbaar bestaan, welke alleen zijn voorbereid en welke keuzes nog van de eigenaar afhangen.

Momentopname: **18 november 2026**. Dit is geen lijst met automatisch afgeronde kaarten. De [GitHub-projectkaart](https://github.com/orgs/discordy-voics/projects/1) en [het opleverprogramma](../plans/2026-11-18-completion-programme.md) blijven leidend voor latere wijzigingen. Een lokale test, groene PR, merge naar develop, uitgebrachte versie en praktijkproef zijn verschillende bewijzen.

## Gebruikersfuncties

| Onderdeel | Bewijs op deze datum | Nog nodig / beperking |
|---|---|---|
| Windows-app | Publieke basis 0.9.10 | Nieuwe functies vereisen volgende installer en soms backendrelease |
| iPhone | App Store 1.0.0 READY_FOR_SALE; TestFlight 6/7 IN_BETA_TESTING, geldig tot 4 februari 2027 | Nieuwe ReplayKit-code zit niet automatisch in oude builds |
| Externe testers | [Openbare TestFlight-link](https://testflight.apple.com/join/2zQRFhHH), maximaal 100; client#311 door coördinator geverifieerd | Tester moet uitnodiging accepteren en daadwerkelijk installeren |
| Android | Publieke APK 1.0.0/7; geïsoleerde lokale QA-app geïnstalleerd, login en UI-bericht onafhankelijk via tweede peer bevestigd | Geen volledige echte productiepush-/bel-/telefoontest |
| Mobiele achtergrondstatus | Client PR 339, gateway PR 59 en contracts PR 35 naar develop; gerichte onafhankelijke tests | Uitrol van client én gateway; foreground/backgroundpraktijkproef. Force quit en crash hebben platform-/TTL-beperkingen |
| iOS video/schermdelen | ReplayKit-code in PR 338, native unsigned simulatorbuild en 67 gerichte tests geverifieerd. Nieuwste head `eba1e46` voegt een echte simulator-start-/formulierproef met screenshots toe; die nieuwe CI-proef is nog niet afgetekend | Fysieke iPhone naar tweede apparaat, start/stop/rejoin en camera/schermwissel; release van juiste native build |
| Rapporteren en leden opruimen | Bestaande API-endpoints met echte HTTP-tests; report 7 en prune 4 controles | Afzonderlijke desktop-/mobiele-/adminacceptatie; geen algemene klaarclaim |
| Sessiebeveiliging | API PR 137 atomiseert intrekking, push-tokencleanup en outbox; PR 138 JWT-auditupdate gemerged | Historische eenmalige api#121-assertie is niet verklaard door alleen deze regressiefixes |
| Passkeys | Contract/design gemerged, runtime in vervolgwerk | Geen beschikbare passkeylogin claimen vóór runtime, clientintegratie en acceptatie |
| Permanente uitnodiging / auditbeleid | Contracts PR 37 gemerged; coördinator herhaalde tien echte Postgres-tests op API PR 139, plus lokale clienttests | API/clientreview, compatibele releases en onafhankelijke gebruikersproef; [contract](../protocols/community-settings.md) |
| TTS / alttekst / spoilers | Messages-increment met regressie- en Scylla-tests | Paired clientbediening, reviews en releases; [contract](../protocols/message-metadata.md) |
| Desktopnavigatie / safety | Eerste werkende verbeteringen in PR 342 met core-/desktoptests | Visuele en gebruikersacceptatie; ontbrekende API-features blijven afzonderlijk open |
| Overige pariteitsfeatures | Alle toegewezen kaarten opgenomen in het programma | Geen blanket-Done: onder meer volledige privacyfilters, gekoppelde accounts, export, polls en geplande berichten hebben verdere implementatie nodig |

De [mobiele handleiding](14-handleiding-mobiele-app.md) en [desktophandleiding](15-handleiding-desktop.md) gebruiken echte menunamen en markeren de nieuwe builds afzonderlijk.

## Platform en beheer

| Onderdeel | Stand |
|---|---|
| Productie | Eén gen-serv op `.212`, 8 vCPU, 12 GB RAM, Ubuntu 24.04.5, MicroK8s 1.35.6 met etcd; bevat gebruikersdata |
| Tweede server | Workerworkflow met vijftien onafhankelijke offline tests en vijf Terraform-roots; geen VM gemaakt/join uitgevoerd |
| Verkeersverdeling | Twee-replica-ingress-/tunnelprofiel voorbereid maar niet geactiveerd; stateful diensten niet automatisch schaalbaar |
| App-identiteit bij opschalen | API/messages gebruiken nog vaste Snowflake-ID’s; allocator in werk. Gateway gebruikt UUID’s. SFU heeft unieke registraties én endpoints nodig |
| Gateway | Twee-BEAM-tests voor fan-out/readiness geslaagd; geen transactionele garantie bij een partitie midden tijdens verdeling |
| Voice-registratie | PR 33 naar develop gemerged (`da80415`): atomische claim en lease-eigendom. Externe endpoint-/mediaproef blijft apart |
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
| Externe featureproviders | GIF-/accountproviders, bijbehorende voorwaarden en credentials zijn afzonderlijke afhankelijkheden wanneer de feature die nodig heeft |
| Alarmkanaal | Historische ops-alerts-actie opnieuw op werkelijke bereikbaarheid controleren; een portalbanner is geen bezorgde externe alarmmelding |

De vroegere algemene vraag ‘Notion-token nog leveren’ is achterhaald: de bestaande mirror heeft al gewerkt. Deze documentatie wordt via de bestaande `main`-workflow bijgewerkt. Succes van eerdere synchronisaties bewijst niet dat deze nieuwe pagina’s al zijn gepubliceerd.

## Naamwijziging en Notion

Publieke kopij en actuele handleidingen gebruiken Voics. GitHub-organisatie, package-/crate-identiteiten, compatibiliteitsaliases en gegevensnamen zijn nog legacy. Ze worden niet blind hernoemd: database-, bucket-, secret- en installerwijzigingen vragen een geteste migratie en herstelroute. Daarom zijn docs#69 en docs#135 nog geen volledig voltooide kaarten. Zie [rebrand](../runbooks/rebrand.md).

Git blijft de bron. De bestaande Notion-mirror gebruikt stabiele bronpaden en contenthashes; nieuwe bestanden in handbook, runbooks en protocols worden zonder een nieuwe database-indeling meegenomen. De coördinator controleert na de release de workflow en de daadwerkelijke pagina’s. [Publicatiecontrole](../runbooks/notion-publicatie-controleren.md) legt het bewijs vast dat daarvoor nodig is.
