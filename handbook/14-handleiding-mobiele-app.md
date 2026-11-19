# Handleiding: Voics op iPhone en Android

Summary: installeren, inloggen, berichten, servers, bellen, beeld, meldingen en privacy op je telefoon. De Engelse knopnamen staan erbij zodat je ze in de app herkent.

Gecontroleerd op 18 november 2026. De publieke mobiele versie is 1.0.0. Onderaan staat welke nieuwe verbeteringen nog een release of een test op een echte telefoon nodig hebben. De [desktophandleiding](15-handleiding-desktop.md) beschrijft instellingen die alleen op de computer bestaan.

## 1. Installeren en bijwerken

| Telefoon | Zo installeer je Voics |
|---|---|
| iPhone, gewone versie | Open [Voics in de App Store](https://apps.apple.com/nl/app/voics/id6831532158) en kies Download. Updates verschijnen in de App Store. |
| iPhone, testversie | Installeer TestFlight uit de App Store, open de [openbare uitnodiging](https://testflight.apple.com/join/2zQRFhHH) en kies Accept en Install. Gebruik deze route als je bewust een testversie wilt. |
| Android | Open [de downloadpagina](https://voics.nl), kies Download for Android en open de APK. De rechtstreekse download is [Voics-latest.apk](https://updates.voics.nl/Voics-latest.apk). Android kan vragen of deze browser een app mag installeren. Geef dat alleen voor deze downloadbron toestemming. |

Op 18 november waren iPhone-builds 6 en 7 beschikbaar voor externe TestFlight-testers, met een einddatum van 4 februari 2027 en een limiet van 100 deelnemers. Een verlopen testversie moet door een nieuwe build worden vervangen. De Android-basisversie is 1.0.0, versiecode 7. Een nieuwe APK installeer je over de bestaande app; verwijder de app niet om een normale update te doen.

De App Store-versie en een TestFlight-versie gebruiken dezelfde app-identiteit. Een testversie is geen afzonderlijk tweede account. Expo Go is een hulpmiddel voor ontwikkelaars en biedt niet alle functies van de geïnstalleerde app, zoals native bellen, push en versleuteling.

## 2. Inloggen en je account beveiligen

1. Open Voics. Log in met het e-mailadres en wachtwoord van je Voics-account.
2. Heeft je account tweestapsverificatie, vul dan de code uit je authenticator in. Een ongebruikte back-upcode kan daarvoor in de plaats worden gebruikt.
3. Wacht tot je servers en gesprekken laden. De app bewaart je aanmelding op dit toestel.
4. Ben je je wachtwoord vergeten, gebruik dan de hersteloptie op het inlogscherm. Controleer ook je spammap voor de e-mail.

Tik op je naam of het tandwiel onderaan de zijbalk om Settings te openen. Onder **My account** wijzig je je gebruikersnaam, e-mailadres en wachtwoord en beheer je tweestapsverificatie. Bewaar back-upcodes buiten je telefoon; deel ze niet in een chat.

**Devices and sessions** toont waar je bent ingelogd. Meld een onbekende sessie af. De actie voor alle andere sessies houdt de sessie waarmee je die actie uitvoert beschikbaar. **Log out** meldt alleen deze app af. Een wachtwoordwijziging meldt andere sessies af.

**Disable account** en **Delete account** hebben verschillende gevolgen. Uitschakelen verbergt het account totdat je weer inlogt. Verwijderen plant verwijdering na veertien dagen; lees de bevestiging zorgvuldig. Gebruik accountverwijdering niet om een verbindingsprobleem op te lossen.

Passkeys staan in het technische ontwerp, maar zijn nog geen beschikbare inlogmethode in de hier beschreven publieke versie.

## 3. Je weg vinden

De smalle kolom links bevat Direct messages en je servers. Daarnaast staan je gesprekken of de kanalen van de gekozen server. Een tik op een kanaal opent de chat. Met de terugpijl, de veeg vanaf de linkerrand op iPhone of de Android-terugknop ga je terug.

| Wat je zoekt | Waar je het vindt |
|---|---|
| Persoonlijk gesprek | Direct messages bovenaan de serverkolom |
| Vrienden | Friends vanuit de DM-weergave |
| Vermeldingen | De bel boven de gesprekken- of kanalenlijst: Notifications |
| Serverkanalen | Tik op het servericoon; tik op een categorie om die open of dicht te klappen |
| Leden | Het personenicoon in een serverchat; tik op een persoon voor het profiel |
| Eigen instellingen | Je naam, avatar of tandwiel onderaan de zijbalk |
| Een instelling zoeken | Search settings bovenaan Settings |

Een stip of vet kanaal betekent ongelezen activiteit; een rood getal wijst op vermeldingen. Dat zijn verschillende tellers. Het openen van een gesprek kan het als gelezen markeren. De bel is een overzicht in de app en staat los van de toestemming voor telefoonmeldingen.

## 4. Chatten, reageren en bestanden delen

1. Open een gesprek of tekstkanaal.
2. Tik in het invoerveld, schrijf je bericht en tik op Send.
3. Blijft een bericht staan als **Not sent**, lees de fout. **Retry** probeert opnieuw; **Discard** verwijdert de mislukte verzending uit jouw overzicht.

Houd een bericht ingedrukt voor acties zoals Reply, Copy Text, Select Text, Edit, Delete, reageren of melden. Je ziet alleen acties waarvoor je rechten hebt. Je kunt ook naar links over een bericht vegen om te antwoorden. Een antwoord toont het oorspronkelijke bericht erboven; tik daarop om terug te springen.

Tik op de emojiknop om emoji te kiezen. Tik op een reactie onder een bericht om die zelf toe te voegen of weg te halen. Houd een reactie ingedrukt om te zien wie heeft gereageerd. **Pin** is alleen beschikbaar met de juiste serverrechten en in ondersteunde kanalen.

Gebruik **+** voor Photo library, Take photo or video of Files. Je kunt maximaal tien bestanden van elk maximaal 25 MB bijvoegen. Controleer de voorvertoning en verwijder een verkeerde bijlage voordat je verstuurt. Bij uploads zie je voortgang en kun je annuleren. Privébezorgmodi ondersteunen niet automatisch dezelfde bijlagen als gewone kanalen.

Tik op een foto of video om die groter te bekijken. Spoilers worden pas zichtbaar nadat je erop tikt. Een link kan eerst een bevestiging tonen wanneer de zichtbare tekst en het doeladres niet overeenkomen.

In de volgende appversie kun je bij een eigen bericht in een Standard-chat ook **Edit Attachments** kiezen. Wijzig de beschrijving of **Mark as spoiler** en kies **Save changes**. Het bestand wordt niet opnieuw geüpload. **Cancel** laat de opgeslagen waarden staan. Een fout bij opslaan houdt je concept beschikbaar om opnieuw te proberen. Deze bediening is op de Android-QA-app gecontroleerd met een tweede account; de publieke app en berichtendienst moeten de bijbehorende update nog krijgen.

Via het menu **…** bij een kanaal vind je onder andere Mark as read, Mute channel en Notification settings. Gebruik **Mark Unread** bij een bericht als je daar later verder wilt lezen. Zoekacties, vastgezette berichten en threads zijn vanuit de bijbehorende chatbediening bereikbaar. Een forum toont onderwerpen als berichtenreeksen.

## 5. Vrienden en servers

Open Friends om vrienden en verzoeken te bekijken. Open het profiel van iemand om een gesprek te beginnen. Een groepsgesprek is een gesprek met meerdere mensen; een server groepeert kanalen en heeft eigen rollen en rechten.

Om een server binnen te gaan, open je een uitnodigingslink of gebruik je **+** in de serverkolom en de optie om een server te joinen. Bekijk de naam voordat je accepteert. Een verlopen of ingetrokken uitnodiging moet door de serverbeheerder worden vervangen.

Tik op de servernaam voor het servermenu. **Invite people** verschijnt als je uitnodigingen mag maken. **Server settings** verschijnt alleen bij passende rechten. Beheerders vinden daar onder andere kanalen, rollen, leden, uitnodigingen, bans en het auditlog, afhankelijk van hun rechten en de appversie. Een ontbrekende knop betekent vaak dat je die actie niet mag uitvoeren.

Verlaat een server via **Leave server** en bevestig. De eigenaar kan zijn eigen server niet op dezelfde manier verlaten; eigendom en verwijderen zijn afzonderlijke handelingen.

## 6. Bellen en camera

1. Open een persoonlijk gesprek en tik op de telefoon- of cameraknop. Je kunt ook een spraakkanaal openen en **Join voice** kiezen.
2. Geef microfoontoestemming als je wilt spreken. Geef cameratoestemming alleen als je video wilt aanzetten.
3. Controleer of de verbinding tot stand komt. Gebruik een headset als geluid terugkomt als echo.
4. Met **Mute** zet je je microfoon uit. **Deafen** schakelt het luisteren uit. De cameraknop zet video aan of uit; bij actieve video kun je de voor- of achtercamera kiezen.
5. **Leave voice** beëindigt jouw deelname. Alleen het gespreksscherm sluiten is niet hetzelfde als ophangen; de gespreksbalk kan zichtbaar blijven.

Een inkomend gesprek kan in een native build via het belscherm van het besturingssysteem worden aangeboden. Dit hangt ook af van meldingsrechten, de netwerkverbinding en de instellingen van de telefoon. Er is nog geen volledige acceptatietest voor alle combinaties van app gesloten, vergrendeld scherm en mobiel netwerk geregistreerd.

Is er geen geluid of beeld, controleer dan eerst de microfoon- en camerarechten in de telefooninstellingen. Test daarna met twee deelnemers op verschillende apparaten. Als het op wifi werkt maar via 4G/5G niet, meld dat verschil: een werkende website bewijst niet dat het spraakverkeer bereikbaar is.

## 7. Schermdelen op iPhone: nieuwe build nodig

De ReplayKit-uitbreiding voor iPhone-schermdelen is toegevoegd in de nieuwe ontwikkelversie. De publieke builds 6/7 zijn geen bewijs dat deze nieuwe uitbreiding daarin zit. Gebruik deze stappen pas met een build waarvan de releasegegevens de uitbreiding bevestigen.

1. Neem deel aan een gesprek.
2. Tik op **Share screen**. iOS opent zijn eigen toestemming voor een schermuitzending.
3. Start de Voics-uitzending in dat systeemvenster. De andere deelnemer moet jouw schermstream openen om het beeld te beoordelen.
4. Gebruik **Cancel screen sharing** als de aanvraag nog wordt gestart en je niet wilt doorgaan.
5. Gebruik **Stop sharing screen** of de stopbediening van iOS om te stoppen. Ophangen beëindigt ook het delen.

Een camerabeeld en een gedeeld scherm zijn afzonderlijke streams. Delen van je scherm kan ook inhoud van andere apps tonen. Sluit privé-inhoud voordat je begint. Systeemaudio is geen toegezegde functie van deze wijziging.

De native iOS-build en geautomatiseerde tests zijn geslaagd. Een fysieke iPhone die zichtbaar beeld naar een tweede apparaat stuurt, plus stoppen, opnieuw starten en wisselen tussen camera en scherm, moet nog worden afgetekend. Android is daarvoor geen vervangende test.

## 8. Online, afwezig en niet storen

Ga naar **Settings → Profile → Status**. De opties heten **Online**, **Idle** (afwezig), **Do not disturb** en **Invisible**. Je kunt daarnaast een tekststatus met eindtijd instellen.

In de nieuwe ontwikkelversie geldt de volgende achtergrondregel; daarvoor moeten zowel de nieuwe app als de nieuwe gateway zijn uitgebracht:

| Keuze | Wat anderen zien wanneer de app naar de achtergrond gaat |
|---|---|
| Je hebt op dit toestel niet bewust Online gekozen | Afwezig; bij terugkeer wordt automatisch Online hersteld als geen andere handmatige status geldt |
| Je kiest zelf Online | Online blijft de bedoeling, ook op de achtergrond |
| Idle, Do not disturb of Invisible | Je handmatige keuze blijft behouden |

De expliciete Online-keuze wordt per account op dit toestel onthouden. Een andere telefoon kan een andere lokale keuze hebben. De gateway bewaart een gemelde achtergrondstatus maximaal 24 uur. Dat is geen voortdurend actieve netwerkverbinding. Geforceerd afsluiten is niet altijd te onderscheiden van normale achtergrondpauze; na een gatewaycrash kan aanwezigheid terugvallen op de kortere gewone TTL van ongeveer 120 seconden. Aanwezigheid is daarom geen bewijs dat iemand op dat moment naar het scherm kijkt.

## 9. Meldingen en privacy

In **Settings → Notifications** beheer je Push notifications, Show message previews en Only mentions. Een weigering in de systeeminstellingen wordt niet door een schakelaar in Voics ongedaan gemaakt; kies dan Open Settings of open de meldingsinstellingen van je telefoon.

Voor één server of kanaal gebruik je het bijbehorende menu: Mute en Notification settings. Controleer zowel die instellingen als Do not disturb wanneer je geen melding ontvangt. Wanneer het gesprek al open is, kan de app een extra systeemmelding onderdrukken om dubbele meldingen te voorkomen.

Onder **Privacy and delivery** vind je bezorginstellingen, gespreksversleuteling en geblokkeerde personen. Standard-berichten worden op de server bewaard. Ephemeral en P2P hebben andere bewaareigenschappen en vereisen de native versleutelingsondersteuning; de mobiele keuzebediening is nog beperkt. Verander een bestaande privéchat niet naar Standard als oplossing voor een storing.

**Encrypt all my calls end-to-end** geldt voor gesprekken. Als een deelnemer die instelling aan heeft, vraagt het gesprek versleuteling voor iedereen. Versleuteling voorkomt niet dat een gesprekspartner zelf een opname of screenshot maakt.

Bij ongewenst gedrag kun je vanuit het profiel blokkeren of een bericht/gebruiker melden. Lees welke tekst en bewijsmaterialen de melding meestuurt, vooral bij privéberichten. De melding is een bewuste verstrekking aan moderators. Een melding verzenden verwijdert het oorspronkelijke bericht niet automatisch.

## 10. Problemen oplossen

| Probleem | Eerste stappen |
|---|---|
| Inloggen mislukt | Controleer e-mailadres, wachtwoord en authenticatorcode. Gebruik wachtwoordherstel als nodig. Deel je wachtwoord of codes niet met ondersteuning. |
| Gesprekken verversen niet na terugkeer | Wacht even op opnieuw verbinden, controleer internet en open de app opnieuw. Noteer of het alleen na vergrendelen gebeurt. |
| Bericht blijft Not sent | Lees de fout, controleer netwerk en rechten, probeer Retry. Controleer op dubbele inhoud voordat je hetzelfde bericht opnieuw typt. |
| Geen melding | Controleer telefoonrechten, Focus/niet storen, batterijbeperkingen, appinstellingen en de server-/kanaalmute. |
| Camera zwart | Controleer rechten, zet de camera uit en weer aan en controleer of een andere app de camera gebruikt. Noteer of de andere deelnemer ook zwart beeld ziet. |
| Geen Share screen | Controleer de exacte build; een nieuwe native uitbreiding verschijnt niet door alleen de appinhoud te verversen. |
| Gesprek verbreekt buiten wifi | Noteer netwerk, tijdstip en of een tweede deelnemer hetzelfde ziet. Dit moet ook aan de serverzijde worden onderzocht. |

Geef bij een fout je appversie/build, telefoonmodel, OS-versie, tijdstip, stappen en een beschrijving van wat je zag. Deel geen wachtwoorden, toegangstokens of privégesprekken. Een schermafbeelding kan worden bijgesneden of onleesbaar gemaakt voordat je die deelt.

## Controle en beperkingen

De handleiding is vergeleken met de mobiele schermen, instellingenindex en spraakbediening in de clientrepo. De geïsoleerde Android-QA-app is geïnstalleerd en gecontroleerd op aanmelden, berichten, opgeslagen bijlagewijzigingen, achtergrondstatus en tweerichtingsvideo met een desktopdeelnemer. De video bleef na de reparatie werken tijdens twee vertrek-/terugkeercycli van die deelnemer. De iOS-simulator heeft de native app en ReplayKit-uitbreiding gebouwd en de start-/aanmeldschermen doorlopen. Dit bewijst geen productiepush of fysieke iPhone-schermuitzending. Het [testverslag](../plans/2026-11-18-acceptance-evidence.md), de [actuele verificatiestatus](16-status-en-beheerkeuzes.md) en het [opleverprogramma](../plans/2026-11-18-completion-programme.md) onderscheiden deze controles van een uitgebrachte versie.

### Beroep tegen een ban

Deze functie is in ontwikkeling en nog niet als uitgebrachte functie bevestigd. Een verbannen gebruiker opent een geldige serveruitnodiging, kiest **Accept invite** en kan op **You are banned** de ingestelde vraag beantwoorden en **Submit appeal** kiezen. Er kan maximaal een beroep tegelijk openstaan. Een verlopen uitnodiging biedt geen ingang naar het formulier.

Een moderator met **Manage Ban Appeals** kan onder **Server Settings > Bans** een vraag instellen en beroepen accepteren of weigeren. Accepteren heft de ban op; de gebruiker heeft daarna een geldige uitnodiging nodig om terug te keren. De beroepslijst toont maximaal 100 zaken met hun status en reviewer, ook als het serverauditlog uitstaat. Bij ingeschakelde auditregistratie verschijnt de beslissing ook in het auditlog. Definitieve anonimisering van je account verwijdert je beroepsteksten.
