# Gatewaycluster en voice-registraties controleren

Summary: readiness, DNS, Erlang-distributie, reconnects en unieke voice-endpoints controleren vóór extra replica’s worden toegelaten.

Stand 18 november 2026: gateway PR 60 is naar develop gemerged en met twee BEAM-processen getest. Voice PR 33 bereidt exclusieve etcd-registraties voor. Dit zijn applicatiecontroles; er is geen extra server aangesloten of replica-profiel geactiveerd. Zie [serveruitbreiding](server-uitbreiden.md).

## Gateway: wat de gereedheid betekent

Elke gateway heeft een unieke runtime-node-identiteit, dezelfde `RELEASE_COOKIE` en toegang tot de gedeelde stores. `CLUSTER_DNS_QUERY` verwijst naar de headless Service die ook nog niet gereed zijnde pods zichtbaar maakt. DNS, EPMD en Erlang-distributie moeten tussen de pods werken. Toon de cookie nooit in logs.

Er blijft één gedeelde Kafka-consumergroep per topic. De bestaande clusterbrede `:pg`-/Horde-verdeling bereikt de sessies op andere nodes. Een eigen consumergroep per replica zou die clusterbrede dispatches dupliceren.

Met discovery ingeschakeld bevat `/readyz` een clustercontrole. Tot de ontdekte nodes verbonden zijn en de sessiedirectory’s lidmaatschap hebben uitgewisseld, krijgen nieuwe sockets de herhaalbare sluitcode **4015**. De metric **`discordy_gateway_cluster_ready`** laat die gate zien; ook een DNS-fout sluit hem.

De gate wordt gecontroleerd vóór eventverwerking. Een proces- of netwerkfout tijdens al begonnen asynchrone fan-out is daarmee niet atomair. Clients hebben nog steeds reconnect, resume of resynchronisatie nodig. HTTP-ready is geen bewijs dat ieder bericht onder elke partitie wordt bezorgd.

## Bij een niet-gereed cluster

1. Controleer node-/podplaatsing, Service-selectors, EndpointSlices en het actuele `CLUSTER_DNS_QUERY` zonder secretwaarden op te vragen.
2. Controleer DNS vanuit beide gatewaypods, inclusief ontdekte nog niet gereed zijnde peers.
3. Controleer EPMD-/distributiebereikbaarheid en dat nodes werkelijk verbonden zijn. Vergelijk configuratiebronnen; publiceer geen `RELEASE_COOKIE`.
4. Controleer sessiedirectorylidmaatschap, Valkey, Redpanda en de foutvelden van `/readyz`.
5. Test twee echte WebSocket-clients op verschillende instanties: één event bij beide, disconnect/reconnect via de andere instantie en behoud of gecontroleerde vernieuwing van de sessie.
6. Test een geïsoleerde partitie en herstel vóór productieopschaling. Verlaag de gate niet om de symptomen te verbergen.

De coördinator herhaalde 39 gerichte gateway-/twee-BEAM-tests op de gecombineerde presence/scale-code. Dat bewijst geen cross-host Kubernetes-netwerk, Cloudflare-route of productiebelasting. De eerdere throughput- en geheugenkaarten blijven eigen onderzoeken.

## Voice: exclusieve eigenaar en eigen endpoint

De voicewijziging gebruikt een atomische etcd-claim: een nieuwe registratie verwacht een nog ontbrekende key. Vernieuwen en verwijderen vergelijken de lease van de eigenaar. Een oude pod kan zo niet de registratie van een opvolger verwijderen. Bij onzekere/eigenaarloze registratie sluit de gereedheid; bestaande mediasessies hoeven daarmee niet onmiddellijk te verdwijnen.

Controleer per instantie `VOICE_REGION`, `VOICE_NODE_ID`, `VOICE_PUBLIC_WS_URL`, `VOICE_PUBLIC_IP` en UDP-poort als één samenhangende identiteit. Node-ID-uniciteit alleen is onvoldoende wanneer twee verschillende SFU’s hetzelfde externe endpoint adverteren. Houd signaling en media aan dezelfde toegewezen node gekoppeld.

De `NodeRegistration`-port scheidt lease-eigendom van de signaling-/healthlifecycle. Test initial claim, duplicate identity, refresh, shutdown, verlopen lease en een hervatte oude eigenaar tegen echte etcd. Daarna blijft een afzonderlijke proef van ICE/DTLS/media nodig. Lease-readiness is geen actieve synthetische mediaprobe en rondt voice#7 niet af.

Voor onderhoud blijven de bestaande [drainprocedure](voice-regions/draining-a-region.md) en [voice troubleshooting](voice-regions/troubleshooting.md) gelden. Start geen tweede thuisregiopod met dezelfde hostNetwork-/routeridentiteit als korte route naar HA.
