# Documentatie publiceren en de Notion-mirror controleren

Summary: de bestaande Git-naar-Notion-route gebruiken en bewijzen dat nieuwe handleidingen daadwerkelijk op de juiste pagina’s staan.

De docsrepo is de bron. De bestaande workflow `.github/workflows/notion-sync.yml` synchroniseert bij een push naar `main`. Er is geen nieuwe Notion-plugin, integratie of database-indeling nodig. Handmatige wijzigingen in gespiegeld paginacontent kunnen bij een volgende sync worden overschreven.

## Voor publicatie

1. Werk op een featurebranch, met behoud van stabiele bestandsnamen waar een pagina al bestaat.
2. Voer `pnpm install --frozen-lockfile`, `pnpm lint` en de linkcontrole uit. Review echte opdrachten en markeer plannen als plannen.
3. Controleer dat `collectRows` in `scripts/notion-sync/sources.mjs` alle nieuwe bestanden onder handbook, runbooks, protocols en plans vindt. Gebruik geen niet-gespiegelde map voor een bedoelde Notion-handleiding.
4. Laat de PR naar develop controleren. Maak daarna via het bestaande releaseproces de wijziging op main beschikbaar. De coördinator beheert deze merges en releases.

Een `--dry-run` doet nog steeds geauthenticeerde leesaanvragen aan de bestaande Notion-structuur. Het is geen volledig offline controle. Een lokale parsercontrole met `collectRows` en `convertMarkdown` is wel offline en wijzigt geen Notion-pagina’s.

## Na de push naar main

Bekijk de run voor de **juiste commit**, bijvoorbeeld met:

```sh
gh run list --repo discordy-voics/docs --workflow notion-sync.yml --branch main --limit 5
gh run view <run-id> --repo discordy-voics/docs
```

Gebruik het run-ID van de gepubliceerde commit, niet alleen de nieuwste groene run van een eerdere release. De workflow kan vanwege Notion-rate limits tijd kosten. Bij een fout controleer je de geredigeerde fout en de run voordat je een herhaling start.

De integratie gebruikt het al ingestelde repositorysecret `NOTION_TOKEN`. Toon of kopieer dat token niet in logs of chat. Er is geen reden om de brede GitHub-CLI-token voor Notion of clustergebruik in te zetten. `--prune-root` is een aparte opruimactie voor onbeheerde blokken en hoort niet bij gewone publicatie.

## Controleer de inhoud, niet alleen de groene workflow

De coördinator controleert via de bestaande Notion-API-toegang:

| Controle | Verwacht bewijs |
|---|---|
| Stabiele identiteit | Elke pagina heeft het bedoelde `Source path`; geen tweede pagina voor dezelfde handleiding |
| Nieuwe inhoud | Titel en representatieve paragrafen/blokken komen overeen met de gepubliceerde bron |
| Contenthash | `Content hash` is bijgewerkt volgens het mirror-algoritme; het is niet simpelweg de SHA van het losse Markdownbestand |
| Navigatie | Dashboard/FAQ linken naar de mobiele en desktophandleiding, tweede-servergids en backupplan |
| Bestaande pagina’s | De hergebruikte backup-/migratiepagina heeft geen oude uitvoerclaims meer |
| Gevoelige informatie | Geen token-/sleutelwaarden, logininhoud of ongewenste QA-accountgegevens |

Controleer in ieder geval deze bronpaden na deze documentatierelease:

- `handbook/14-handleiding-mobiele-app.md`
- `handbook/15-handleiding-desktop.md`
- `handbook/16-status-en-beheerkeuzes.md`
- `runbooks/server-uitbreiden.md`
- `runbooks/voice-regions/adding-a-region.md`
- `runbooks/notion-publicatie-controleren.md`
- `runbooks/backup-restore.md`
- `plans/2026-10-19-rke2-rancher-migration.md`
- `protocols/community-settings.md`
- `protocols/message-metadata.md`
- `plans/2026-11-18-completion-programme.md`

Leg run-ID, main-commit, datum, pagina-URL’s en inhoudscontrole vast in de oplevering. Geen pagina-URL verzinnen wanneer de sync nog niet is uitgevoerd. Een herhaling hoort ongewijzigde inhoud over te slaan. Bij een afwijking corrigeer je de bron of het bestaande mirror-script; bouw geen tweede synchronisatieroute.

Een bestaande succesvolle [mirror-run 44278139381](https://github.com/discordy-voics/docs/actions/runs/44278139381) hoort bij main-commit `74ccfdc98d9aa4ee98c542e378f7e96684e0f1fb`. Dit is historisch workflowbewijs, geen inhoudsverificatie van een toekomstige release. Leg na publicatie de nieuwe run en daadwerkelijke pagina-URL?s vast; zolang deze wijziging alleen in een PR staat bestaan daarvoor geen verificatieclaims.
