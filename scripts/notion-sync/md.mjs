// Markdown -> Notion blocks. Handles the subset the docs repo uses:
// headings, paragraphs, inline code/bold/italic/strike/links, nested bullet/numbered/task lists,
// tables, fenced code, blockquotes (as callouts), images, horizontal rules.

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:ntn|secret)_[A-Za-z0-9]{30,}/,
  /\bey[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
  /(?:token|secret|password|passwd|api[_-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9+/_-]{24,}={0,2}["']?\s*$/i,
];

export function redactSecrets(md, path, warnings) {
  return md
    .split('\n')
    .map((line, i) => {
      if (SECRET_PATTERNS.some((re) => re.test(line))) {
        warnings.push(`${path}:${i + 1} looks like a secret, line withheld from Notion`);
        return '[line withheld by notion-sync: looks like a secret]';
      }
      return line;
    })
    .join('\n');
}

const CODE_LANGS = {
  sh: 'bash', bash: 'bash', shell: 'shell', zsh: 'bash', console: 'shell', ps1: 'powershell', powershell: 'powershell',
  yaml: 'yaml', yml: 'yaml', json: 'json', jsonc: 'json', rust: 'rust', rs: 'rust', elixir: 'elixir', ex: 'elixir', exs: 'elixir',
  typescript: 'typescript', ts: 'typescript', tsx: 'typescript', javascript: 'javascript', js: 'javascript', mjs: 'javascript',
  sql: 'sql', cql: 'sql', toml: 'toml', mermaid: 'mermaid', dockerfile: 'docker', docker: 'docker', hcl: 'hcl', terraform: 'hcl',
  proto: 'protobuf', protobuf: 'protobuf', diff: 'diff', html: 'html', css: 'css', python: 'python', py: 'python', go: 'go',
  markdown: 'markdown', md: 'markdown', makefile: 'makefile', xml: 'xml', graphql: 'graphql', c: 'c', cpp: 'c++',
};

export function codeLanguage(lang) {
  return CODE_LANGS[(lang || '').toLowerCase()] ?? 'plain text';
}

const chunkText = (s, n = 2000) => {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.length ? out : [''];
};

export const rt = (content, ann = {}, link = null) =>
  chunkText(content).map((c) => ({
    type: 'text',
    text: { content: c, link: link ? { url: link } : null },
    annotations: { bold: !!ann.bold, italic: !!ann.italic, strikethrough: !!ann.strike, underline: false, code: !!ann.code, color: 'default' },
  }));

const PUNCT = /[\\`*_{}[\]()#+\-.!|~<>]/;

function findClose(text, from, open, close) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '`') { const e = text.indexOf('`', i + 1); if (e > 0) { i = e; continue; } }
    if (text[i] === open) depth++;
    else if (text[i] === close) { if (depth === 0) return i; depth--; }
  }
  return -1;
}

export function inline(text, ctx, ann = {}, link = null) {
  const out = [];
  let plain = '';
  const flush = () => { if (plain) { out.push(...rt(plain, ann, link)); plain = ''; } };
  const resolve = (href) => (link ? link : ctx.resolveLink(href));
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length && PUNCT.test(text[i + 1])) { plain += text[++i]; continue; }
    if (ch === '`') {
      let n = 1;
      while (text[i + n] === '`') n++;
      const fence = '`'.repeat(n);
      const end = text.indexOf(fence, i + n);
      if (end > 0) {
        flush();
        let code = text.slice(i + n, end);
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        out.push(...rt(code, { ...ann, code: true }, link));
        i = end + n - 1;
        continue;
      }
    }
    if (ch === '!' && text[i + 1] === '[') {
      const close = findClose(text, i + 2, '[', ']');
      if (close > 0 && text[close + 1] === '(') {
        const pe = findClose(text, close + 2, '(', ')');
        if (pe > 0) {
          flush();
          const alt = text.slice(i + 2, close) || 'image';
          const href = text.slice(close + 2, pe).trim().split(/\s+/)[0];
          out.push(...rt(alt, ann, resolve(href)));
          i = pe;
          continue;
        }
      }
    }
    if (ch === '[') {
      const close = findClose(text, i + 1, '[', ']');
      if (close > 0 && text[close + 1] === '(') {
        const pe = findClose(text, close + 2, '(', ')');
        if (pe > 0) {
          flush();
          const href = text.slice(close + 2, pe).trim().replace(/^<|>$/g, '').split(/\s+"/)[0];
          const url = resolve(href);
          out.push(...inline(text.slice(i + 1, close), ctx, ann, url));
          i = pe;
          continue;
        }
      }
    }
    if (ch === '<') {
      const rest = text.slice(i);
      const auto = /^<(https?:\/\/[^>\s]+)>/.exec(rest);
      if (auto) { flush(); out.push(...rt(auto[1], ann, link ?? auto[1])); i += auto[0].length - 1; continue; }
      const br = /^<br\s*\/?>/i.exec(rest);
      if (br) { plain += '\n'; i += br[0].length - 1; continue; }
      const tag = /^<\/?[a-zA-Z][^>]*>/.exec(rest);
      if (tag) { i += tag[0].length - 1; continue; }
    }
    if ((ch === '*' || ch === '_') && text[i + 1] === ch) {
      const end = text.indexOf(ch + ch, i + 2);
      if (end > i + 2 && !/\s/.test(text[i + 2]) && (ch === '*' || !/\w/.test(text[i - 1] ?? ' '))) {
        flush();
        out.push(...inline(text.slice(i + 2, end), ctx, { ...ann, bold: true }, link));
        i = end + 1;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && text[i + 1] && !/\s/.test(text[i + 1]) && text[i + 1] !== ch) {
      const boundaryOk = ch === '*' || !/\w/.test(text[i - 1] ?? ' ');
      let end = -1;
      if (boundaryOk) {
        for (let j = i + 1; j < text.length; j++) {
          if (text[j] === '\\') { j++; continue; }
          if (text[j] === '`') { const e = text.indexOf('`', j + 1); if (e > 0) { j = e; continue; } }
          if (text[j] === ch && text[j - 1] !== ' ' && (ch === '*' || !/\w/.test(text[j + 1] ?? ' '))) { end = j; break; }
        }
      }
      if (end > 0) {
        flush();
        out.push(...inline(text.slice(i + 1, end), ctx, { ...ann, italic: true }, link));
        i = end;
        continue;
      }
    }
    if (ch === '~' && text[i + 1] === '~') {
      const end = text.indexOf('~~', i + 2);
      if (end > 0) { flush(); out.push(...inline(text.slice(i + 2, end), ctx, { ...ann, strike: true }, link)); i = end + 1; continue; }
    }
    if (ch === 'h' && !link && /^https?:\/\//.test(text.slice(i, i + 8)) && !/\w/.test(text[i - 1] ?? ' ')) {
      const m = /^https?:\/\/[^\s<>]+/.exec(text.slice(i));
      const url = m[0].replace(/[.,;:!?)\]]+$/, '');
      flush();
      out.push(...rt(url, ann, url));
      i += url.length - 1;
      continue;
    }
    plain += ch;
  }
  flush();
  return out;
}

const plainOf = (richText) => richText.map((r) => r.text.content).join('');

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LI = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '`') { const e = s.indexOf('`', i + 1); if (e > 0) { cur += s.slice(i, e + 1); i = e; continue; } }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/** Split a table row into trimmed cells (exported for the extractors). */
export const tableCells = splitRow;

export function calloutIcon(text) {
  const alert = /^\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]/i.exec(text);
  if (alert) return { NOTE: 'ℹ️', TIP: '💡', WARNING: '⚠️', IMPORTANT: '❗', CAUTION: '🚨' }[alert[1].toUpperCase()];
  const t = text.slice(0, 140).toLowerCase();
  if (/(^|\W)(warning|caution|danger|never|do not|don't)(\W|$)/.test(t)) return '⚠️';
  if (/(^|\W)(tip|hint|prefer)(\W|$)/.test(t)) return '💡';
  if (/(^|\W)(status|note|source of truth)(\W|$)/.test(t)) return 'ℹ️';
  return '📝';
}

const isBlockStart = (line) =>
  FENCE.test(line) || /^\s{0,3}#{1,6}\s/.test(line) || /^\s*>/.test(line) || LI.test(line) || HR.test(line);

const indentOf = (l) => l.length - l.trimStart().length;

export function parseBlocks(lines, ctx) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*<!--/.test(line)) {
      while (i < lines.length && !lines[i].includes('-->')) i++;
      i++;
      continue;
    }
    if (/^\s*<a id=.*<\/a>\s*$/.test(line) || /^\s*<\/?(details|summary|div|p)[^>]*>\s*$/.test(line)) { i++; continue; }
    let m = FENCE.exec(line);
    if (m) {
      const [, indent, fence, lang] = m;
      const body = [];
      const closing = new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`);
      i++;
      while (i < lines.length && !closing.test(lines[i])) {
        body.push(lines[i].startsWith(indent) ? lines[i].slice(indent.length) : lines[i].trimStart());
        i++;
      }
      i++;
      blocks.push({ type: 'code', code: { rich_text: rt(body.join('\n')), language: codeLanguage(lang) } });
      continue;
    }
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      const level = Math.min(m[1].length, 3);
      blocks.push({ type: `heading_${level}`, [`heading_${level}`]: { rich_text: inline(m[2], ctx) }, __level: m[1].length });
      i++;
      continue;
    }
    if (HR.test(line)) { blocks.push({ type: 'divider', divider: {} }); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = splitRow(line);
      const width = header.length;
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { body.push(splitRow(lines[i])); i++; }
      const MAX_BODY = 98;
      for (let r = 0; r === 0 || r < body.length; r += MAX_BODY) {
        const rows = [header, ...body.slice(r, r + MAX_BODY)];
        blocks.push({
          type: 'table',
          table: {
            table_width: width,
            has_column_header: true,
            has_row_header: false,
            children: rows.map((cells) => ({
              type: 'table_row',
              table_row: { cells: Array.from({ length: width }, (_, c) => inline(cells[c] ?? '', ctx)) },
            })),
          },
        });
      }
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { body.push(lines[i].replace(/^\s*> ?/, '')); i++; }
      const icon = calloutIcon(body.join('\n'));
      let inner = body;
      if (/^\s*\[!\w+\]\s*$/.test(body[0])) inner = body.slice(1);
      else inner = body.map((l, idx) => (idx === 0 ? l.replace(/^\s*\[!\w+\]\s*/, '') : l));
      const kids = parseBlocks(inner, ctx);
      let richText = rt('');
      if (kids[0]?.type === 'paragraph') richText = kids.shift().paragraph.rich_text;
      blocks.push({
        type: 'callout',
        callout: {
          rich_text: richText,
          icon: { type: 'emoji', emoji: icon },
          color: icon === '⚠️' || icon === '🚨' ? 'yellow_background' : 'gray_background',
          ...(kids.length ? { children: kids } : {}),
        },
      });
      continue;
    }
    if ((m = LI.exec(line))) {
      const baseIndent = m[1].length;
      while (i < lines.length) {
        const lm = LI.exec(lines[i]);
        if (!lm || lm[1].length !== baseIndent) {
          let j = i;
          while (j < lines.length && !lines[j].trim()) j++;
          const nm = j > i ? LI.exec(lines[j] ?? '') : null;
          if (nm && nm[1].length === baseIndent) { i = j; continue; }
          break;
        }
        const ordered = /\d/.test(lm[2]);
        let text = lm[3];
        const contentIndent = baseIndent + lm[2].length + 1;
        const cont = [];
        i++;
        while (i < lines.length) {
          const l = lines[i];
          if (!l.trim()) {
            let j = i;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length && indentOf(lines[j]) > baseIndent) { cont.push(''); i++; continue; }
            break;
          }
          const ind = indentOf(l);
          if (ind > baseIndent) { cont.push(l.slice(Math.min(ind, contentIndent))); i++; continue; }
          if (ind === baseIndent && LI.test(l)) break;
          if (!isBlockStart(l) && !cont.length) { text += ' ' + l.trim(); i++; continue; }
          break;
        }
        let todo = null;
        const tm = /^\[( |x|X)\]\s+(.*)$/.exec(text);
        if (tm) { todo = tm[1] !== ' '; text = tm[2]; }
        const kids = parseBlocks(cont, ctx);
        let richText = inline(text, ctx);
        if (kids[0]?.type === 'paragraph') richText = richText.concat(rt(' '), kids.shift().paragraph.rich_text);
        const type = todo !== null ? 'to_do' : ordered ? 'numbered_list_item' : 'bulleted_list_item';
        blocks.push({ type, [type]: { rich_text: richText, ...(todo !== null ? { checked: todo } : {}), ...(kids.length ? { children: kids } : {}) } });
      }
      continue;
    }
    if ((m = /^\s*!\[([^\]]*)\]\(([^)\s]+)[^)]*\)\s*$/.exec(line))) {
      blocks.push({ type: 'image', __src: m[2], __alt: m[1] });
      i++;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && (isBlockStart(lines[i]) || /^\s*<!--/.test(lines[i])))) {
      if (para.length && lines[i].includes('|') && TABLE_SEP.test(lines[i + 1] ?? '')) break;
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'paragraph', paragraph: { rich_text: inline(para.join(' '), ctx) } });
  }
  return blocks;
}

const kidsOf = (b) => b[b.type]?.children;

/** Notion accepts two levels of nesting below a top-level block in one request; hoist anything deeper. */
export function clampDepth(blocks, depth = 0) {
  return blocks.flatMap((b) => {
    if (b.type === 'table' && depth >= 2) {
      const flat = b.table.children.map((r) => r.table_row.cells.map(plainOf).join(' | ')).join('\n');
      return [{ type: 'paragraph', paragraph: { rich_text: rt(flat) } }];
    }
    const kids = kidsOf(b);
    if (!kids || b.type === 'table') return [b];
    if (depth < 2) {
      b[b.type].children = clampDepth(kids, depth + 1);
      return [b];
    }
    delete b[b.type].children;
    return [b, ...clampDepth(kids, depth)];
  });
}

export function convertMarkdown(md, ctx) {
  const blocks = parseBlocks(md.replace(/\r\n/g, '\n').split('\n'), ctx);
  let title = null;
  if (blocks[0]?.__level === 1) title = plainOf(blocks.shift().heading_1.rich_text);
  return { title, blocks: clampDepth(blocks) };
}

export const richTextPlain = plainOf;
export const text = (s, link) => rt(s, {}, link);
