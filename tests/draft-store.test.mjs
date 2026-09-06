import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

async function createStore(nowValues = []) {
  const { createDraftStore } = require('../server/draft-store.js');
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-drafts-'));
  let index = 0;
  const now = nowValues.length
    ? () => nowValues[Math.min(index++, nowValues.length - 1)]
    : () => new Date().toISOString();
  return createDraftStore({ dataDir, now });
}

test('draft CRUD preserves Markdown and increments optimistic version', async () => {
  const store = await createStore(['2026-09-06T10:00:00.000Z', '2026-09-06T10:05:00.000Z']);
  const draft = await store.create({ module: 'learning' });
  const saved = await store.update(draft.id, {
    version: 1,
    title: 'Node 学习记录',
    slug: 'node-learning',
    module: 'learning',
    excerpt: '记录服务端学习过程。',
    tags: ['Node', 'Backend'],
    cover: '',
    body: '## 第一节\n\n正文'
  });

  assert.equal(saved.version, 2);
  assert.equal(saved.updatedAt, '2026-09-06T10:05:00.000Z');
  assert.match((await store.get(draft.id)).body, /## 第一节/);
  assert.deepEqual((await store.list()).map(item => item.id), [draft.id]);
});

test('stale draft versions are rejected without overwriting the current body', async () => {
  const store = await createStore();
  const draft = await store.create({ module: 'projects' });
  await store.update(draft.id, {
    version: 1, title: 'Current', slug: 'current', module: 'projects',
    excerpt: 'Current excerpt', tags: [], cover: '', body: 'current body'
  });

  await assert.rejects(() => store.update(draft.id, {
    version: 1, title: 'Stale', slug: 'stale', module: 'projects',
    excerpt: 'Stale excerpt', tags: [], cover: '', body: 'stale body'
  }), error => error.code === 'VERSION_CONFLICT');
  assert.equal((await store.get(draft.id)).body, 'current body');
});

test('published content can seed a private revision draft', async () => {
  const store = await createStore();
  const draft = await store.create({
    title: '已发布文章', slug: 'published-post', module: 'insights',
    excerpt: '公开摘要', tags: ['Method'], cover: 'assets/blog/published-post/cover.webp',
    body: '## 原正文', sourceSlug: 'published-post',
    createdAt: '2026-08-01T09:00:00+08:00', publishedAt: '2026-08-02T09:00:00+08:00'
  });

  assert.equal(draft.sourceSlug, 'published-post');
  assert.equal(draft.status, 'draft');
  assert.equal(draft.syncStatus, 'private');
  assert.match(draft.body, /原正文/);
});

test('draft update cannot overwrite system-owned identity and state', async () => {
  const store = await createStore();
  const draft = await store.create({ module: 'projects' });
  const saved = await store.update(draft.id, {
    version: 1, id: 'attacker', status: 'published', syncStatus: 'synced', sourceSlug: 'attacker',
    title: 'Safe', slug: 'safe', module: 'projects', excerpt: 'Safe excerpt',
    tags: ['Safe'], cover: '', body: 'safe body'
  });

  assert.equal(saved.id, draft.id);
  assert.equal(saved.status, 'draft');
  assert.equal(saved.syncStatus, 'private');
  assert.equal(saved.sourceSlug, null);
});

test('draft identifiers, slugs, modules, and tag payloads are validated', async () => {
  const { validateDraftId, validateModule, validateSlug } = require('../server/content-model.js');
  assert.throws(() => validateDraftId('../../secret'), error => error.code === 'DRAFT_ID_INVALID');
  assert.throws(() => validateSlug('../secret'), error => error.code === 'SLUG_INVALID');
  assert.throws(() => validateModule('private'), error => error.code === 'MODULE_INVALID');

  const store = await createStore();
  const draft = await store.create({ module: 'projects' });
  await assert.rejects(() => store.update(draft.id, {
    version: 1, title: 'Bad tags', slug: 'bad-tags', module: 'projects',
    excerpt: 'x', tags: ['ok', 42], cover: '', body: 'body'
  }), error => error.code === 'TAGS_INVALID');
});

test('missing drafts return a stable error without private paths', async () => {
  const store = await createStore();
  await assert.rejects(
    () => store.get('11111111-1111-4111-8111-111111111111'),
    error => error.code === 'DRAFT_NOT_FOUND' && !String(error.message).includes(tmpdir())
  );
});
