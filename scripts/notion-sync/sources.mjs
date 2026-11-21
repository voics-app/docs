// Reads the docs repository and turns it into "rows": one per Notion database page.
// A row is { db, key, title, icon, props, rels, md, docPath }.
// `key` is the stable identity stored in the hidden "Source path" property.
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tableCells, rt } from './md.mjs';

export const GITHUB_ORG = 'https://github.com/voics-app';
export const BRANCH = 'main';

export const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9 _-]/g, '').trim().replace(/ /g, '-');

const stripMd = (s) =>
  s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<(https?:[^>]+)>/g, '$1').replace(/[`*]/g, '').replace(/\\\|/g, '|').trim();

async function walk(dir, root) {
  const out = [];
  for (const e of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(rel, root)));
    else if (e.name.endsWith('.md')) out.push(rel);
  }
  return out.sort();
}

function gitDate(root, file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { cwd: root, encoding: 'utf8' }).trim();
    if (out) return out.slice(0, 10);
  } catch { /* not a git checkout */ }
  return null;
}

const h1 = (md) => /^#\s+(.+)$/m.exec(md)?.[1].trim();

/** Rows of a 2-column "| key | value |" table (the service catalog style). */
function kvTable(lines) {
  const kv = {};
  for (const l of lines) {
    if (!l.startsWith('|') || /^\|\s*-/.test(l)) continue;
    const [k, ...v] = tableCells(l);
    if (k) kv[k] = v.join(' | ');
  }
  return kv;
}

function tableAfter(md, headingRe) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => headingRe.test(l));
  const rows = [];
  let seen = false;
  for (let i = lines[start]?.startsWith("|") ? start : start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('|')) { seen = true; rows.push(tableCells(lines[i])); }
    else if (seen) break;
  }
  return rows.filter((r) => !/^:?-{2,}/.test(r[0])).slice(1);
}

const prop = {
  title: (s) => ({ title: rt(s).slice(0, 100) }),
  text: (s) => ({ rich_text: s ? rt(s).slice(0, 100) : [] }),
  select: (s) => ({ select: s ? { name: s.replace(/,/g, ' ').slice(0, 100) } : null }),
  multi: (a) => ({ multi_select: a.map((name) => ({ name })) }),
  url: (u) => ({ url: u || null }),
  date: (d) => ({ date: d ? { start: d } : null }),
  number: (n) => ({ number: n }),
};

const RUNBOOK_AREA = {
  'openbao-unseal': 'Secrets', 'secret-rotation': 'Secrets', release: 'CI/CD', environments: 'Infrastructure',
  'cloudflare-setup': 'Networking', 'ops-access': 'Access', 'backup-restore': 'Data', 'scylla-maintenance': 'Data',
  'local-development': 'Development',
};

export const DB_DEFS = {
  handbook: { title: 'Handbook', icon: '🧭', inline: true, titleName: 'Title',
    schema: { Section: { select: {} }, Order: { number: { format: 'number' } }, Summary: { rich_text: {} }, 'Last updated': { date: {} }, GitHub: { url: {} } } },
  guides: { title: 'Guides & references', icon: '📚', inline: false, titleName: 'Title',
    schema: { Category: { select: {} }, 'Last updated': { date: {} }, GitHub: { url: {} } } },
  runbooks: { title: 'Runbooks', icon: '📘', inline: true, titleName: 'Title',
    schema: { Area: { select: {} }, 'When to use': { rich_text: {} }, 'Last updated': { date: {} }, GitHub: { url: {} } } },
  adrs: { title: 'ADRs', icon: '⚖️', inline: true, titleName: 'Title',
    schema: { Number: { number: { format: 'number' } }, Status: { select: {} }, Date: { date: {} }, GitHub: { url: {} } }, selfRelation: 'Supersedes' },
  services: { title: 'Services', icon: '🧩', inline: true, titleName: 'Name',
    schema: { Kind: { select: {} }, 'Repo URL': { url: {} }, Language: { select: {} }, Ports: { rich_text: {} }, 'Health/metrics': { rich_text: {} }, 'Owner area': { select: {} } }, selfRelation: 'Depends on' },
  tools: { title: 'Ops tools & URLs', icon: '🛠️', inline: true, titleName: 'Tool',
    schema: { URL: { url: {} }, 'Login method': { rich_text: {} }, Rights: { select: {} }, 'Protected by': { multi_select: {} } } },
  envs: { title: 'Environments', icon: '🌍', inline: true, titleName: 'Environment',
    schema: { Hosts: { rich_text: {} }, 'Flux path': { rich_text: {} }, Status: { select: {} }, Where: { rich_text: {} }, Secrets: { rich_text: {} } } },
  specs: { title: 'Specs & plans', icon: '🗺️', inline: false, titleName: 'Title',
    schema: { Type: { select: {} }, Date: { date: {} }, Status: { rich_text: {} }, GitHub: { url: {} } } },
  protocols: { title: 'Protocols', icon: '📡', inline: false, titleName: 'Title',
    schema: { Covers: { rich_text: {} }, 'Last updated': { date: {} }, GitHub: { url: {} } } },
};

const ghUrl = (p) => `${GITHUB_ORG}/docs/blob/${BRANCH}/${p}`;

const GUIDES = [
  ['README.md', 'Overview', '🏠', 'Overview'],
  ['CONTRIBUTING.md', 'Contributing & Definition of Done', '🤝', 'Contributing'],
  ['c4/README.md', 'Architecture (C4)', '🏗️', 'Architecture'],
  ['services/catalog.md', 'Service catalog', '🧩', 'Reference'],
  ['secrets/README.md', 'Secrets inventory', '🔐', 'Reference'],
  ['runbooks/README.md', 'Runbooks index', '📘', 'Index'],
  ['adr/README.md', 'ADR index', '⚖️', 'Index'],
  ['protocols/README.md', 'Protocols index', '📡', 'Index'],
  ['CHANGELOG.md', 'Changelog', '📜', 'Changelog'],
];

const C4_DIAGRAMS = [
  ['C1 System context', 'structurizr-C1-SystemContext'],
  ['C2 Containers', 'structurizr-C2-Containers'],
  ['Deployment on gen-serv (production)', 'structurizr-Deployment-gen-serv'],
];

export async function collectRows(root) {
  const read = (p) => readFile(path.join(root, p), 'utf8');
  const rows = [];
  const date = (p) => gitDate(root, p);

  // Guides and references
  for (const [p, title, icon, category] of GUIDES) {
    let md = await read(p);
    if (p === 'c4/README.md') {
      md += `\n\n## Diagrams\n\n${C4_DIAGRAMS.map(([alt, f]) => `### ${alt}\n\n![${alt}](rendered/${f}.png)`).join('\n\n')}\n`;
    }
    rows.push({ db: 'guides', key: p, title, icon, md, docPath: p,
      props: { Category: prop.select(category), 'Last updated': prop.date(date(p)), GitHub: prop.url(ghUrl(p)) } });
  }

  // Handbook (handbook/NN-name.md, optional "Summary:" line after the title)
  try {
    for (const p of await walk('handbook', root)) {
      const md = await read(p);
      const base = path.basename(p);
      const order = Number(/^(\d+)/.exec(base)?.[1] ?? 99);
      const isApp = /^\d+-app-/.test(base);
      const section = isApp || order === 2 ? 'Applications' : order === 1 ? 'Start here' : order <= 5 ? 'How we work' : order <= 9 ? 'Platform' : 'Reference';
      const summary = /^Summary:\s*(.+)$/m.exec(md)?.[1] ?? '';
      rows.push({ db: 'handbook', key: p, title: h1(md) ?? path.basename(p, '.md'), icon: isApp ? '📦' : '🧭', md: md.replace(/^Summary:.*$/m, ''), docPath: p,
        props: { Section: prop.select(section), Order: prop.number(order), Summary: prop.text(stripMd(summary)), 'Last updated': prop.date(date(p)), GitHub: prop.url(ghUrl(p)) } });
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }

  // Runbooks
  const rbIndex = {};
  for (const [name, desc] of tableAfter(await read('runbooks/README.md'), /^\| Runbook/)) {
    const m = /\]\(([^)]+)\)/.exec(name);
    if (m) rbIndex[m[1]] = stripMd(desc);
  }
  for (const p of (await walk('runbooks', root)).filter((f) => f !== 'runbooks/README.md')) {
    const md = await read(p);
    const base = path.basename(p, '.md');
    const rel = p.slice('runbooks/'.length);
    const area = p.includes('voice-regions') ? 'Voice' : RUNBOOK_AREA[base] ?? 'Operations';
    rows.push({ db: 'runbooks', key: p, title: h1(md) ?? base, icon: p.includes('voice-regions') ? '🎙️' : '📘', md, docPath: p,
      props: { Area: prop.select(area), 'When to use': prop.text(rbIndex[rel] ?? ''), 'Last updated': prop.date(date(p)), GitHub: prop.url(ghUrl(p)) } });
  }

  // ADRs
  const adrFiles = (await walk('adr', root)).filter((f) => /\/\d{4}-.+\.md$/.test(f) && !f.includes('0000-template'));
  for (const p of adrFiles) {
    const md = await read(p);
    const num = Number(path.basename(p).slice(0, 4));
    const head = md.split('\n').slice(0, 14).join('\n');
    const rawStatus = /^- Status:\s*(.+)$/im.exec(head)?.[1] ?? '';
    const status = ['superseded', 'deferred', 'rejected', 'deprecated', 'proposed', 'accepted'].find((s) => rawStatus.toLowerCase().includes(s)) ?? 'proposed';
    const sup = [...head.matchAll(/supersedes\s+(?:ADR[- ]?)?(\d{4})/gi)].map((m) => adrFiles.find((f) => path.basename(f).startsWith(m[1]))).filter(Boolean);
    rows.push({ db: 'adrs', key: p, title: (h1(md) ?? p).replace(/^\d{4}\s*[—-]\s*/, ''), icon: '⚖️', md, docPath: p, rels: { Supersedes: sup },
      props: { Number: prop.number(num), Status: prop.select(status), Date: prop.date(/^- Date:\s*(\d{4}-\d{2}-\d{2})/im.exec(head)?.[1] ?? date(p)), GitHub: prop.url(ghUrl(p)) } });
  }

  // Specs, plans, research
  for (const [dir, type, icon] of [['specs', 'Spec', '📐'], ['plans', 'Plan', '🗺️'], ['research', 'Research', '🔬']]) {
    for (const p of await walk(dir, root)) {
      const md = await read(p);
      const status = /^(?:Status|\*\*Status\*\*):\s*(.+)$/im.exec(md.split('\n').slice(0, 12).join('\n'))?.[1];
      rows.push({ db: 'specs', key: p, title: h1(md) ?? path.basename(p, '.md'), icon, md, docPath: p,
        props: { Type: prop.select(p.endsWith('AGENT-BRIEF.md') ? 'Brief' : type), Date: prop.date(/^(\d{4}-\d{2}-\d{2})/.exec(path.basename(p))?.[1] ?? date(p)),
          Status: prop.text(status ? stripMd(status).slice(0, 180) : ''), GitHub: prop.url(ghUrl(p)) } });
    }
  }

  // Protocols
  const covers = {};
  for (const [name, desc] of tableAfter(await read('protocols/README.md'), /^\| Reference/)) {
    const m = /\]\(([^)]+)\)/.exec(name);
    if (m) covers[m[1]] = stripMd(desc);
  }
  for (const p of (await walk('protocols', root)).filter((f) => f !== 'protocols/README.md')) {
    const md = await read(p);
    rows.push({ db: 'protocols', key: p, title: h1(md) ?? path.basename(p, '.md'), icon: '📡', md, docPath: p,
      props: { Covers: prop.text(covers[path.basename(p)] ?? ''), 'Last updated': prop.date(date(p)), GitHub: prop.url(ghUrl(p)) } });
  }

  rows.push(...(await serviceRows(read('services/catalog.md'), date('services/catalog.md'))));
  rows.push(...toolRows(await read('runbooks/ops-access.md')));
  rows.push(...envRows(await read('runbooks/environments.md')));
  return rows;
}

const OWNER_AREA = { api: 'Backend', messages: 'Backend', gateway: 'Realtime', 'voice-signaling': 'Voice', sfu: 'Voice',
  'admin-bff / admin-web': 'Admin', 'Desktop client': 'Client', 'bots-sdk': 'SDK', contracts: 'Platform' };
const BACKEND = new Set(['api', 'messages', 'gateway', 'voice-signaling', 'sfu', 'admin-bff / admin-web']);
const EDGE = new Set(['coturn', 'cloudflared', 'ingress-nginx']);

function language(tech) {
  if (/rust/i.test(tech)) return 'Rust';
  if (/elixir/i.test(tech)) return 'Elixir';
  if (/typescript|electron|react|node/i.test(tech)) return 'TypeScript';
  return tech ? 'Other' : '';
}

async function serviceRows(catalogPromise) {
  const md = await catalogPromise;
  const lines = md.split('\n');
  const sections = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^## (.+)$/.exec(lines[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !/^## /.test(lines[j])) j++;
    sections.push({ name: m[1].trim(), body: lines.slice(i + 1, j) });
    i = j - 1;
  }
  const rows = [];
  for (const s of sections.filter((x) => x.body.some((l) => /^\| Repo \/ /.test(l)))) {
    const kv = kvTable(s.body);
    const repoName = /voics-app\/([\w.-]+)/.exec(kv['Repo / image'] ?? kv['Repo / artefact'] ?? '')?.[1];
    rows.push({ db: 'services', key: `services/catalog.md#${slug(s.name)}`, title: s.name, icon: BACKEND.has(s.name) ? '⚙️' : s.name === 'Desktop client' ? '🖥️' : '📦',
      md: s.body.join('\n').trim(), docPath: 'services/catalog.md', dependsText: kv['Depends on'] ?? '', norm: s.name.toLowerCase(),
      props: { Kind: prop.select(BACKEND.has(s.name) ? 'Service' : s.name === 'Desktop client' ? 'Client' : 'Library'),
        'Repo URL': prop.url(repoName ? `${GITHUB_ORG}/${repoName}` : ''), Language: prop.select(language(kv.Tech ?? '')),
        Ports: prop.text(stripMd(kv.Ports ?? '')), 'Health/metrics': prop.text(BACKEND.has(s.name) ? 'GET /healthz, /readyz, /metrics' : ''),
        'Owner area': prop.select(OWNER_AREA[s.name] ?? 'Platform') } });
  }
  const infra = tableAfter(md, /^## Infrastructure components/);
  for (const [component, ns, ports, usedBy, runbook] of infra) {
    const name = stripMd(component);
    const clean = name.replace(/\s*\(.*\)$/, '').replace(/\s+[\d.]+$/, '').replace(/\s*\(developer mode\)/, '');
    const area = EDGE.has(clean.toLowerCase()) ? 'Edge' : /voics-data/.test(ns) ? 'Data' : /observability/.test(ns) ? 'Observability' : 'Platform';
    const body = `| | |\n|---|---|\n| Component | ${component} |\n| Namespace | ${ns} |\n| Ports | ${ports} |\n| Used by | ${usedBy} |\n| Runbook | ${runbook} |\n\nSee the [service catalog](services/catalog.md#infrastructure-components).`;
    rows.push({ db: 'services', key: `services/catalog.md#infra-${slug(clean)}`, title: clean, icon: '🏗️', md: body, docPath: 'services/catalog.md', dependsText: '', norm: clean.toLowerCase(),
      props: { Kind: prop.select('Infrastructure'), 'Repo URL': prop.url(''), Language: prop.select('Infra'), Ports: prop.text(stripMd(ports)), 'Health/metrics': prop.text(''), 'Owner area': prop.select(area) } });
  }
  // Depends-on relations by name
  for (const r of rows) {
    const text = r.dependsText.toLowerCase();
    r.rels = { 'Depends on': rows.filter((o) => o !== r && o.dependsText !== undefined && new RegExp(`(^|[^\\w-])${o.norm.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}($|[^\\w-])`).test(text)).map((o) => o.key) };
  }
  return rows;
}

function toolRows(md) {
  const rows = [];
  for (const [tool, urlCell, login, rights] of tableAfter(md, /^## Tools/)) {
    const name = stripMd(tool).replace(/\s*\(.*\)$/, '');
    const url = /https?:\/\/[^\s>)]+/.exec(urlCell)?.[0] ?? '';
    const loginText = stripMd(login);
    const rightsText = stripMd(rights).toLowerCase();
    const label = rightsText.includes('cluster-admin') ? 'cluster-admin' : rightsText.includes('superuser') ? 'superuser' : rightsText.includes('platform admin') ? 'platform admin'
      : rightsText.includes('root') ? 'root' : rightsText.includes('read/write') ? 'read/write' : rightsText.includes('full') ? 'full' : rightsText.includes('admin') ? 'admin' : 'none';
    const protectedBy = ['IP lock', 'Cloudflare Access'];
    if (!/^none/i.test(loginText)) protectedBy.push('Tool login');
    if (name === 'Admin panel') protectedBy.push('Admin allow-list');
    const body = `| | |\n|---|---|\n| Tool | ${tool} |\n| URL | <${url}> |\n| Login after Access | ${login} |\n| Rights | ${rights} |\n\n> Every operator host sits behind two gates: the IP lock (only the owner's public IP) and Cloudflare Access (owner email plus a one-time PIN, valid one week). See [Ops access](runbooks/ops-access.md) for where the credentials are kept.`;
    rows.push({ db: 'tools', key: `runbooks/ops-access.md#tool-${slug(name)}`, title: name, icon: '🛠️', md: body, docPath: 'runbooks/ops-access.md',
      props: { URL: prop.url(url), 'Login method': prop.text(loginText), Rights: prop.select(label), 'Protected by': prop.multi(protectedBy) } });
  }
  return rows;
}

function envRows(md) {
  const rows = [];
  const table = tableAfter(md, /^\| Environment/);
  // tableAfter skips the header; the heading regex above matches the header line itself
  for (const [env, where, flux, hosts, secrets, status] of table) {
    const name = stripMd(env);
    const state = /^live/i.test(stripMd(status)) ? 'live' : /^defined/i.test(stripMd(status)) ? 'defined' : stripMd(status).split(',')[0];
    const body = `| | |\n|---|---|\n| Environment | ${env} |\n| Where | ${where} |\n| Flux watches | ${flux} |\n| Hostnames | ${hosts} |\n| Secrets | ${secrets} |\n| Status | ${status} |\n\nSee [Environments](runbooks/environments.md) for provisioning, dev/test and disaster recovery.`;
    rows.push({ db: 'envs', key: `runbooks/environments.md#env-${slug(name.split(' ')[0])}`, title: name, icon: state === 'live' ? '🟢' : '🟡', md: body, docPath: 'runbooks/environments.md',
      props: { Hosts: prop.text(stripMd(hosts)), 'Flux path': prop.text(stripMd(flux)), Status: prop.select(state), Where: prop.text(stripMd(where)), Secrets: prop.text(stripMd(secrets)) } });
  }
  const body = '| | |\n|---|---|\n| Environment | `local` |\n| Where | the workstation, Docker Compose |\n| Start | `./dev.sh` in `gitops/local` |\n| Secrets | `.env` and JWT keys generated by `dev.sh`, never committed |\n\nSee [Local development](runbooks/local-development.md).';
  rows.push({ db: 'envs', key: 'runbooks/local-development.md#env-local', title: 'local (workstation)', icon: '💻', md: body, docPath: 'runbooks/local-development.md',
    props: { Hosts: prop.text('localhost, ports picked on first run'), 'Flux path': prop.text('gitops/local (Docker Compose, no Flux)'), Status: prop.select('local'), Where: prop.text('developer workstation'), Secrets: prop.text('.env generated by dev.sh, never committed') } });
  return rows;
}

export const propHelpers = prop;
export const stripMarkdown = stripMd;
