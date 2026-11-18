# Sessies, intrekken en veilige accountacties

Summary: wat de bestaande sessieacties doen, welke regressies zijn hersteld en wat nog geen beschikbare passkey- of privacyfunctie is.

API PR 137 en PR 138 zijn op 18 november 2026 naar develop gemerged. De daadwerkelijke productieversie moet bij release apart worden gecontroleerd. Zie [beheerstatus](../handbook/16-status-en-beheerkeuzes.md).

## Sessies intrekken

Uitloggen verwijdert de betrokken sessie en bijbehorende pushregistraties. Andere sessies intrekken houdt de gebruikte sessie beschikbaar. Een beveiligingsactie zoals wachtwoord wijzigen kan andere sessies eveneens intrekken. De client moet een `SESSION_REVOKE` verwerken door de betreffende verbinding/sessie te beëindigen.

De nieuwe API-code voert sessie-intrekking, push-tokencleanup en outboxevents als één transactie uit. Als het schrijven van de outbox mislukt, mag de database niet al half ingetrokken zijn. Detectie van hergebruik van een geroteerd refresh-token gebruikt dezelfde consistente intrekkingsroute en maakt het disconnect-event beschikbaar.

Dit garandeert geen onmiddellijke externe levering tijdens een broker-/netwerkstoring: het outboxpad moet nog publiceren en de gateway/client moeten het event verwerken. Een DB-herstel naar een ouder moment kan beveiligingsstaat terugdraaien; de [restoreprocedure](backup-restore.md#postgres) moet daarom sessies en replay expliciet behandelen.

## Gecontroleerd bewijs

De gerichte suite omvat sessies, auth-flow en devices, waaronder gelijktijdige refresh/logout-races. Twee regressies zijn eerst rood aangetoond: ontbrekend disconnect-event bij refresh-tokenhergebruik en een gedeeltelijk gecommitteerde intrekking bij outboxfalen. De reparatie adresseert die twee oorzaken.

De oorspronkelijke eenmalige `logout_all_revokes_every_other_session_and_keeps_the_current_one`-mislukking (api#121) is ondanks herhalingen niet verklaard. Claim niet dat de oorspronkelijke oorzaak is gevonden alleen omdat de nieuwe regressietests slagen.

PR 138 verwijdert specifiek de verlopen RUSTSEC-2026-0387-uitzondering na de JWT-dependencyupdate. Overige afzonderlijk gedocumenteerde RSA-/optionele-SQLite-uitzonderingen zijn daarmee niet automatisch opgelost.

## Rapporteren, opruimen en toekomstige accountfuncties

De bestaande report-endpoints zijn met zeven echte HTTP-tests gecontroleerd; member pruning met vier. Dat vervangt geen UI-/adminacceptatie. Een privébericht melden blijft een bewuste verstrekking van bewijs door de melder, geen algemene servertoegang tot privégeschiedenis.

Passkey-contracten en ontwerp zijn aanwezig, maar de runtime/clientceremonies worden afzonderlijk ontwikkeld. Geef geen passkey-registratie-instructies alsof die al live zijn. Gekoppelde accounts, privacyfilters/berichtverzoeken, export, verborgen badges en vrienduitnodigingen hebben eveneens afzonderlijke implementatie- en acceptatiekaarten.
