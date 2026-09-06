import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { createAdminFixture, pngFixture } from './helpers/admin-fixture.mjs';

test('draft and media routes stay private without an authenticated session', async () => {
  const { app } = await createAdminFixture();

  await request(app).get('/api/admin/posts').expect(401, { error: 'AUTH_REQUIRED' });
  await request(app).post('/api/admin/posts').send({ module: 'projects' }).expect(401);
  await request(app).get('/api/admin/media/11111111-1111-4111-8111-111111111111/image.png').expect(401);
});

test('authenticated admin can create, save, upload, publish, and revise an article', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const created = await agent.post('/api/admin/posts').set('x-csrf-token', csrfToken)
    .send({ module: 'projects' }).expect(201);
  const id = created.body.post.id;

  const saved = await agent.put(`/api/admin/posts/${id}`).set('x-csrf-token', csrfToken).send({
    version: 1, title: '项目日志', slug: 'project-log', module: 'projects',
    excerpt: '项目摘要', tags: ['Project'], cover: '', body: '## 正文'
  }).expect(200);
  assert.equal(saved.body.post.version, 2);

  const uploaded = await agent.post(`/api/admin/posts/${id}/media`)
    .set('x-csrf-token', csrfToken)
    .field('alt', '结构图')
    .attach('image', pngFixture, 'spoofed.svg').expect(201);
  assert.match(uploaded.body.markdown, /^!\[结构图\]\(\/api\/admin\/media\//);
  await agent.get(uploaded.body.asset.url).expect('Content-Type', /image\/png/).expect(200);

  const withImage = await agent.put(`/api/admin/posts/${id}`).set('x-csrf-token', csrfToken).send({
    ...saved.body.post,
    body: `## 正文\n\n${uploaded.body.markdown}`
  }).expect(200);
  const published = await agent.post(`/api/admin/posts/${id}/publish`)
    .set('x-csrf-token', csrfToken).expect(200);
  assert.equal(published.body.syncStatus, 'synced');
  assert.equal(published.body.commit, 'fixturecommit123');

  const index = JSON.parse(await readFile(join(fixture.repoDir, 'posts', 'index.json'), 'utf8'));
  assert.equal(index[0].slug, 'project-log');
  assert.match(await readFile(join(fixture.repoDir, 'posts', 'project-log.md'), 'utf8'), /assets\/blog\/project-log/);

  const revision = await agent.post('/api/admin/posts/project-log/revise')
    .set('x-csrf-token', csrfToken).expect(201);
  assert.equal(revision.body.post.sourceSlug, 'project-log');
  assert.match(revision.body.post.body, /## 正文/);

  const listed = await agent.get('/api/admin/posts').expect(200);
  assert.equal(listed.body.posts.filter(post => post.status === 'published' && post.slug === 'project-log').length, 1);
  assert.ok(listed.body.posts.some(post => post.status === 'draft' && post.id === revision.body.post.id));
  assert.equal(withImage.body.post.version, 3);
});

test('revising a published article reads its indexed Markdown path', async () => {
  const fixture = await createAdminFixture();
  await writeFile(join(fixture.repoDir, 'posts', 'legacy-entry.md'), '# 来自索引的正文\n');
  await writeFile(join(fixture.repoDir, 'posts', 'index.json'), JSON.stringify([{
    slug: 'indexed-entry', title: '索引文章', module: 'learning', excerpt: '摘要',
    tags: [], cover: '', content: 'posts/legacy-entry.md',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-01-01T00:00:00.000Z'
  }]));
  const { agent, csrfToken } = await fixture.login();

  const revision = await agent.post('/api/admin/posts/indexed-entry/revise')
    .set('x-csrf-token', csrfToken).expect(201);
  assert.equal(revision.body.post.body, '# 来自索引的正文\n');
});

test('mutations require CSRF and stale versions map to conflict', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  await agent.post('/api/admin/posts').send({ module: 'projects' })
    .expect(403, { error: 'CSRF_TOKEN_INVALID' });
  const created = await agent.post('/api/admin/posts').set('x-csrf-token', csrfToken)
    .send({ module: 'learning' }).expect(201);

  const payload = { version: 1, title: '学习', slug: 'learning', module: 'learning',
    excerpt: '摘要', tags: [], cover: '', body: '正文' };
  await agent.put(`/api/admin/posts/${created.body.post.id}`).set('x-csrf-token', csrfToken)
    .send(payload).expect(200);
  await agent.put(`/api/admin/posts/${created.body.post.id}`).set('x-csrf-token', csrfToken)
    .send(payload).expect(409, { error: 'VERSION_CONFLICT' });
});

test('upload API rejects non-images even when the extension looks safe', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const created = await agent.post('/api/admin/posts').set('x-csrf-token', csrfToken)
    .send({ module: 'insights' }).expect(201);

  await agent.post(`/api/admin/posts/${created.body.post.id}/media`)
    .set('x-csrf-token', csrfToken)
    .field('alt', 'not an image')
    .attach('image', Buffer.from('<script>alert(1)</script>'), 'image.png')
    .expect(415, { error: 'IMAGE_TYPE_INVALID' });
});

test('sync retry updates a pending draft after Git push succeeds', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const created = await agent.post('/api/admin/posts').set('x-csrf-token', csrfToken)
    .send({ module: 'projects' }).expect(201);

  await agent.post('/api/admin/sync').set('x-csrf-token', csrfToken)
    .send({ draftId: created.body.post.id }).expect(200, { syncStatus: 'synced' });
  assert.deepEqual(fixture.gitCalls.at(-1), { retry: true });
});
