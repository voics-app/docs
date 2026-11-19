# GIF provider

The GIF picker calls the API's `/gifs/trending`, `/gifs/search` and `/gifs/categories`. The API expects a Tenor v2-compatible provider (`featured`, `search`, `categories`); it applies the existing public API rate limit and caches JSON responses in memory for 60 seconds. Favorites are account settings. The existing accessibility option controls animation in the picker and message views.

The provider is disabled by default. Before enabling it, choose a source whose agreement permits server-side proxying and response caching, verify its response format and attribution requirements, and configure `GIF_PROVIDER_URL`, the secret `GIF_PROVIDER_KEY`, and comma-separated exact `GIF_MEDIA_HOSTS` for the API. The API asks messages to sign preview URLs via its authenticated internal route; the existing media proxy applies its SSRF and size protections. Keep the key out of source control and client builds. No provider or production key is selected here.

Google retired the Tenor API on 30 June 2026. GIPHY prohibits proxying and caching; KLIPY requires prior approval for a proxy and its standard terms restrict caching. See [Google](https://support.google.com/tenor/answer/10455265), [GIPHY](https://developers.giphy.com/docs/api/best-practices/) and [KLIPY](https://docs.klipy.com/gif-api/gifs-search-api). Do not point this proxy at either service without an agreement that permits this architecture.

Before enabling for users, verify trending, categories, search, favorites across sessions, insertion and rendering of a sent link, disabled autoplay, rate limiting, provider attribution and the provider's content policy using an approved provider. With no configuration the endpoints return 503 and the picker reports that GIFs are unavailable.
