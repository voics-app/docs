# Handleiding: Voics op de computer

Summary: de desktopapp installeren, gesprekken en servers gebruiken, bellen en schermdelen, instellingen vinden en problemen melden.

Deze handleiding gebruikt de Engelse knopnamen uit de Windows-app. Controleer je versie onder **Settings → About and updates**. Waar een functie een bepaalde versie vereist, staat die erbij. [Handleiding voor de mobiele app](14-handleiding-mobiele-app.md)

## 1. Installeren, bijwerken en inloggen

1. Ga naar [voics.nl](https://voics.nl) en kies **Download for Windows**. De officiële knop verwijst naar [Voics-Setup-latest.exe](https://updates.voics.nl/Voics-Setup-latest.exe). De installer is voor Windows x64.
2. Open het gedownloade bestand en volg de installatiewizard. Je kunt de installatiemap kiezen. Start daarna Voics en log in.
3. Controleer de geïnstalleerde versie onder **Settings → About and updates**. De [updatefeed](https://updates.voics.nl/latest.yml) vermeldt de aangeboden versie en de naam, grootte en SHA-512 van het versiegebonden installatiebestand. Op 19 november 2026 bood de feed 0.9.10 aan; controleer de feed opnieuw voor de actuele versie.

Wil je de download op inhoud controleren, download dan het in `latest.yml` genoemde versiegebonden `.exe`-bestand vanaf `https://updates.voics.nl/`. Vervang het pad hieronder door dat bestand en vergelijk de uitvoer met `sha512` in de feed:

```powershell
$hash = (Get-FileHash -Algorithm SHA512 -LiteralPath 'C:\pad\naar\Voics-Setup-X.Y.Z.exe').Hash
$bytes = [byte[]]($hash -split '(..)' | Where-Object { $_ } | ForEach-Object { [Convert]::ToByte($_, 16) })
[Convert]::ToBase64String($bytes)
```

Controleer ook dat versie en bestand bij elkaar horen; tijdens een publicatie kunnen caches tijdelijk achterlopen.

De geïnstalleerde app controleert automatisch op updates, downloadt een nieuwere versie en biedt **Restart to update** aan. Je kunt ook **Check for updates** gebruiken onder **Settings → About and updates**. Een gedownloade update wordt bij afsluiten geïnstalleerd. Bij een automatische upgrade blijven lokale gegevens behouden. Bij handmatige verwijdering is **Keep my data** standaard; **Remove everything** verwijdert ook lokale instellingen, opgeslagen berichten en versleutelingssleutels, maar niet je account. Op macOS is de dmg (`Voics-latest.dmg`) nog niet door Apple gecontroleerd: sleep Voics naar Programma's, klik met de rechtermuisknop op de app en kies **Open** (of voer `xattr -dr com.apple.quarantine /Applications/Voics.app` uit); automatische updates werken op macOS nog niet, download een nieuwe dmg handmatig. Linux heeft een afzonderlijke opleverkaart; ga alleen uit van een ondersteunde download wanneer deze daadwerkelijk op de website en in de release staat.

Log in met je e-mailadres en wachtwoord. Bij tweestapsverificatie vraagt de app daarna een authenticator- of back-upcode. Wachtwoordherstel begint bij het inlogscherm. Gebruik voor normaal gebruik de standaard Voics-verbinding; **Connection** is bedoeld om bewust een andere omgeving te kiezen.

Open instellingen met het tandwiel bij je naam. **My account** bevat je accountgegevens, wachtwoord en tweestapsverificatie. **Devices** toont je sessies. Meld onbekende apparaten af. **Log out** meldt de huidige app af. Het venster sluiten hoeft de app niet af te sluiten: dat hangt af van de instelling voor het systeemvak onder Desktop.

Passkeys, gekoppelde externe accounts en een volledige gegevens-export hebben op de controledatum nog geen complete beschikbare gebruikersstroom. Een ontwerp of knop in een testbranch is geen bewijs van beschikbaarheid.

## 2. De indeling

| Onderdeel | Gebruik |
|---|---|
| Serverkolom links | Wissel tussen Direct messages en je servers; open mappen en verander de volgorde waar de bediening dat toestaat |
| Gesprekken- of kanalenlijst | Kies een DM, categorie of kanaal; vet/stip betekent ongelezen en een getal betekent vermeldingen |
| Midden | Berichten, invoerveld en de bediening van de open chat |
| Boven een chat | Zoekfunctie, leden, pins en andere kanaalacties |
| Eigen naam onderaan | Status en sneltoegang tot microfoon, luisteren en instellingen |
| Gespreksbalk | Huidige spraakverbinding en ophangen |

Met **Ctrl+K** open je de Quick switcher. Typ een naam en kies de bestemming. **Ctrl+F** zoekt in de huidige context. Via de zoekfunctie binnen Settings vind je een instelling zonder alle pagina’s langs te lopen.

Rechtsklikken opent het menu van een server, kanaal, persoon of bericht. Met het toetsenbord kun je navigeren via Tab en de pijltjestoetsen; **Shift+F10** opent het contextmenu van het gefocuste onderdeel.

## 3. Berichten en bijlagen

Typ in de chat en druk op Enter om te versturen. **Shift+Enter** maakt een nieuwe regel. Heb je onder Chat **Send with Ctrl+Enter** aangezet, dan verstuurt Ctrl+Enter en maakt Enter een nieuwe regel.

Gebruik Reply in het berichtmenu om te antwoorden. Je antwoord verwijst naar het origineel. Controleer de eventuele vermelding van de ontvanger voordat je verstuurt. De aparte reply-ping- en stille-berichtverbeteringen worden onder client#113 opgeleverd; verwacht die niet automatisch in een oudere installer.

Je kunt je eigen bericht wijzigen of verwijderen. Andere berichten verwijderen vereist passende moderatierechten. Reacties voeg je toe via het berichtmenu of de reactiebalk. Pin vereist Manage Messages. **Mark Unread** laat je later vanaf een bepaald bericht verder lezen.

Voeg bestanden toe via de bijlageknop, slepen naar het invoerveld of **Ctrl+Shift+U**. Controleer de voorvertoning en het uploadresultaat voordat je het bericht als afgeleverd beschouwt. Een mislukte verzending blijft zichtbaar met herstelacties. Bestandslimieten en toegestane functies kunnen verschillen per bezorgmodus en kanaalrechten.

Spoilers worden verborgen totdat je ze opent. Beschrijvingen bij beelden maken ze toegankelijker. Het achteraf wijzigen van alttekst en spoilerstatus is een afzonderlijke nieuwe backend-/clientwijziging; daarvoor moeten beide kanten zijn uitgebracht. Zie het [metadata-contract](../protocols/message-metadata.md).

De gewone zoekindex bevat bewaarde Standard-berichten waarvoor je toegang hebt. Ephemeral en P2P hebben geen gewone servergeschiedenis om op dezelfde manier te doorzoeken. Resultaten kunnen ontbreken wanneer een index nog wordt opgebouwd of toegang is gewijzigd.

## 4. Vrienden, groepen en servers

Wil je aparte groepen in de ledenlijst, open dan **Server settings → Roles**, selecteer een rol en zet **Display separately** aan. Sla de rol op en wijs die toe aan de leden. Iemand die online is en meerdere van zulke rollen heeft, verschijnt onder de hoogste rol. Andere online leden en offline leden hebben elk hun eigen groep. Voor het wijzigen van rollen heb je beheerrechten nodig.

Via Friends bekijk je je vrienden en openstaande verzoeken. Open een profiel om een DM te starten. In een groeps-DM kun je groepsinstellingen gebruiken; het verbergen van een gesprek uit de lijst is iets anders dan de groep verlaten.

Open een serveruitnodiging of kies de join-optie bij **+** in de serverkolom. Controleer de servernaam en accepteer. Een verlopen of ingetrokken link kan alleen door een nieuwe uitnodiging worden vervangen. Een permanent eigen uitnodigingsadres wordt in de nieuwe serverbeheerwijziging toegevoegd en vereist de bijbehorende API- en clientrelease.

Een uitnodiging in de browser kan vragen of je Voics wilt openen. Toont Windows **Electron** na het gebruik van een ontwikkelversie, start dan de geïnstalleerde Voics-app vanuit het Startmenu en open de uitnodiging opnieuw. De geïnstalleerde app registreert zichzelf als afhandelaar. Vanaf 0.9.11 neemt een gewone ontwikkelstart die koppeling over als de ontwikkelaar dat uitdrukkelijk inschakelt.

De servernaam of een rechtsklik op het servericoon opent het servermenu. Daar staan onder andere uitnodigen, meldingsinstellingen en, wanneer toegestaan, Server settings. **Hide muted channels** verbergt gedempte kanalen zonder ze te verwijderen. **Collapse all categories** klapt de categorieën dicht. **Copy server ID** is nuttig voor een foutmelding; het is geen uitnodigingslink.

De uitbreiding van deze menu’s, Active Now en de sluitknop bij DM’s is voorbereid in client#342. Active Now toont bekende activiteit en toegankelijke spraakkanalen; het is geen garantie dat iemand beschikbaar is. De kolom wordt bij een smal venster verborgen.

## 5. Bellen, video en schermdelen

Vanaf Windows 0.9.11 opent de belweergave zodra je aan een gesprek deelneemt. In een privégesprek staat de chat eronder. In een spraakkanaal kun je de chat ernaast openen. Sleep de scheidingslijn om het gesprek of de chat meer ruimte te geven. Met het toetsenbord ga je met **Tab** naar de scheidingslijn. De pijltjestoetsen verplaatsen die in de richting van de twee vensters. Met **Home** en **End** kies je de kleinste of grootste stand, tussen 25% en 75%.

Een gedeeld scherm krijgt de focus wanneer je nog geen andere indeling hebt opgeslagen. Klik op de microfoon om jezelf te dempen. Met het aparte pijltje ernaast kies je een invoerapparaat.

1. Open een DM en gebruik de telefoonknop, of open een spraakkanaal.
2. Kies onder **Settings → Voice and video** de juiste microfoon en uitvoer. Controleer de microfoon met de beschikbare testbediening.
3. Kies **Voice activity** om bij spraak te verzenden of **Push to talk** om alleen tijdens een toetsdruk te spreken. Stel de toets in onder Keybinds.
4. Zet je camera aan in het gesprek als je video wilt. Geef toestemming wanneer het besturingssysteem daarom vraagt.
5. Start schermdelen vanuit de gespreksbediening. Kies bewust het venster of scherm dat je wilt tonen en bevestig. Controleer bij de andere deelnemer of het juiste beeld zichtbaar is.
6. Stop het delen met de stopbediening. Gebruik ophangen om de spraakverbinding te verlaten.

**Mute** schakelt je microfoon uit. **Deafen** schakelt het luisteren uit. Een geminimaliseerd venster of een ander geopend kanaal beëindigt een gesprek niet automatisch. Let daarom op de gespreksbalk.

Systeemrechten kunnen video en schermopname blokkeren, ook als de Voics-knop aan staat. Sluit privévensters voordat je een heel scherm deelt. Of systeemaudio, specifieke opnamebronnen en geavanceerde video-opties beschikbaar zijn, hangt af van besturingssysteem en build; de desktopinstellingen zijn niet één op één gelijk aan mobiel.

Bellen tussen desktop en iPhone is een afzonderlijk acceptatiescenario. Een eerder gemelde desktopcrash wordt door de kwaliteitswerkstroom onderzocht. Een geslaagde unit-test of lokale chatproef sluit die fout niet uit.

## 6. Status en meldingen

Op Windows toont het taakbalkicoon vanaf 0.9.11 één tot negen vermeldingen als cijfer. Bij tien of meer zie je **9+**. In de venstertitel kun je het precieze aantal zien. Een ongelezen bericht zonder vermelding krijgt een stip.

Via je profiel kies je **Online**, **Idle**, **Do not disturb** of **Invisible** en eventueel een tekststatus met eindtijd. Automatisch afwezig worden vervangt een bewuste niet-storen- of onzichtbaar-keuze niet. De desktop-idletijd vind je onder Desktop.

| Instelling | Wat je ermee regelt |
|---|---|
| Notifications | Banners, geluiden en de meldingsvoorkeuren van dit apparaat |
| Server-/kanaalmenu → Notification settings | Alle berichten, alleen vermeldingen, niets of de serverstandaard |
| Mute | Een server of kanaal tijdelijk of blijvend dempen |
| Do not disturb | Meldingen onderdrukken terwijl je de app kunt blijven gebruiken |
| Appearance en Accessibility | Thema, tekstgrootte, dichtheid, beweging en leesbaarheid |

Ongelezen berichten en vermeldingen zijn niet dezelfde telling. Taakbalk, systeemvak, venstertitel en geluid worden in client#84 nader gelijkgetrokken. Vergelijk bij twijfel het daadwerkelijke bericht en de kanaalinstellingen, niet alleen een badge. Een gedempt kanaal blijft toegankelijk en de berichten blijven bestaan.

## 7. Privacy, versleuteling en veiligheid

Onder **Privacy and delivery** kies je de bezorgvoorkeur voor gesprekken en zie je kanaalafwijkingen. De strengste toepasselijke keuze van deelnemers bepaalt de modus. De app mag een privébericht niet stilzwijgend als een gewoon bericht versturen wanneer versleuteling ontbreekt.

| Modus | Wat je moet weten |
|---|---|
| Standard | Berichten worden op de server bewaard; geschiedenis en serverzoekfunctie zijn mogelijk |
| Ephemeral | Versleutelde, tijdelijke bezorging; geen herstelbelofte voor niet-afgeleverde berichten bij verlies van de tijdelijke opslag |
| P2P | Rechtstreeks tussen deelnemers; bereikbaarheid van beide kanten speelt mee en er is geen centrale servergeschiedenis |

**Encrypt all my calls end-to-end** is een afzonderlijke gespreksinstelling. Als één deelnemer die inschakelt, vraagt het gesprek versleuteling voor iedereen. Een gesprekspartner kan nog steeds opnemen of een screenshot maken.

Blokkeren doe je vanuit het profiel of toepasselijke menu. Onder privacy vind je geblokkeerde personen en Unblock. Een gebruiker of bericht melden opent een formulier met categorie en toelichting. Controleer welke inhoud je meestuurt. Bij privéberichten moet je bewust instemmen met het delen van bewijs; versleuteling maakt die toestemming niet overbodig.

Een botantwoord dat alleen voor jou is bedoeld kan een **only you**-melding hebben. Dismiss verwijdert die weergave voor jou en is geen moderatieactie op een openbaar bericht. De nieuwe Safety centre-uitleg verduidelijkt dit; geavanceerde DM-verzoekfilters en per-serverprivacy hebben nog afzonderlijke API-afhankelijkheden.

## 8. Een server beheren

Open **Server settings** via de servernaam. De beschikbare pagina’s volgen jouw rollen en rechten. Een lid met een lager geplaatste rol kan niet zomaar een hoger geplaatst lid aanpassen.

| Pagina | Gebruik |
|---|---|
| Overview | Servernaam, afbeeldingen en algemene instellingen |
| Roles | Rollen, kleur, volgorde en rechten |
| Members | Leden zoeken en toegestane moderatieacties |
| Invites | Uitnodigingen maken, kopiëren en intrekken |
| Bans | Verbannen leden bekijken en, met rechten, een ban opheffen; na uitrol ook beroepsvragen en beroepen beheren met Manage Ban Appeals |
| Audit log | Beheerdersacties bekijken met View Audit Log |
| Template / Discovery | De bestaande template- en vindbaarheidsfuncties; niet alle geavanceerde communityfuncties zijn aanwezig |

Let op de balk met niet-opgeslagen wijzigingen. Sla op of herstel je wijzigingen voordat je naar een andere pagina gaat. **Delete server** is alleen voor de eigenaar en vraagt in de nieuwe navigatie om de exacte servernaam. Verwijderen is geen manier om een instelling terug te draaien.

Onder **Server settings → Server profile** (voor elk lid) stel je alleen voor deze server je bijnaam, avatar, banner en About me in. Een leeg veld of een verwijderde afbeelding valt terug op je accountprofiel. De Widget-pagina verschijnt zodra de API ervoor bestaat.

Voor de nieuwe permanente uitnodiging en auditinstellingen staan de precieze rechten en gevolgen in [serverinstellingen](../protocols/community-settings.md). Een kortere auditbewaartermijn kan oudere gegevens verwijderen. Het uitzetten van het log is geen algemene privacyverwijdering en wist geen externe back-ups.

### Community en vindbaarheid

Onder **Server settings → Discovery** kun je Community inschakelen en een rules-
en updateskanaal kiezen. Beide moeten een tekst- of announcementkanaal met
Standard-bezorging zijn, zonder leeftijdsbeperking. Hetzelfde kanaal mag beide
doelen dienen. Sla Community eerst op en kies daarna een categorie en tags om de
server in Discover te tonen. De overige eisen staan op de pagina; een bestaande
listing die niet meer voldoet krijgt de status gepauzeerd.

Community uitschakelen en opslaan verwijdert de listing en wist beide
kanaalkeuzes. Opnieuw inschakelen maakt de server niet automatisch vindbaar.
Vervang een ingesteld kanaal voordat je het verwijdert of de bezorgmodus wijzigt.
Deze instelling voegt geen verplichte regelsacceptatie of onboarding toe.

Op een Discover-kaart opent **Report listing** een melding met categorie en
optionele toelichting. Moderatoren krijgen een kopie van de openbare listing
op het moment van melden. Privékanalen, leden en berichten worden niet
meegestuurd. Een melding verwijdert de listing niet automatisch. De bediening
hoort bij de api#45-increment; onafhankelijke acceptatie van de geïntegreerde
desktop/API/admin-versies blijft een aparte stap. Zie de
[specificatie en uitrolgevolgen](../specs/2026-11-03-server-discovery.md).

### Een server delen als sjabloon

Onder **Server settings > Template** kun je met Manage Server een sjabloon
maken van de kanalen, rollen en instellingen. Leden en berichten worden niet
gekopieerd. Geef het sjabloon een naam en kies **Generate template link**.
**Copy** kopieert de link. Na wijzigingen aan de server geeft het scherm aan
dat het sjabloon verouderd is; **Sync with this server** vervangt de gedeelde
structuur. **Delete template** maakt de link ongeldig.

De afrondingswijziging van 18 november voegt een openbare webpagina toe die
het sjabloon laat zien en de app opent. In de app kies je **Create server** en
geef je de nieuwe server een naam. Je wordt eigenaar van een nieuwe server;
je treedt hiermee niet toe tot de oorspronkelijke server. De publicatie en
onafhankelijke controle van deze wijziging moeten nog worden bevestigd.

## 9. Handige toetsen

Deze standaardtoetsen kun je onder Keybinds aanpassen. Een globale toets werkt alleen wanneer die optie door de geïnstalleerde desktopbuild wordt ondersteund en aangezet.

| Toets | Actie |
|---|---|
| Ctrl+K | Quick switcher |
| Ctrl+F | Zoeken |
| Ctrl+Shift+M | Microfoon dempen of weer inschakelen |
| Ctrl+Shift+D | Luisteren uit- of inschakelen |
| Ctrl+Shift+V | Camera aan of uit |
| Ctrl+Shift+S | Schermdelen starten of stoppen |
| Ctrl+Shift+A / Ctrl+Shift+X | Inkomend gesprek aannemen / afwijzen |
| Ctrl+Shift+U | Bestand toevoegen |
| Escape | Open dialoog sluiten; zonder zo’n dialoog kan de chat als gelezen worden gemarkeerd |
| Ctrl+/ | Overzicht van sneltoetsen |

## Beroep tegen een ban

Deze functie is in ontwikkeling en nog niet als uitgebrachte functie bevestigd. Een moderator met **Manage Ban Appeals** stelt onder **Server Settings > Bans** een korte beroepsvraag in en kan open beroepen accepteren of weigeren. Accepteren heft de ban op; de gebruiker heeft daarna nog een geldige uitnodiging nodig om terug te keren. De beroepslijst toont maximaal 100 zaken, open zaken eerst, met beslissing en reviewer; de beslissing verschijnt daarnaast in het auditlog als auditregistratie voor die server is ingeschakeld. De beroepsbevoegdheid geeft op zichzelf geen toegang tot de gewone banlijst.

Een verbannen gebruiker kan via een geldige serveruitnodiging bij **You are banned** de ingestelde vraag beantwoorden en **Submit appeal** kiezen. De server accepteert maximaal een open beroep per gebruiker. Een moderator ziet de vraag en het antwoord; deel daarom alleen informatie die je aan de servermoderators wilt verstrekken. Als een ban op een andere manier is opgeheven, sluit het open beroep. Een oud beroep kan een latere ban niet opheffen. Bij definitieve anonimisering van je account worden je beroepsteksten verwijderd. Een verlopen uitnodiging biedt geen ingang naar het formulier.

## 10. Problemen oplossen

| Probleem | Wat je controleert |
|---|---|
| Geen verbinding | Internet, de gekozen Connection-omgeving, versienummer en eventuele onderhoudsmelding |
| Niet verzonden bericht | Fouttekst, kanaalrechten en netwerk; gebruik de herstelactie bij het bericht |
| Geen microfoongeluid | Gekozen invoer, systeemrechten, Mute en Push to talk-toets |
| Echo | Gebruik een headset; controleer dat niet twee apparaten in dezelfde kamer hun microfoon en luidspreker open hebben |
| Zwart camerabeeld | Systeemrechten, gekozen camera, andere apps die de camera gebruiken; zet video eenmaal uit en aan |
| Geen beeld bij delen | Gekozen bron, schermopnamerechten en of de andere deelnemer jouw stream bekijkt |
| De app herstart bij bellen | Noteer tijdstip, versies, gesprekstype en wat vlak daarvoor gebeurde; meld of het hele proces wegviel of alleen het venster vernieuwde |
| Geen update | Bekijk About and updates, controleer internet en gebruik de officiële installer als de ingebouwde updater een fout meldt |

Neem bij een fout het versienummer, OS, concrete stappen en fouttekst op. Deel crashbestanden alleen via het afgesproken privékanaal na controle op gevoelige inhoud. Verwijder geen profielmap of versleutelingssleutels als algemene probleemoplossing.

## Controle en beperkingen

De bediening is gecontroleerd tegen de instellingenindex, toetsenregistratie en bestaande clientcomponenten. De [verificatiestatus](16-status-en-beheerkeuzes.md) houdt bij welke nieuwe werkstromen alleen code/tests hebben en welke release- of gebruikersproef nog ontbreekt. Deze handleiding verklaart een open opleverkaart niet automatisch voltooid.
