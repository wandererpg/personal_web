import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_NAME = '22222222-2222-4222-8222-222222222222.png';

async function fixture(overrides = {}) {
  const { createPublishService } = require('../server/publish-service.js');
  const repoDir = await mkdtemp(join(tmpdir(), 'wanderer-publish-'));
  await mkdir(join(repoDir, 'posts'));
  await writeFile(join(repoDir, 'posts', 'index.json'), '[]\n');
  const draft = {
    id: DRAFT_ID, version: 2, status: 'draft', syncStatus: 'private', sourceSlug: null,
    title: '项目日志', slug: 'site-log', module: 'projects', excerpt: '项目摘要',
    tags: ['Project'], cover: '',
    body: `## 正文\n\n![结构图](/api/admin/media/${DRAFT_ID}/${IMAGE_NAME})`,
    createdAt: '2026-09-06T14:32:08+08:00', publishedAt: null
  };
  const systemUpdates = [];
  let gitInput;
  const dependencies = {
    repoDir,
    now: () => '2026-09-06T15:00:00+08:00',
    draftStore: {
      get: async () => draft,
      updateSystem: async (_id, value) => { systemUpdates.push(value); return { ...draft, ...value }; }
    },
    mediaStore: {
      publish: async () => ({ paths: [`assets/blog/site-log/${IMAGE_NAME}`] })
    },
    gitPublisher: {
      commitAndPush: async input => { gitInput = input; return { commit: 'abc123' }; }
    },
    ...overrides
  };
  return { repoDir, draft, systemUpdates, get gitInput() { return gitInput; },
    service: createPublishService(dependencies) };
}

test('publishing writes rewritten Markdown and a public index before scoped Git commit', async () => {
  const state = await fixture();
  const result = await state.service.publish(DRAFT_ID);
  const markdown = await readFile(join(state.repoDir, 'posts', 'site-log.md'), 'utf8');
  const index = JSON.parse(await readFile(join(state.repoDir, 'posts', 'index.json'), 'utf8'));

  assert.match(markdown, new RegExp(`assets/blog/site-log/${IMAGE_NAME}`));
  assert.doesNotMatch(markdown, /api\/admin\/media/);
  assert.equal(index[0].module, 'projects');
  assert.equal(index[0].createdAt, state.draft.createdAt);
  assert.equal(index[0].updatedAt, '2026-09-06T15:00:00+08:00');
  assert.equal(index[0].publishedAt, '2026-09-06T15:00:00+08:00');
  assert.ok(result.paths.includes('posts/site-log.md'));
  assert.ok(result.paths.includes('posts/index.json'));
  assert.deepEqual(state.gitInput.paths.slice().sort(), result.paths.slice().sort());
  assert.deepEqual(state.systemUpdates.at(-1), {
    status: 'published', syncStatus: 'synced', publishedAt: '2026-09-06T15:00:00+08:00',
    lastCommit: 'abc123'
  });
});

test('publication rejects duplicate public slugs and unsupported revision renames', async () => {
  const duplicate = await fixture();
  await writeFile(join(duplicate.repoDir, 'posts', 'index.json'), JSON.stringify([{
    slug: 'site-log', title: 'Existing', module: 'projects', createdAt: '2026-01-01T00:00:00+08:00',
    updatedAt: '2026-01-01T00:00:00+08:00', publishedAt: '2026-01-01T00:00:00+08:00',
    excerpt: 'x', cover: '', tags: [], readingTime: '1 min', content: 'posts/site-log.md'
  }]));
  await assert.rejects(() => duplicate.service.publish(DRAFT_ID), error => error.code === 'SLUG_CONFLICT');

  const revision = await fixture();
  revision.draft.sourceSlug = 'old-slug';
  await assert.rejects(() => revision.service.publish(DRAFT_ID), error => error.code === 'SLUG_CHANGE_UNSUPPORTED');
});

test('push failure marks the committed draft pending and remains retryable', async () => {
  const pendingError = Object.assign(new Error('offline'), { code: 'GIT_PUSH_PENDING', commit: 'pending123' });
  const state = await fixture({
    gitPublisher: { commitAndPush: async () => { throw pendingError; }, retryPush: async () => 'ok' }
  });

  await assert.rejects(() => state.service.publish(DRAFT_ID), error => error === pendingError);
  assert.deepEqual(state.systemUpdates.at(-1), {
    status: 'published', syncStatus: 'pending', publishedAt: '2026-09-06T15:00:00+08:00',
    lastCommit: 'pending123'
  });
  assert.deepEqual(await state.service.retrySync(DRAFT_ID), { syncStatus: 'synced' });
  assert.deepEqual(state.systemUpdates.at(-1), { syncStatus: 'synced' });
});

test('publication rejects invalid dates, empty bodies, and cross-draft private media', async () => {
  const invalidDate = await fixture();
  invalidDate.draft.createdAt = 'not-a-date';
  await assert.rejects(() => invalidDate.service.publish(DRAFT_ID),
    error => error.code === 'CREATED_AT_INVALID');

  const empty = await fixture();
  empty.draft.body = '   ';
  await assert.rejects(() => empty.service.publish(DRAFT_ID),
    error => error.code === 'BODY_REQUIRED');

  const crossDraft = await fixture();
  crossDraft.draft.body = '![private](/api/admin/media/33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222.png)';
  await assert.rejects(() => crossDraft.service.publish(DRAFT_ID),
    error => error.code === 'PRIVATE_MEDIA_REFERENCE');
});

test('draft store system updates change only publication-owned fields', async () => {
  const { createDraftStore } = require('../server/draft-store.js');
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-publish-draft-'));
  const store = createDraftStore({ dataDir, now: () => '2026-09-06T15:00:00+08:00' });
  const draft = await store.create({ module: 'projects', title: 'Draft', body: 'Body' });
  const updated = await store.updateSystem(draft.id, {
    status: 'published', syncStatus: 'synced', publishedAt: '2026-09-06T15:00:00+08:00',
    lastCommit: 'abc123', title: 'Attacker override'
  });

  assert.equal(updated.title, 'Draft');
  assert.equal(updated.status, 'published');
  assert.equal(updated.lastCommit, 'abc123');
  assert.equal(updated.version, 2);
});
