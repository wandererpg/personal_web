import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const AdminModel = require('../admin/admin-model.js');
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('dashboard filters posts by module, status, and query without changing input', () => {
  const posts = [
    { title: '项目日志', excerpt: '个人网站', module: 'projects', status: 'draft' },
    { title: '学习记录', excerpt: 'Node 服务', module: 'learning', status: 'published' }
  ];

  assert.deepEqual(AdminModel.filterPosts(posts, {
    module: 'learning', status: 'published', query: 'node'
  }), [posts[1]]);
  assert.equal(posts.length, 2);
});

test('dashboard summarizes private workflow states', () => {
  const summary = AdminModel.summarizePosts([
    { status: 'draft', syncStatus: 'private' },
    { status: 'published', syncStatus: 'synced' },
    { status: 'published', syncStatus: 'pending' }
  ]);
  assert.deepEqual(summary, { all: 3, drafts: 1, published: 2, pending: 1 });
});

test('dashboard reopens pending publications but revises synced public posts', () => {
  assert.deepEqual(AdminModel.getOpenAction({
    id: 'pending-id', slug: 'pending-post', status: 'published', syncStatus: 'pending'
  }), { type: 'draft', id: 'pending-id' });
  assert.deepEqual(AdminModel.getOpenAction({
    id: null, slug: 'public-post', status: 'published', syncStatus: 'synced'
  }), { type: 'revise', slug: 'public-post' });
});

test('dashboard maps draft and published rows to safe delete targets', () => {
  assert.deepEqual(AdminModel.getDeleteTarget({ status: 'draft', id: 'draft-id' }), {
    type: 'draft', id: 'draft-id'
  });
  assert.deepEqual(AdminModel.getDeleteTarget({ status: 'published', slug: 'public-post' }), {
    type: 'published', slug: 'public-post'
  });
});

test('dashboard page exposes private archive controls and safe rendering hooks', async () => {
  const [html, script] = await Promise.all([read('admin/index.html'), read('admin/dashboard.js')]);
  for (const hook of [
    'data-admin-posts', 'data-admin-query', 'data-admin-module', 'data-admin-status',
    'data-admin-new', 'data-admin-logout', 'data-admin-empty', 'data-admin-error'
  ]) assert.match(html, new RegExp(hook));
  assert.match(html, /noindex,nofollow/);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});

test('editor inserts uploaded Markdown at the current selection', () => {
  assert.deepEqual(AdminModel.insertMarkdown('before after', 7, 7, '![结构图](/private/image.png)'), {
    value: 'before ![结构图](/private/image.png)after',
    cursor: 33
  });
});

test('editor normalizes tags and detects publication requirements', () => {
  const post = AdminModel.normalizeEditorPayload({
    title: ' 项目日志 ', slug: 'project-log', module: 'projects', excerpt: ' 摘要 ',
    tags: 'Web, Design,Web', cover: '', body: '## 正文'
  });
  assert.deepEqual(post.tags, ['Web', 'Design']);
  assert.deepEqual(AdminModel.validateForPublish(post), []);
  assert.deepEqual(AdminModel.validateForPublish({ ...post, title: '', body: '  ' }), ['title', 'body']);
});

test('successful publication returns to the admin login page', () => {
  assert.equal(AdminModel.getPostPublishDestination({ syncStatus: 'synced' }), '/admin/login');
  assert.equal(AdminModel.getPostPublishDestination({ syncStatus: 'pending' }), null);
});

test('editor page exposes Markdown preview, upload, autosave, and publication controls', async () => {
  const [html, script] = await Promise.all([read('admin/editor.html'), read('admin/editor.js')]);
  for (const hook of [
    'data-editor-body', 'data-editor-preview', 'data-editor-upload', 'data-editor-save',
    'data-editor-publish', 'data-editor-status', 'data-editor-title', 'data-editor-slug'
  ]) assert.match(html, new RegExp(hook));
  assert.match(script, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(script, /Blog\.renderMarkdown/);
  assert.match(script, /1500/);
  assert.match(script, /beforeunload/);
  assert.doesNotMatch(script, /post\.html\?slug=/);
  assert.match(script, /getPostPublishDestination/);
});

test('dashboard exposes edit and delete actions for every private archive row', async () => {
  const html = await read('admin/index.html');
  const script = await read('admin/dashboard.js');
  assert.match(script, /dataset\.adminDelete/);
  assert.match(script, /posts\/drafts/);
  assert.match(script, /posts\/published/);
  assert.match(script, /method: 'DELETE'/);
});

test('guestbook moderation page exposes safe listing and deletion hooks', async () => {
  const [html, script] = await Promise.all([read('admin/guestbook.html'), read('admin/guestbook.js')]);
  for (const hook of [
    'data-admin-guestbook', 'data-admin-guestbook-list', 'data-admin-guestbook-empty',
    'data-admin-guestbook-error', 'data-admin-guestbook-status', 'data-admin-guestbook-count'
  ]) assert.match(html, new RegExp(hook));
  assert.match(html, /href="\/admin\/guestbook"/);
  assert.match(script, /\/api\/admin\/guestbook/);
  assert.match(script, /method: 'DELETE'/);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});
