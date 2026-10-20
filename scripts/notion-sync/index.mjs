#!/usr/bin/env node
// Mirrors the docs repository into the Discordy Notion page tree. Idempotent:
// every database page carries the hidden "Source path" (stable key) and "Content hash" properties,
// so a re-run only touches pages whose source changed, and archives pages whose source is gone.
//
//   NOTION_TOKEN=... node scripts/notion-sync [--dry-run] [--prune-root] [--verbose]
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Notion } from './notion.mjs';
import { convertMarkdown, redactSecrets, rt, richTextPlain } from './md.mjs';
import { collectRows, DB_DEFS, GITHUB_ORG, BRANCH } from './sources.mjs';
import { dashboardBlocks, faqMarkdown, heroText } from './dashboard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT_PAGE = process.env.NOTION_ROOT_PAGE_ID ?? '3fb99f29-12a4-81cb-b018-ebda0f0072e8';
const FAQ_TITLE = 'Where to find X (FAQ)';
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const log = (...a) => console.log(...a);
const sha = (x) => createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 16);
const notionUrl = (id) => `https://www.notion.so/${id.replace(/-/g, '')}`;
const clean = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k.startsWith('__') ? undefined : v)));
const plainProp = (p) => (p?.rich_text ?? p?.title ?? []).map((t) => t.plain_text).join('');

const notion = new Notion(process.env.NOTION_TOKEN, { dryRun: DRY, log: args.has('--verbose') ? log : () => {} });
const stats = { created: 0, updated: 0, unchanged: 0, archived: 0 };
const warnings = [];

// ---------------------------------------------------------------- root and databases
const rootKids = await notion.children(ROOT_PAGE);

if (args.has('--prune-root')) {
  const managedTitles = new Set([...Object.values(DB_DEFS).map((d) => d.title), FAQ_TITLE]);
  for (const b of rootKids) {
    const title = b.child_page?.title ?? b.child_database?.title;
    if (title && managedTitles.has(title)) continue;
    if (b.type === 'callout' && richTextPlain(b.callout.rich_text.map((t) => ({ text: { content: t.plain_text } }))).startsWith('Discordy')) continue;
    log(`prune: ${b.type} ${title ?? ''}`);
    await notion.del(`/blocks/${b.id}`);
    stats.archived++;
  }
}
const kids = args.has('--prune-root') && !DRY ? await notion.children(ROOT_PAGE) : rootKids;

let hero = kids.find((b) => b.type === 'callout' && b.callout.rich_text.map((t) => t.plain_text).join('').startsWith('Discordy'));
if (!hero) {
  log('creating hero callout');
  const made = await notion.append(ROOT_PAGE, [heroBlock()]);
  hero = made[0] ?? { id: 'dry-run-id' };
}
function heroBlock() {
  return { type: 'callout', callout: { rich_text: rt(heroText), icon: { type: 'emoji', emoji: '🎧' }, color: 'blue_background' } };
}

const dbs = {};
for (const [key, def] of Object.entries(DB_DEFS)) {
  let block = kids.find((b) => b.type === 'child_database' && b.child_database.title === def.title);
  let id = block?.id;
  if (!id) {
    log(`creating database ${def.title}`);
    const res = await notion.post('/databases', {
      parent: { type: 'page_id', page_id: ROOT_PAGE },
      is_inline: def.inline,
      icon: { type: 'emoji', emoji: def.icon },
      title: rt(def.title),
      properties: { [def.titleName]: { title: {} }, ...def.schema, 'Source path': { rich_text: {} }, 'Content hash': { rich_text: {} } },
    });
    id = res.id;
  }
  const db = DRY && id === 'dry-run-id' ? { properties: {} } : await notion.get(`/databases/${id}`);
  const want = { ...def.schema, 'Source path': { rich_text: {} }, 'Content hash': { rich_text: {} } };
  if (def.selfRelation) want[def.selfRelation] = { relation: { database_id: id, type: 'single_property', single_property: {} } };
  const missing = Object.fromEntries(Object.entries(want).filter(([k]) => !db.properties[k]));
  const titleProp = Object.entries(db.properties).find(([, v]) => v.type === 'title')?.[0];
  if (titleProp && titleProp !== def.titleName) missing[titleProp] = { name: def.titleName };
  if (Object.keys(missing).length) await notion.patch(`/databases/${id}`, { properties: missing });
  dbs[key] = { id, def };
}

// ---------------------------------------------------------------- pass 1: make sure every row page exists
const rows = await collectRows(ROOT);
const byKey = new Map(rows.map((r) => [r.key, r]));
if (byKey.size !== rows.length) throw new Error('duplicate source keys');

const dbIconTitle = (r) => ({ icon: { type: 'emoji', emoji: r.icon }, properties: { [dbs[r.db].def.titleName]: { title: rt(r.title).slice(0, 1) }, 'Source path': { rich_text: rt(r.key) } } });

for (const [key, { id }] of Object.entries(dbs)) {
  const existing = id === 'dry-run-id' ? [] : await notion.all(`/databases/${id}/query`, {});
  const seen = new Set();
  for (const page of existing) {
    const src = plainProp(page.properties['Source path']);
    const row = src && byKey.get(src);
    if (row && row.db === key && !seen.has(src)) {
      seen.add(src);
      row.pageId = page.id;
      row.hash = plainProp(page.properties['Content hash']);
    } else if (src) {
      log(`archive ${src}`);
      await notion.patch(`/pages/${page.id}`, { archived: true });
      stats.archived++;
    }
  }
  for (const r of rows.filter((x) => x.db === key && !x.pageId)) {
    log(`create ${r.key}`);
    const res = await notion.post('/pages', { parent: { database_id: id }, ...dbIconTitle(r) });
    r.pageId = res.id;
    r.hash = '';
    r.isNew = true;
  }
}

// ---------------------------------------------------------------- link resolution
const exists = (p) => existsSync(path.join(ROOT, p));
const dbLinks = Object.fromEntries(Object.entries(dbs).map(([k, v]) => [`notion-db:${k}`, notionUrl(v.id)]));
const anchorRows = new Map(rows.filter((r) => r.key.startsWith('services/catalog.md#')).map((r) => [r.key.split('#')[1], r]));

function makeResolver(docPath) {
  return (href) => {
    if (!href) return null;
    if (dbLinks[href]) return dbLinks[href];
    if (/^(https?:|mailto:)/.test(href)) return href;
    if (href.startsWith('#')) {
      if (docPath === 'services/catalog.md' && anchorRows.has(href.slice(1))) return notionUrl(anchorRows.get(href.slice(1)).pageId);
      return null;
    }
    const [file, anchor] = href.split('#');
    let target = path.posix.normalize(path.posix.join(path.posix.dirname(docPath), file)).replace(/^\.\//, '');
    if (target.startsWith('..')) return null;
    if (anchor && byKey.has(`${target}#${anchor}`)) return notionUrl(byKey.get(`${target}#${anchor}`).pageId);
    const candidates = [target, `${target.replace(/\/$/, '')}/README.md`];
    for (const c of candidates) if (byKey.has(c) && byKey.get(c).pageId) return notionUrl(byKey.get(c).pageId);
    if (exists(target)) return `${GITHUB_ORG}/docs/blob/${BRANCH}/${target}`;
    return null;
  };
}

// ---------------------------------------------------------------- FAQ page with the synced original
let faq = kids.find((b) => b.type === 'child_page' && b.child_page.title === FAQ_TITLE);
let faqId = faq?.id;
if (!faqId) {
  log('creating FAQ page');
  const res = await notion.post('/pages', { parent: { page_id: ROOT_PAGE }, icon: { type: 'emoji', emoji: '🔎' }, properties: { title: { title: rt(FAQ_TITLE) } } });
  faqId = res.id;
}
const faqBlocks = clean(convertMarkdown(faqMarkdown(), { resolveLink: makeResolver('README.md') }).blocks);
const faqHash = sha(faqBlocks);
let syncedOriginal;
{
  const faqKids = faqId === 'dry-run-id' ? [] : await notion.children(faqId);
  syncedOriginal = faqKids.find((b) => b.type === 'synced_block' && !b.synced_block.synced_from);
  const stamp = faqKids.find((b) => b.type === 'paragraph');
  const oldHash = stamp ? plainProp({ rich_text: stamp.paragraph.rich_text }).replace(/^.*rev /, '') : '';
  if (!syncedOriginal) {
    const made = await notion.append(faqId, [
      { type: 'synced_block', synced_block: { synced_from: null, children: faqBlocks } },
      { type: 'paragraph', paragraph: { rich_text: rt(`Synced from the docs repository, rev ${faqHash}`, { italic: true }) } },
    ]);
    syncedOriginal = made[0] ?? { id: 'dry-run-id' };
    stats.created++;
  } else if (oldHash !== faqHash) {
    await notion.clearChildren(syncedOriginal.id);
    await notion.append(syncedOriginal.id, faqBlocks);
    await notion.patch(`/blocks/${stamp.id}`, { paragraph: { rich_text: rt(`Synced from the docs repository, rev ${faqHash}`, { italic: true }) } });
    stats.updated++;
  } else stats.unchanged++;
}
const syncedDuplicate = () => ({ type: 'synced_block', synced_block: { synced_from: { block_id: syncedOriginal.id } } });

// ---------------------------------------------------------------- pass 2: content and properties
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

async function resolveImages(blocks, docPath) {
  const digests = [];
  const walk = async (list) => {
    for (const b of list) {
      if (b.type === 'image' && b.__src) {
        if (/^https?:/.test(b.__src)) b.image = { type: 'external', external: { url: b.__src } };
        else {
          const file = path.posix.normalize(path.posix.join(path.posix.dirname(docPath), b.__src));
          if (exists(file)) {
            const bytes = await readFile(path.join(ROOT, file));
            b.__digest = sha(bytes.toString('base64'));
            digests.push(b.__digest);
            b.__file = { file, bytes };
          }
        }
      }
      const c = b[b.type]?.children;
      if (c) await walk(c);
    }
  };
  await walk(blocks);
  return digests;
}

async function uploadImages(blocks, docPath) {
  const walk = async (list) => {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.type === 'image' && b.__file) {
        const ext = path.extname(b.__file.file).toLowerCase();
        try {
          const id = await notion.uploadFile(path.basename(b.__file.file), IMAGE_TYPES[ext] ?? 'image/png', b.__file.bytes);
          list[i] = { type: 'image', image: { type: 'file_upload', file_upload: { id }, caption: rt(b.__alt ?? '') } };
        } catch (e) {
          warnings.push(`${docPath}: image ${b.__src} not uploaded (${e.message.slice(0, 120)})`);
          list[i] = { type: 'paragraph', paragraph: { rich_text: rt(b.__alt || b.__src, {}, `${GITHUB_ORG}/docs/blob/${BRANCH}/${b.__file.file}`) } };
        }
      } else if (b.type === 'image' && !b.image) {
        list[i] = { type: 'paragraph', paragraph: { rich_text: rt(b.__alt || b.__src) } };
      }
      const c = list[i][list[i].type]?.children;
      if (c) await walk(c);
    }
  };
  await walk(blocks);
}

const relKeys = (r) => Object.fromEntries(Object.entries(r.rels ?? {}).map(([k, v]) => [k, [...v].sort()]));

for (const r of rows) {
  const warn = [];
  const md = redactSecrets(r.md, r.key, warn);
  warnings.push(...warn);
  const { blocks } = convertMarkdown(md, { resolveLink: makeResolver(r.docPath) });
  if (r.key === 'README.md') blocks.unshift(syncedDuplicate());
  const imageDigests = await resolveImages(blocks, r.docPath);
  const hash = sha([r.title, r.icon, r.props, relKeys(r), blocks, imageDigests, r.key === 'README.md' ? syncedOriginal.id : '']);
  if (hash === r.hash) { stats.unchanged++; continue; }
  log(`${r.isNew ? 'fill  ' : 'update'} ${r.key}`);
  if (!r.isNew && r.pageId !== 'dry-run-id') await notion.clearChildren(r.pageId);
  await uploadImages(blocks, r.docPath);
  if (blocks.length) await notion.append(r.pageId, clean(blocks));
  const relations = {};
  for (const [name, keys] of Object.entries(r.rels ?? {})) relations[name] = { relation: keys.map((k) => ({ id: byKey.get(k).pageId })) };
  await notion.patch(`/pages/${r.pageId}`, {
    icon: { type: 'emoji', emoji: r.icon },
    properties: { ...dbIconTitle(r).properties, ...r.props, ...relations, 'Content hash': { rich_text: rt(hash) } },
  });
  stats[r.isNew ? 'created' : 'updated']++;
}

// ---------------------------------------------------------------- dashboard on the Discordy page
const rowUrl = (key) => notionUrl(byKey.get(key)?.pageId ?? ROOT_PAGE);
const dash = dashboardBlocks({
  rows, dbs, faqUrl: notionUrl(faqId), rowUrl, syncedDuplicate,
  resolve: makeResolver('README.md'),
});
const rev = sha([dash, heroText, syncedOriginal.id, Object.values(dbs).map((d) => d.id)]);
const afterHero = kids.findIndex((b) => b.id === hero.id);
const region = [];
const fresh = args.has('--prune-root') && !DRY ? kids : kids;
for (let i = afterHero + 1; i < fresh.length; i++) {
  if (fresh[i].type === 'child_database' || fresh[i].type === 'child_page') break;
  region.push(fresh[i]);
}
const stampBlock = [...region].reverse().find((b) => b.type === 'callout' && plainProp({ rich_text: b.callout.rich_text }).startsWith('Last synced'));
const oldRev = stampBlock ? /rev (\w+)/.exec(plainProp({ rich_text: stampBlock.callout.rich_text }))?.[1] : null;
const sha1 = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local';
const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
const stampText = `Last synced ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC from docs@${sha1} (${DRY ? 'dry run' : runUrl ? 'CI' : 'manual run'}), rev ${rev}. Edit the Markdown in the docs repository, not these pages: the next sync overwrites changes.`;
const stampBlockDef = () => ({ type: 'callout', callout: { rich_text: rt(stampText), icon: { type: 'emoji', emoji: '⏱️' }, color: 'gray_background' } });

if (oldRev !== rev || !stampBlock) {
  log('dashboard: regenerating');
  for (const b of region) await notion.del(`/blocks/${b.id}`);
  await notion.patch(`/blocks/${hero.id}`, { callout: { rich_text: rt(heroText), icon: { type: 'emoji', emoji: '🎧' }, color: 'blue_background' } });
  await notion.append(ROOT_PAGE, clean([...dash, stampBlockDef()]), hero.id);
  stats.updated++;
} else {
  await notion.patch(`/blocks/${stampBlock.id}`, { callout: { rich_text: rt(stampText) } });
  stats.unchanged++;
}

log(JSON.stringify({ ...stats, requests: notion.requests, writes: notion.writes, rows: rows.length, dryRun: DRY }));
if (warnings.length) console.warn(`warnings:\n- ${warnings.join('\n- ')}`);
log(`Discordy page: ${notionUrl(ROOT_PAGE)}`);
