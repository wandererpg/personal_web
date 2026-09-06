const { randomUUID } = require('node:crypto');
const { mkdir, readFile, readdir, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const {
  contentError,
  validateDraftId,
  validateModule,
  validateSlug,
  validateTags
} = require('./content-model.js');

function text(value, maximum, code) {
  if (typeof value !== 'string' || value.length > maximum) throw contentError(code);
  return value;
}

async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file);
}

function createDraftStore({ dataDir, now = () => new Date().toISOString() }) {
  const root = path.join(dataDir, 'drafts');
  const fileFor = id => path.join(root, `${validateDraftId(id)}.json`);

  async function ensureRoot() {
    await mkdir(root, { recursive: true, mode: 0o700 });
  }

  async function create(input = {}) {
    await ensureRoot();
    const stamp = now();
    const slug = input.slug ? validateSlug(input.slug) : '';
    const sourceSlug = input.sourceSlug ? validateSlug(input.sourceSlug) : null;
    const draft = {
      id: randomUUID(),
      version: 1,
      status: 'draft',
      title: text(input.title || '', 160, 'TITLE_INVALID'),
      slug,
      module: validateModule(input.module || 'projects'),
      excerpt: text(input.excerpt || '', 500, 'EXCERPT_INVALID'),
      tags: validateTags(input.tags || []),
      cover: text(input.cover || '', 500, 'COVER_INVALID'),
      body: text(input.body || '', 1_000_000, 'BODY_INVALID'),
      sourceSlug,
      createdAt: input.createdAt || stamp,
      updatedAt: stamp,
      publishedAt: input.publishedAt || null,
      syncStatus: 'private'
    };
    await atomicJson(fileFor(draft.id), draft);
    return draft;
  }

  async function get(id) {
    try {
      const value = JSON.parse(await readFile(fileFor(id), 'utf8'));
      if (value.id !== id) throw contentError('DRAFT_CORRUPT');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') throw contentError('DRAFT_NOT_FOUND');
      if (error instanceof SyntaxError) throw contentError('DRAFT_CORRUPT');
      throw error;
    }
  }

  async function update(id, input) {
    const current = await get(id);
    if (!Number.isInteger(input.version) || input.version !== current.version) {
      throw contentError('VERSION_CONFLICT');
    }
    const next = {
      ...current,
      version: current.version + 1,
      title: text(input.title, 160, 'TITLE_INVALID'),
      slug: input.slug ? validateSlug(input.slug) : '',
      module: validateModule(input.module),
      excerpt: text(input.excerpt, 500, 'EXCERPT_INVALID'),
      tags: validateTags(input.tags),
      cover: text(input.cover || '', 500, 'COVER_INVALID'),
      body: text(input.body, 1_000_000, 'BODY_INVALID'),
      updatedAt: now()
    };
    await atomicJson(fileFor(id), next);
    return next;
  }

  async function list() {
    await ensureRoot();
    const names = (await readdir(root)).filter(name => /^[0-9a-f-]{36}\.json$/i.test(name));
    const drafts = await Promise.all(names.map(name => get(name.slice(0, -5))));
    return drafts.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  return { create, get, list, update };
}

module.exports = { atomicJson, createDraftStore };
