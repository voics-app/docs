# GIF provider (not offered)

Voics does not offer a GIF picker. The owner decided that no GIF provider will be configured, because every suitable provider needs an external account and API key. The GIF button and picker were removed from the desktop and mobile clients (client change `feature/drop-gifs`), and [api#32](https://github.com/voics-app/api/issues/32) was closed as not planned.

What still works: members can upload animated GIF attachments and paste direct GIF links, which render as images (honouring the animation accessibility setting). Avatars, banners and custom emoji can still be animated GIFs.

The API keeps its optional `/gifs/*` routes, but they answer 503 unless `GIF_PROVIDER_URL`, `GIF_PROVIDER_KEY` and `GIF_MEDIA_HOSTS` are all set. Nothing sets them, and no client calls them. Do not configure them in any environment. If the decision is reversed, the old picker is in git history before `feature/drop-gifs`; a provider whose terms permit server-side proxying and caching (Google retired the Tenor API on 30 June 2026; GIPHY prohibits proxying and caching; KLIPY requires prior approval) would be needed first.
