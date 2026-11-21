# Berichten: TTS en bijlagemetadata

Gecontroleerd op 18 november 2026. Eerste implementatie-increment voor messages#37 en messages#60: [contracts PR 38](https://github.com/voics-app/contracts/pull/38) en de bijbehorende messages-/clientwerkstroom. De beschrijving is geen claim dat de wijziging is uitgebracht. De [opleverstatus](../handbook/16-status-en-beheerkeuzes.md) scheidt tests, release en praktijkcontrole.

## TTS behouden

Het veld `tts` wordt bij opslag en responses behouden. Migratie `0007_message_tts` voegt een boolean aan de Scylla-berichtentabel toe. Historische null-waarden worden als false gelezen. De migratie gebruikt de bestaande migratieversietabel; Scylla 2025.1 accepteert hier niet zomaar `ADD IF NOT EXISTS`.

Een openbaar verzoek met `tts: true` vereist `SEND_TTS_MESSAGES`. Interne callers moeten het recht vóór doorsturen controleren; systeemberichten schakelen TTS altijd uit. Dit veld bewaren is niet hetzelfde als een complete voorleesinstelling of auditieve melding op ieder platform.

## Bestaande bijlagen aanpassen

`PATCH /channels/{id}/messages/{mid}` accepteert naast bestaande bewerkbare velden:

```json
{
  "attachments": [
    { "id": "123456789012345678", "description": "Een beschrijving van het beeld", "flags": 8 }
  ]
}
```

Het voorbeeld-ID is uitsluitend een voorbeeld van het formaat. Gebruik het werkelijke bijlage-ID van het bericht; dat is niet het bericht-ID.

| Regel | Gedrag |
|---|---|
| Eigenaarschap | Alleen bestaande bijlagen die bij dit bericht horen |
| Aantal | Maximaal tien patches |
| Beschrijving | Maximaal 1024 tekens; null of leeg/witruimte wist de alttekst |
| Niet genoemd | Andere bijlagen en niet genoemde velden blijven behouden |
| Flags | Alleen `IS_SPOILER` (8) is wijzigbaar; overige opgeslagen bits blijven behouden |
| Ongeldige input | Dubbel/onbekend ID of poging tot wijzigen van onveranderlijke velden weigert de hele berichtbewerking |
| Onveranderlijk | Object key, bestandsnaam, bytes en signed URL worden niet gewijzigd |
| Event | `edited_timestamp` verandert en `MESSAGE_UPDATE` wordt verstuurd |

Responses leveren `flags: 0` expliciet. Clients moeten een aanwezige flags-waarde vertrouwen; alleen wanneer flags ontbreekt mogen zij terugvallen op het historische `SPOILER_`-voorvoegsel. Anders zou een weggenomen spoiler door de oude bestandsnaam toch verborgen blijven.

De autorisatie van een gewone berichtbewerking blijft gelden. Deze route is geen willekeurige object-storage-mutatie en kan geen nieuwe bestanden aan een reeds verzonden bericht toevoegen.

## Verificatie en grenzen

Voor de implementatie faalden twee gerichte HTTP-regressietests. Daarna zijn de relevante HTTP-, domein-, applicatie- en workspace-tests en een echte Scylla-roundtrip door de werkstroom uitgevoerd. Het losstaande notificatiepad is eveneens met testproviders gecontroleerd. De UI voor deze metadata en onafhankelijke coördinatorcontrole hebben eigen opleverstappen.

Polls, opname/verzending van voice messages en geplande berichten zijn afzonderlijke open features. Aanwezigheid van velden zoals duration/waveform in een outputschema bewijst geen record-/upload-/afspeelstroom. Pushregels bestaan al, maar gelijke mention-tellers, volledige burstmetingen en echte APNs/FCM-ontvangst op een toestel blijven apart te verifiëren.

## Push en zoekindex

De notifier heeft APNs, FCM en PushKit-code. Een bestaande gatewayverbinding betekent niet automatisch dat push wordt overgeslagen: een mobiele socket kan op de achtergrond blijven bestaan. De client moet dubbele foregroundmeldingen onderdrukken. Zie [pushmeldingen](../runbooks/push-notifications.md).

De gekozen zoekarchitectuur is PostgreSQL full-text search, niet het oude lazy-guild/shardvoorstel. Rechten, privacy, backfill, belasting en herstel moeten tegen die actuele architectuur worden getoetst. Zie het [ADR-overzicht](../adr/README.md), ADR 0018, en het [herstelplan](../runbooks/backup-restore.md).
