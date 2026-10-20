// Minimal Notion REST client: throttled (about 3 requests per second), retries on 429 and 5xx.
const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const MIN_INTERVAL_MS = 350;

export class Notion {
  constructor(token, { dryRun = false, log = () => {} } = {}) {
    if (!token) throw new Error('NOTION_TOKEN is not set');
    this.token = token;
    this.dryRun = dryRun;
    this.log = log;
    this.last = 0;
    this.requests = 0;
    this.writes = 0;
  }

  async #wait() {
    const delta = Date.now() - this.last;
    if (delta < MIN_INTERVAL_MS) await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - delta));
    this.last = Date.now();
  }

  /** Raw request. Mutations are skipped (and a fake result returned) in dry-run mode. */
  async request(method, path, body, { form } = {}) {
    const isWrite = method !== 'GET' && !(method === 'POST' && /\/query$/.test(path));
    if (isWrite && this.dryRun) {
      this.log(`[dry-run] ${method} ${path}`);
      return { object: 'dry-run', id: 'dry-run-id', results: [], has_more: false };
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      await this.#wait();
      this.requests++;
      if (isWrite) this.writes++;
      const headers = { Authorization: `Bearer ${this.token}`, 'Notion-Version': VERSION };
      if (!form) headers['Content-Type'] = 'application/json';
      let res;
      try {
        res = await fetch(`${API}${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
      } catch (err) {
        if (attempt === 7) throw err;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const retry = Number(res.headers.get('retry-after')) || 1 + attempt * 2;
        this.log(`  ${res.status} on ${method} ${path}, retrying in ${retry}s`);
        await new Promise((r) => setTimeout(r, retry * 1000));
        continue;
      }
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(`Notion ${method} ${path} -> ${res.status} ${json.code ?? ''}: ${json.message ?? text}`.slice(0, 600));
      return json;
    }
    throw new Error(`Notion ${method} ${path}: too many retries`);
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  patch(path, body) { return this.request('PATCH', path, body); }
  del(path) { return this.request('DELETE', path); }

  async all(path, body) {
    const out = [];
    let cursor;
    do {
      let res;
      if (body) res = await this.post(path, { ...body, start_cursor: cursor, page_size: 100 });
      else res = await this.get(`${path}${path.includes('?') ? '&' : '?'}page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
      out.push(...res.results);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  children(blockId) { return this.all(`/blocks/${blockId}/children`); }

  /**
   * Append blocks in requests of at most 100 top-level / 900 total blocks.
   * Returns the created top-level blocks; `after` keeps order when inserting in the middle of a page.
   */
  async append(parentId, blocks, after) {
    const count = (b) => 1 + (b[b.type]?.children ?? []).reduce((n, c) => n + count(c), 0);
    const created = [];
    let i = 0;
    while (i < blocks.length) {
      const chunk = [];
      let total = 0;
      while (i < blocks.length && chunk.length < 100 && (chunk.length === 0 || total + count(blocks[i]) <= 900)) {
        total += count(blocks[i]);
        chunk.push(blocks[i++]);
      }
      const res = await this.patch(`/blocks/${parentId}/children`, { children: chunk, ...(after ? { after } : {}) });
      const results = res.results ?? [];
      created.push(...results.slice(0, chunk.length));
      if (after && results.length >= chunk.length) after = results[chunk.length - 1].id;
    }
    return created;
  }

  async clearChildren(blockId, keep = () => false) {
    for (const b of await this.children(blockId)) if (!keep(b)) await this.del(`/blocks/${b.id}`);
  }

  /** Upload a local file through the Notion file upload API; returns the file_upload id. */
  async uploadFile(filename, contentType, bytes) {
    const up = await this.post('/file_uploads', { filename, content_type: contentType });
    if (this.dryRun) return up.id;
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: contentType }), filename);
    await this.request('POST', `/file_uploads/${up.id}/send`, undefined, { form });
    return up.id;
  }
}
