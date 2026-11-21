# Verificatie van meldingsinstellingen en leestellers

Op 18 november 2026 heeft de hoofdagent de wijzigingen voor
[messages #23](https://github.com/voics-app/messages/issues/23) onafhankelijk
gecontroleerd in de bestaande lokale testomgeving. De kaart kan naar **In review**
voor de eigenaar. Deze controle is geen productie-uitrol of bewijs van bezorging
door Apple of Google.

## Gecontroleerde versies

| Onderdeel | Gecontroleerde bron |
|---|---|
| Messages | `81e6e37d99f71608846bde0bb5e5055b593d8b40`, inclusief samengevoegde PR 83 |
| Gateway | `dec5e433a21e8f5951385bb348912874c7a0404f`, samengevoegd via PR 62 |
| API | Lokale binary uit `042d528c2553e94eae4fc3e9fae2c5d1ec910b86`, met de gedeelde actuele notificatieregels |
| Desktop | Integratiebranch `374514820f658c348457aadce02ecdce1a12d9f1`, inclusief PR 351, 352 en 355 |
| Android JavaScript | `0fa362f57a705b52cfcd497ba1d2fc685b797e2b`, op de bestaande native QA-app |

De berichtenservice en gateway draaiden als echte Linuxcontainers, met PostgreSQL,
Scylla en Redpanda. De Windowsclient was de echte Electron-app; Android draaide op
de bestaande emulator. Testaccounts en wijzigingen bleven in deze testomgeving.

## Leestellers: 18 geslaagde controles

Twee onafhankelijke gatewaysessies kregen een gecertificeerde `READY`. De controle
vergeleek de opgeslagen Scylla-teller en versie met de privégebeurtenissen die beide
sessies ontvingen.

- Een directe vermelding verhoogt de teller één keer.
- **Niets** onderdrukt nieuwe vermeldingen; een expliciete kanaalinstelling kan
  het serverniveau overschrijven.
- Server- en kanaaldemping onderdrukken vermeldingen; verlopen demping doet dat niet.
- Rol- en `@everyone`-vermeldingen volgen hun onderdrukkingsinstellingen. Een expliciete
  directe vermelding blijft tellen wanneer groepsvermeldingen zijn onderdrukt.
- Een stil bericht verhoogt de vermeldingsteller niet. Een gewoon serverbericht
  onder **Alle berichten** veroorzaakt evenmin een vermeldingsteller.
- Een antwoord met uitgeschakelde antwoordping telt niet; een aparte expliciete
  vermelding in hetzelfde antwoord blijft geldig.
- Een leesbevestiging wist de opgeslagen teller en bereikt beide sessies.
- Na verbreken en hervatten herstelt `READ_STATE_SYNC` een gemist bericht met de
  actuele opgeslagen teller en versie.

Daarnaast is de combinatie van de echte apps gecontroleerd. Android en desktop
toonden beide één vermelding. De bestaande Android-functie
`MessageService.markRead` is via de native debugger aangeroepen met de werkelijke
runtime en API. Android ontving daarna een opgeslagen teller van nul met versie
10, opvolgend op versie 9; de zichtbare Electron-serverbadge verdween ook.
Dit bewijst de app- en serversynchronisatie; het was geen nagebootste schermtik.

## Pushregels: 14 geslaagde scenario's

Een extra test registreerde een tijdelijk testtoken en verstuurde echte berichten.
De echte notifier-consumer las de gebeurtenissen uit Redpanda, haalde de actuele
voorkeuren op bij de API en gebruikte de normale APNs HTTP-sender. Alleen het
uiteindelijke Apple-eindpunt was vervangen door een lokale ontvanger die de
uitgaande verzoeken telde.

| Instelling en bericht | Uitgaande pushes |
|---|---|
| Alle berichten, gewoon bericht | 1 |
| Alleen vermeldingen, gewoon bericht | 0 |
| Alleen vermeldingen, directe vermelding | 1 |
| Niets, directe vermelding | 0 |
| Kanaal vermeldingen overschrijft server Niets | 1 |
| Server gedempt, directe vermelding | 0 |
| Kanaal gedempt, directe vermelding | 0 |
| Verlopen demping, directe vermelding | 1 |
| `@everyone` toegestaan | 1 |
| `@everyone` onderdrukt | 0 |
| Vermelding van een eigen rol | 1 |
| Rolvermeldingen onderdrukt | 0 |
| Directe vermelding naast onderdrukte groepsvermeldingen | 1 |
| Stil bericht met directe vermelding | 0 |

De oorspronkelijke voorkeuren zijn hersteld en het tijdelijke push-token is verwijderd.
Deze functionele matrix gebruikte één seconde tussen berichten. Een eerdere snelle
proef werd door de bestaande Snowflake-bescherming afgewezen met `clock moved
backwards` en HTTP 503 in de lokale Dockeromgeving. Die mislukte proef is apart
bewaard; deze resultaten zijn geen belastingtest of bewijs van klokstabiliteit.

## Bewijs en resterende controles

De lokale bewijsbestanden staan in de `qa`-map van de taakwerkruimte:

- `root-read-state-coupled-verification.json`: de 18 controles en herstel van instellingen.
- `native-read-state-ack.json`: Android-versies en zichtbare desktopbadge vóór/na lezen.
- `root-notification-push-coupled-verification.json`: de 14 pushscenario's.
- `root-notification-push-coupled.log`: volledige geslaagde proef met echte consumer.
- `root-notification-push-clock-rollback.log`: de eerdere afgebroken klokproef.

De testscripts bevatten geen ingebakken accountwachtwoorden of clustertokens.
Ze lezen alleen de bestaande lokale QA-inloggegevens; het push-token voor de proef
wordt weer opgeruimd.

De eigenaar kan nu de instellingen en het gedrag beoordelen. Werkelijke APNs- en
FCM-bezorging, vergrendelschermgedrag en openen vanuit een push blijven onderdeel
van de [telefoonsmoketest](push-notifications.md#smoke-test). De Windows-tray,
geluiden en meldingklik behoren daarnaast bij client #84/#113. Een iOS-toesteltest
en een productie- of store-release zijn niet door deze lokale controle vervangen.
