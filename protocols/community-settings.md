# Serverinstellingen: permanente uitnodigingen en auditbeleid

Gecontroleerd op 18 november 2026. [Contracts PR 37](https://github.com/voics-app/contracts/pull/37) is naar develop gemerged (`9a0c487`). De runtime en bediening staan in [API PR 139](https://github.com/voics-app/api/pull/139) en [client PR 341](https://github.com/voics-app/client/pull/341). De coördinator herhaalde tien echte Postgres-tests voor vanity, audit, templates en discovery op API-head `bcc4386`; lokale contract-/clienttests zijn eveneens uitgevoerd. API/client-merge, release en onafhankelijke UI-/productieverificatie blijven afzonderlijke stappen; deze tekst verklaart de functies niet live.

## Permanente uitnodigingscode (api#96)

| Operatie | Contract |
|---|---|
| `GET /guilds/{id}/vanity-url` | Met `MANAGE_GUILD`; geeft `{code: null, uses: 0}` wanneer niet ingesteld, anders huidige code en geslaagde joins |
| `PATCH /guilds/{id}/vanity-url` | Met `MANAGE_GUILD`; body `{code: string \| null}`; null verwijdert de code |
| Bestaande invite-preview/-accept | Herkent de permanente code naast gewone uitnodigingen |

Codes zijn 2–32 ASCII-letters, cijfers of koppeltekens, worden lowercase bewaard en delen één hoofdletterongevoelige naamruimte met normale uitnodigingscodes. Een code mag geen andere server of gewone uitnodiging overschaduwen. Hernoemen reset het gebruiksaantal.

De bestemming is het eerste tekstkanaal dat voor `@everyone` zichtbaar is, op positie en daarna ID. Resolutie berekent dat opnieuw. Zonder zo’n kanaal is de uitnodiging niet beschikbaar; instellen vereist er ook één. Gewone bans, lidmaatschapslimieten en join-events blijven gelden. Een bestaand lid opnieuw laten accepteren verhoogt `uses` niet.

Migratie `0050` maakt `guild_vanity_urls` met één code per server en een index over genormaliseerde normale codes. Beide aanmaakroutes serialiseren claims per code in de transactie. Lidmaatschap, gebruiksteller en outbox committen samen. Wijzigen/verwijderen schrijft een `GUILD_UPDATE`-auditrecord met de oude/nieuwe `vanity_url_code` volgens het auditbeleid.

De desktopbediening staat onder **Server settings → Overview**. Beheerders kunnen instellen, kopiëren en verwijderen; de UI bewaart fouten van de server zichtbaar. Er is geen nieuwe secret of externe provider nodig. Dat verandert niets aan de normale API-migratie-/releaseprocedure.

Tests dekken rechten, validatie, normalisatie, gelijktijdige claims, botsingen, preview/accept, bestaande leden, bans, verwijderen/hernoemen, verborgen kanalen en audit. De hele gebruikersstroom op uitgebrachte componenten blijft een aparte acceptatie.

## Auditbeleid (api#85)

Guild-responses en `GUILD_UPDATE` krijgen optionele, achterwaarts compatibele velden:

| Veld | Waarden en standaard |
|---|---|
| `audit_log_enabled` | Boolean; standaard true |
| `audit_log_retention_days` | 30, 90 of 365; standaard 90 |

Alleen eigenaar en administrator kunnen deze velden via `PATCH /guilds/{id}` wijzigen. `MANAGE_GUILD` alleen is onvoldoende. `VIEW_AUDIT_LOG` blijft het leesrecht voor alle bewaarde entries. De rolleneditor biedt dit recht; een rol met alleen audit-leesrecht kan de auditpagina bereiken, maar de beleidsbediening niet wijzigen.

De Postgres-unit-of-work controleert het opgeslagen beleid in dezelfde transactie als een auditwrite. Wanneer logging uit staat, worden zowel de rij als `AUDIT_LOG_ENTRY_CREATE` onderdrukt. **Wijzigingen aan het auditbeleid zelf worden altijd geregistreerd.** Een specifieke mutatie schrijft beleidskolommen zodat gewone serverupdates ze niet terugzetten. Gelijktijdige wijzigingen serialiseren op de guildrij.

Migratie `0051` voegt velden en retentie-index toe. Leesqueries verbergen verlopen rijen onmiddellijk. Een idempotente worker verwijdert bij starten en elk uur verlopen auditrijen en hun betreffende eventkopieën uit de transactionele outbox. Andere outboxevents blijven staan. De worker is ontworpen voor meer dan één API-replica, maar maakt overige API-onderdelen niet automatisch schaalveilig.

**Gevolg bij uitrol:** bestaande auditrijen ouder dan de standaard 90 dagen kunnen voor verwijdering in aanmerking komen. Een kortere termijn maakt oudere rijen onmiddellijk onzichtbaar en daarna fysiek verwijderbaar. Review deze dataverandering vóór een productie-uitrol. Dit beleid wijzigt geen externe back-ups of reeds afgeleverde brokerrecords.

De desktoppagina **Server settings → Audit log** legt uit dat uitschakelen eerder bewaarde entries niet direct wist, beleidswijzigingen blijven bestaan en inkorten oudere gegevens verwijdert. Bewaren vernieuwt de lijst; bij fouten blijft de gekozen waarde beschikbaar om te herstellen. Categoriebeperkingen en een handmatige purgeknop zijn niet onderdeel van deze oplevering.

Tests dekken defaults, uit-/aanzetten, read-only rollen, administratorrechten, foutwaarden, transacties, ontbreken van nieuwe auditrijen/dispatches wanneer uitgeschakeld, directe expiratie, fysieke cleanup, idempotentie en behoud van andere outboxevents. De clienttests dekken opslaan, foutafhandeling en opnieuw laden.

## Overige communityfuncties

Templates, eenvoudige forums/threads en discovery bestaan gedeeltelijk; de huidige implementaties zijn niet hetzelfde als volledige communitypariteit. Onboarding/rules screening, volledige threadlidmaatschappen, geavanceerde forumtags, AutoMod, announcement-follow/crosspost, geplande events, ban appeals en overige profiel-/widgetfuncties hebben afzonderlijke open kaarten in het [opleverprogramma](../plans/2026-11-18-completion-programme.md). Vermeld deze niet als werkende bediening alleen omdat een kanaaltype of contractveld bestaat.
