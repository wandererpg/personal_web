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

