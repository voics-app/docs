# Onafhankelijke controles van 18 november 2026

Summary: concrete testresultaten, gevonden fouten en resterende acceptatievoorwaarden voor de lopende Voics-afronding.

Dit verslag onderscheidt een gecontroleerde ontwikkelwijziging van een productie-
of app-store-release. De coördinator heeft onderstaande controles zelf uitgevoerd.
Er zijn geen tweede server, nieuwe VM, clusterjoin of back-upjobs gestart.
De [Kanban](https://github.com/orgs/voics-app/projects/1) bevat per kaart het
actuele bewijs; een merge naar develop sluit een brede featurekaart niet automatisch.

## Mobiele app en media

De afzonderlijke Android-app `nl.voics.app.qa` draait op de bestaande emulator en
een geïsoleerde lokale dienstenstack. Aanmelden en een via de UI verzonden bericht
zijn met een tweede account gecontroleerd. Dezelfde peer bevestigde dat Home
standaard Idle geeft, expliciet gekozen Online behouden blijft en terugkeer weer
Online toont. Dit is geen fysieke iPhone-achtergrondproef.

De native videoproef vond drie concrete problemen: niet-behouden native
RTP-parameters, niet-doorgegeven cameraoriëntatie en een WebRTC-abort wanneer de
laatste desktoppeer vertrok en met camera terugkwam. De laatste fout kwam door
anonieme ontvangers op lokale uplinksecties van het geconstrueerde SDP-antwoord.
Die secties zijn nu `recvonly`; echte peerstreams houden hun eigen track-identiteit.

[Client338](https://github.com/voics-app/client/pull/338) is na groene CI op
`36cd35e` gemerged als `fba4db0`. De coördinator herhaalde 69 gedeelde voice-/SDP-tests
en twee echte vertrek-/terugkeercycli met tweerichtingsvideo. Het Android-proces
bleef hetzelfde; de desktop decodeerde rechtopstaand beeld van 720×1280. In de
opgenomen reeks van 221 seconden waren er 17 heartbeats, met maximaal 14,055 seconde
tussen berichten en 162 ms bevestigingstijd. Dit is een beperkte lokale meting,
geen WAN-, duurtest- of prestatienorm.

De meting gebruikte productie-JavaScript in de QA-build. Ontwikkelprofilering gaf
eerder veel renderwerk en vertraagde heartbeats; die cijfers worden niet als
productieprestatie gepresenteerd. Er is geen algemeen geheugenlek aangetoond.

Xcode 26.6 bouwde de volledige iOS-simulatorapp en de daadwerkelijke
ReplayKit-uitbreiding. Maestro doorliep starten, aanmelden, registratie en herstel.
Een ondertekende build op een fysieke iPhone, zichtbare schermuitzending naar een
tweede apparaat, camera wisselen en versleutelde media blijven aparte controles.

## Berichten en bijlagen

[Messages79](https://github.com/voics-app/messages/pull/79) en
[client344](https://github.com/voics-app/client/pull/344) leveren wijzigingen
van beschrijvingen en spoilerflags na verzending. De Android-bediening is uitgevoerd
tegen de bijgewerkte berichtendienst. Een tweede account las beide gewijzigde
bijlagen terug; opnieuw openen toonde dezelfde waarden. Een nieuwe wijziging met
Cancel liet de eerder opgeslagen waarden intact.

De toestelproef vond daarnaast een verschoven meetrechthoek in de omgekeerde
berichtenlijst. Een kleine MOVE kon lang indrukken, een avatarknop of inline link
annuleren. [Client350](https://github.com/voics-app/client/pull/350) gebruikt de
upstream Fabric-correctie in keyboard-controller 1.23.1. De native QA-app is opnieuw
gebouwd en geïnstalleerd. Lang indrukken met MOVE, avatar/link, spoiler/mention,
verticaal scrollen en naar links vegen om te antwoorden zijn op de emulator
gecontroleerd. Het eerder onderzochte maatwerk voor lang indrukken is verwijderd;
de 21 tests van dat prototype gelden niet als bewijs voor de uiteindelijke code.

Herhaalde toetsenbord- en invoerhoogteveranderingen brachten nog een indelingsfout
aan het licht. De lijst en invoerbalk delen nu één normale indeling met één
toetsenbordcorrectie. De vastgelegde native reeks faalt op de eerdere combinatie
van zwevende invoerbalk en gesimuleerde lijstpadding, en slaagt op alle negen
waarnemingen na de reparatie. De coördinator heeft deze reeks herhaald nadat het
behoud van de leespositie is toegevoegd. Een inkomend bericht verschoof de gelezen
regel eerst 236 pixels en daarna nul; Jump to latest en het volgen van nieuwe
berichten aan de onderkant werken eveneens. De 60 betrokken componenttests,
typecontrole en lint slagen. De volledige suite met de dependency-update slaagde
eerder met 1044 tests en vier configuratiecontroles, vóór de laatste layoutwijziging.
Deze aantallen mogen niet worden verwisseld met native toestelproeven.

De [herhaalbare chatproef](https://github.com/voics-app/client/blob/feature/message-long-press-gesture-20261118/docs/native-chat-input.md)
staat bij de clientcode. De [iOS-native controle op deze wijziging](https://github.com/voics-app/client/actions/runs/44255079798)
is geslaagd: de volledige app, ReplayKit-uitbreiding en simulatorproeven voor
aanmelden en herstel slagen. De overige client-CI loopt nog; fysieke iPhone-
toetsenbordgebaren, rotatie, VoiceOver en een ondertekende release blijven open.

## Accounts, templates en Community

| Controle | Uitgevoerd bewijs | Nog open |
|---|---|---|
| Refreshherstel en pushlifecycle | Echte Electron-herstart met DPAPI; gecombineerde API143/145: 47 Postgres-tests, inclusief herhaalde requests, gelijktijdig afmelden en cleanup | Push145-CI/release; echte APNs-/FCM-bezorging |
| Passkeys | Chromium CTAP2 plus Postgres voor registratie, login, replayweigering, herstel, hernoemen en verwijderen; 14 desktoptests | Fysieke authenticators, mobiele bridge en productie-RP |
| Templates | Alle vijf ingebouwde sjablonen en gedeelde lifecycle in drie Postgres-tests; website: drie unit- en zes Chromium-controles | Gekoppelde desktop/API-proef en release |
| Community/listingmeldingen | 16 Postgres-tests; 11 desktop- en 16 coretests; twee echte Chromium-rendererscenario's op verschillende formaten, screenshots bekeken | Renderer gebruikt een REST/WS-fixture; volledige gekoppelde API/admin-proef en release |
| Globale en serverprofielen | Negen echte Postgres-tests met gelijktijdige profiel-/moderatiesaves; na clientintegratie 34 core- en 11 desktoptests, typecontrole/lint/build. Coördinator controleerde conceptbehoud, mislukte save/retry, serverprofiel en smalste ondersteunde desktopformaat | Browser gebruikt productiecomponenten met een geïsoleerde REST-fixture; gekoppelde API/client-proef en release |

## Ongelezen tellers

[Messages82](https://github.com/voics-app/messages/pull/82) is gemerged als
`bfb8e03` na groene CI op `7b38654`. De coördinator herhaalde vier echte HTTP-
recipienttests en vijf echte Scylla-tests. Bij 1024 unieke berichten en 2048
aanroepen via vier onafhankelijke repositories waren er 1465 CAS-conflicten,
nul uitgeputte retries en een schrijftijd van 14,886 seconden. De halve ACK duurde
10 ms; actieve rijen namen af van 2049 naar 1025, 513 en 1. Dit is een lokale
contentieproef, geen productiecapaciteitsnorm.

De opgeslagen teller verwerkt herhaalde levering en een gelijktijdige ACK, maar
opslag, accounting en gebeurtenispublicatie zijn nog geen enkele transactie.
Een duurzame accounting-outbox ontbreekt. Ook bleek de gateway READY geen
read-state-snapshot op te halen. Versienummers en gerichte snapshots bij opnieuw
verbinden zijn daarom een afzonderlijk vervolg in contracts48/docs177 en
messages83 plus gateway/client. Deze kaart blijft open. Voor uitrol gelden
de writer-drain en gekoppelde keyspace-back-ups uit het
[accounting-runbook](../runbooks/read-accounting.md).

## Platform en vervolg

De bestaande serveruitbreidingsgids en het back-upplan blijven voorbereiding.
Meerdere replicas vereisen gedeelde toestand, bereikbare media-endpoints en unieke
ID-uitgifte; een tweede VM alleen maakt het geheel niet hoogbeschikbaar. De nieuwe
API/messages-allocator mag pas na het vastleggen van de ID-grens en het stoppen
van oude schrijvers worden uitgerold.

De coördinator herhaalde vijftien probertests, waaronder echte etcd- en twee-SFU-
ICE/DTLS/RTP-proeven. Beide nodes gaven nul procent verlies en ongeveer 16 ms RTT;
de tweede mislukte observatie volgde 9,989 seconden na de eerste. De andere node
bleef gezond, herstel vergde twee goede probes en afsluiten ruimde de leases op.
Gateway61 is gemerged na 49 onafhankelijke tests, inclusief vijf echte etcd-proeven.
De gecombineerde voice36-aanmelding/heartbeatcode slaagde met 101 tests en drie
expliciet overgeslagen controles. Compiler-, format- en strikte Credo-controles
slagen. Voice36/37 wachten nog op hun geïntegreerde CI; de productie-observer en
enforcement zijn niet aangezet. Een willekeurige netwerkstoring kan extra wachten
op de volgende probe, timeout en gatewaypoll vereisen.

De nieuwe documentatie bereikt Notion via de bestaande docsrelease naar main.
Daarna worden de inhoudshashes en pagina-inhoud opnieuw gelezen volgens
[de publicatiecontrole](../runbooks/notion-publicatie-controleren.md). Een eerdere
groene mirror-run geldt niet als bewijs voor deze nieuwe inhoud.
