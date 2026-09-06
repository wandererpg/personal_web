import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { createAdminFixture, pngFixture } from './helpers/admin-fixture.mjs';

test('draft and media routes stay private without an authenticated session', async () => {
  const { app } = await createAdminFixture();

  await request(app).get('/api/admin/posts').expect(401, { error: 'AUTH_REQUIRED' });
  await request(app).post('/api/admin/posts').send({ module: 'projects' }).expect(401);
  await request(app).get('/api/admin/media/11111111-1111-4111-8111-111111111111/image.png').expect(401);
});

test('public schedule API returns an empty default schedule', async () => {
  const fixture = await createAdminFixture();
  const response = await request(fixture.app).get('/api/schedule').expect(200);
  assert.deepEqual(response.body.schedule, {
    version: 1,
    termStart: '',
    totalWeeks: 20,
    courses: [],
  });
});

test('schedule mutations require authentication and CSRF', async () => {
  const fixture = await createAdminFixture();
  await request(fixture.app).get('/api/admin/schedule').expect(401, { error: 'AUTH_REQUIRED' });
  const { agent } = await fixture.login();
  await agent.put('/api/admin/schedule').send({}).expect(403, { error: 'CSRF_TOKEN_INVALID' });
});

test('authenticated admin can save and read a schedule', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const schedule = {
    version: 1,
    termStart: '2026-09-07',
    totalWeeks: 20,
    courses: [{
      id: 'course-1',
      name: '计算物理基础',
      teacher: '赵虎',
      room: '九 202',
      weekday: 3,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [1, 2],
      color: 'mint',
    }],
  };

  await agent.put('/api/admin/schedule').set('x-csrf-token', csrfToken)
    .send(schedule).expect(200, { schedule });
  await request(fixture.app).get('/api/schedule').expect(200, { schedule });
});

test('schedule API rejects overlapping courses without replacing the saved version', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const schedule = {
    version: 1,
    termStart: '2026-09-07',
    totalWeeks: 20,
    courses: [{
      id: 'course-a', name: '课程 A', teacher: '老师 A', room: '一 101', weekday: 1,
      startPeriod: 1, endPeriod: 2, weeks: [1], color: 'mint',
    }, {
      id: 'course-b', name: '课程 B', teacher: '老师 B', room: '一 102', weekday: 1,
      startPeriod: 2, endPeriod: 3, weeks: [1], color: 'pink',
    }],
  };

  await agent.put('/api/admin/schedule').set('x-csrf-token', csrfToken)
    .send(schedule).expect(409, { error: 'SCHEDULE_CONFLICT' });
  await request(fixture.app).get('/api/schedule').expect(200, {
    schedule: { version: 1, termStart: '', totalWeeks: 20, courses: [] },
  });
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
    .send({ draftId: created.body.post.id }).expect(409, { error: 'SYNC_NOT_PENDING' });
  await fixture.draftStore.updateSystem(created.body.post.id, {
    status: 'published', syncStatus: 'pending', lastCommit: 'pendingcommit123'
  });

  await agent.post('/api/admin/sync').set('x-csrf-token', csrfToken)
    .send({ draftId: created.body.post.id }).expect(200, { syncStatus: 'synced' });
  assert.deepEqual(fixture.gitCalls.at(-1), { retry: true });
});

test('admin can delete a draft and its private staged media', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const created = await agent.post('/api/admin/posts').set('x-csrf-token', csrfToken)
    .send({ module: 'projects' }).expect(201);
  const upload = await agent.post(`/api/admin/posts/${created.body.post.id}/media`)
    .set('x-csrf-token', csrfToken).field('alt', '草稿图').attach('image', pngFixture, 'image.png').expect(201);

  await agent.delete(`/api/admin/posts/drafts/${created.body.post.id}`).expect(403, { error: 'CSRF_TOKEN_INVALID' });
  await agent.delete(`/api/admin/posts/drafts/${created.body.post.id}`).set('x-csrf-token', csrfToken)
    .expect(200, { deleted: true, type: 'draft', id: created.body.post.id });
  await assert.rejects(() => fixture.draftStore.get(created.body.post.id), error => error.code === 'DRAFT_NOT_FOUND');
  await assert.rejects(() => access(join(fixture.dataDir, 'media', created.body.post.id, upload.body.asset.name)));
  const listed = await agent.get('/api/admin/posts').expect(200);
  assert.equal(listed.body.posts.some(post => post.id === created.body.post.id), false);
});

test('admin can delete a published article through a Git-backed mutation', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const created = await agent.post('/api/admin/posts').set('x-csrf-token', csrfToken)
    .send({ module: 'projects' }).expect(201);
  await agent.put(`/api/admin/posts/${created.body.post.id}`).set('x-csrf-token', csrfToken).send({
    version: 1, title: '待删除文章', slug: 'to-delete', module: 'projects', excerpt: '摘要',
    tags: [], cover: '', body: '# 正文'
  }).expect(200);
  await agent.post(`/api/admin/posts/${created.body.post.id}/publish`).set('x-csrf-token', csrfToken).expect(200);

  await agent.delete('/api/admin/posts/published/to-delete').expect(403, { error: 'CSRF_TOKEN_INVALID' });
  const deleted = await agent.delete('/api/admin/posts/published/to-delete').set('x-csrf-token', csrfToken)
    .expect(200);
  assert.deepEqual(
    { deleted: deleted.body.deleted, type: deleted.body.type, slug: deleted.body.slug },
    { deleted: true, type: 'published', slug: 'to-delete' }
  );
  assert.equal(deleted.body.syncStatus, 'synced');
  const index = JSON.parse(await readFile(join(fixture.repoDir, 'posts', 'index.json'), 'utf8'));
  assert.equal(index.some(post => post.slug === 'to-delete'), false);
  await assert.rejects(() => access(join(fixture.repoDir, 'posts', 'to-delete.md')));
  assert.equal(fixture.gitCalls.at(-1).message, 'blog: delete 待删除文章');
});
