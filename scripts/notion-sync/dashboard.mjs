// The hand-written parts of the Voics home page: hero, quick links, FAQ and common-task toggles.
import { rt } from './md.mjs';
import { GITHUB_ORG } from './sources.mjs';

export const heroText =
  'Voics is een app voor tekst, spraak, video en servers. Begin met de Nederlandse handleiding voor mobiel of desktop. ' +
  'Productie draait op gen-serv; extra servers zijn alleen voorbereid en back-ups zijn nog een plan. ' +
  'Deze ruimte spiegelt de docsrepo. De statuspagina onderscheidt code, releases en praktijkverificatie.';

// Retain the existing block when migrating its text, and recognize it on later runs.
export const isManagedHero = (block) => block.type === 'callout' && /^(?:Voics|Discordy)\b/.test(
  block.callout.rich_text.map((text) => text.plain_text ?? text.text?.content ?? '').join(''),
);

const link = (text, url) => rt(text, {}, url);
const bullet = (richText) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText } });
const h2 = (t) => ({ type: 'heading_2', heading_2: { rich_text: rt(t) } });
const h3 = (t) => ({ type: 'heading_3', heading_3: { rich_text: rt(t) } });
const para = (richText) => ({ type: 'paragraph', paragraph: { rich_text: richText } });
const numbered = (s) => ({ type: 'numbered_list_item', numbered_list_item: { rich_text: rt(s) } });
const code = (s, language = 'bash') => ({ type: 'code', code: { rich_text: rt(s), language } });
const toggle = (title, children) => ({ type: 'toggle', toggle: { rich_text: rt(title, { bold: true }), children } });
const column = (children) => ({ type: 'column', column: { children } });

export function faqMarkdown() {
  return `## Where to find X

| I want to | Go to |
|---|---|
| De mobiele app gebruiken | [Handleiding iPhone en Android](handbook/14-handleiding-mobiele-app.md) |
| De desktopapp gebruiken | [Handleiding desktop](handbook/15-handleiding-desktop.md) |
| Een tweede server voorbereiden | [Server uitbreiden](runbooks/server-uitbreiden.md) |
| Back-ups en herstel voorbereiden | [Back-upplan](runbooks/backup-restore.md) |
| Weten wat live is en wat nog open staat | [Stand en beheerkeuzes](handbook/16-status-en-beheerkeuzes.md) |
| Understand how Voics works end to end | [How Voics works](handbook/01-how-discordy-works.md) |
| Find my way around one repository | [Applications](handbook/02-apps-overview.md) |
| Log in to Grafana, Headlamp, pgweb, MinIO, OpenBao | [Ops tools & URLs](notion-db:tools) and [Ops access](runbooks/ops-access.md) |
| Unseal OpenBao after a reboot | [OpenBao unseal](runbooks/openbao-unseal.md) |
| Release or deploy something | [Release](runbooks/release.md) |
| Switch the CI runner | [CI/CD and runners](handbook/05-ci-cd-and-runners.md) |
| Rotate a secret or find where one lives | [Secret rotation](runbooks/secret-rotation.md) and [Secrets inventory](secrets/README.md) |
| See ports, env vars, SLOs of a service | [Services](notion-db:services) and [Service catalog](services/catalog.md) |
| Know why we decided something | [ADRs](notion-db:adrs) |
| Read the wire protocols | [Protocols](notion-db:protocols) |
| Read the specs and plans | [Specs & plans](notion-db:specs) |
| See the diagrams | [Architecture (C4)](c4/README.md) |
| Know the working rules and Definition of Done | [Contributing](CONTRIBUTING.md) and [How we work](handbook/03-how-we-work.md) |
| Stand up or rebuild an environment | [Environments](runbooks/environments.md) |
| Look up a term | [Glossary and FAQ](handbook/10-glossary-and-faq.md) |
`;
}

const TOOL_EMOJI = { 'Ops portal': '🧭', Headlamp: '☸️', Grafana: '📈', pgweb: '🐘', 'Scylla web': '🗄️', 'MinIO console': '🪣', 'Redpanda Console': '🐼', 'OpenBao UI': '🔐', 'Admin panel': '🛡️' };
const REPOS = ['api', 'messages', 'gateway', 'voice', 'admin', 'client', 'website', 'gitops', 'docs', 'contracts', '.github', 'bots-sdk'];

export function dashboardBlocks({ rows, dbs, faqUrl, rowUrl, syncedDuplicate }) {
  const tools = rows.filter((r) => r.db === 'tools');
  const quick = tools.map((t) => bullet([...rt(`${TOOL_EMOJI[t.title] ?? '🔧'} `), ...link(t.title, t.props.URL.url)]));
  const project = [
    bullet([...rt('🌐 '), ...link('Website voics.nl', 'https://voics.nl')]),
    bullet([...rt('🐙 '), ...link('GitHub organisation', GITHUB_ORG)]),
    bullet([...rt('📋 '), ...link('Project board', 'https://github.com/orgs/discordy-voics/projects/1')]),
    bullet([...rt('📝 '), ...link('docs repository (source of this space)', `${GITHUB_ORG}/docs`)]),
    h3('Repositories'),
    ...REPOS.map((r) => bullet(link(r, `${GITHUB_ORG}/${r}`))),
  ];
  const handbook = rows.filter((r) => r.db === 'handbook').sort((a, b) => a.props.Order.number - b.props.Order.number || a.title.localeCompare(b.title));
  const tasks = [
    toggle('OpenBao is sealed (it normally unseals itself)', [
      numbered('OpenBao auto-unseals after a restart or reboot (static key, ADR-0021). Only act if the ops portal banner, the webhook or kubectl says Sealed.'),
      numbered('Check the Secret openbao-seal-key exists in voics-system, then from a gitops checkout on the owner PC run the command below (keys come from the DPAPI key store).'),
      code('KUBECONFIG=~/.kube/discordy-gen-serv.yaml KUBECTL=kubectl KEYSTORE=dpapi bash bootstrap/20-openbao.sh'),
      numbered('Wait for "OpenBao auto-unsealed". Check kubectl get clustersecretstore openbao is Valid; restart deploy/external-secrets in voics-system if not.'),
      para([...rt('Full procedure: '), ...link('OpenBao unseal runbook', rowUrl('runbooks/openbao-unseal.md'))]),
    ]),
    toggle('Deploy a release', [
      numbered('Cut release/x.y.z from develop, stabilise, tick the release checklist.'),
      numbered('Merge into main with a merge commit (no squash); release-please tags it.'),
      numbered('Back-merge main into develop. Flux image automation deploys the new image.'),
      numbered('To deploy now without waiting:'),
      code('flux reconcile image repository api -n flux-system\nflux reconcile image update discordy -n flux-system\nflux reconcile kustomization apps -n flux-system --with-source'),
      para([...rt('Full procedure: '), ...link('Release runbook', rowUrl('runbooks/release.md'))]),
    ]),
    toggle('Switch CI runner', [
      numbered('GitHub-hosted ubuntu-latest is the default. The repository variable CI_RUNNER redirects jobs to another runner.'),
      code('cd .github && scripts/pc-runner.sh up      # runner on the owner PC, sets CI_RUNNER=karma-pc\nscripts/pc-runner.sh status\nscripts/pc-runner.sh down    # run before shutting the PC down'),
      para([...rt('More: '), ...link('Release runbook, on-demand runner', rowUrl('runbooks/release.md'))]),
    ]),
    toggle('Rotate a secret', [
      numbered('Generate a new value with the command in the secrets inventory. Never reuse a value.'),
      numbered('gh secret set NAME (piped from stdin) at the right scope.'),
      numbered('Run the secrets-sync workflow in gitops, then force-sync the ExternalSecret.'),
      numbered('Restart the consumers, verify /readyz and the logs, revoke the old value at its source.'),
      para([...rt('Full procedure: '), ...link('Secret rotation', rowUrl('runbooks/secret-rotation.md')), ...rt(' and '), ...link('Secrets inventory', rowUrl('secrets/README.md'))]),
    ]),
    toggle('Add an ops tool (Definition of Done)', [
      numbered('Manifests for the tool, plus HOST_* in cluster-config for every environment.'),
      numbered('Tunnel route, Cloudflare Access host list (bootstrap/40-cloudflare.sh), IP lock.'),
      numbered('Ops portal entry, a row in ops-access.md and the host list in cloudflare-setup.md.'),
      numbered('Credentials into OpenBao and the secrets inventory; no value in git or Notion.'),
      numbered('Merge through a PR with green CI, move the card to Done.'),
      para([...rt('Rules: '), ...link('Contributing', rowUrl('CONTRIBUTING.md')), ...rt(' and '), ...link('Ops access', rowUrl('runbooks/ops-access.md'))]),
    ]),
  ];
  return [
    { type: 'table_of_contents', table_of_contents: {} },
    h2('🧭 Handbook'),
    ...handbook.map((r) => bullet([...link(r.title, rowUrl(r.key)), ...(r.props.Summary.rich_text.length ? rt(`: ${r.props.Summary.rich_text.map((t) => t.text.content).join('')}`) : [])])),
    {
      type: 'column_list',
      column_list: { children: [column([h3('🚀 Quick links (ops)'), ...quick]), column([h3('🔗 Project'), ...project])] },
    },
    h2('🔎 Where to find X'),
    para([...rt('Also as a '), ...link('standalone page', faqUrl), ...rt('.')]),
    syncedDuplicate(),
    h2('🛠️ Common tasks'),
    ...tasks,
    h2('🗂️ Databases'),
    ...Object.values(dbs).map((d) =>
      d.def.inline
        ? bullet([...rt(`${d.def.icon} `), ...link(`${d.def.title} (inline below)`, `https://www.notion.so/${d.id.replace(/-/g, '')}`)])
        : { type: 'link_to_page', link_to_page: { type: 'database_id', database_id: d.id } },
    ),
  ];
}
