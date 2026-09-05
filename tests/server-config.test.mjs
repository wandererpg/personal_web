import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

const require = createRequire(import.meta.url);

test('readConfig requires secrets and keeps private data outside the repository', async () => {
  const { readConfig } = require('../server/config.js');
  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  const data = await mkdtemp(join(tmpdir(), 'wanderer-data-'));
  const env = {
    NODE_ENV: 'test', BLOG_REPO_DIR: root, BLOG_DATA_DIR: data,
    BLOG_ADMIN_USERNAME: 'wanderer', BLOG_ADMIN_PASSWORD_HASH: '$2b$hash',
    BLOG_SESSION_SECRET: 'x'.repeat(32), BLOG_GIT_BRANCH: 'master'
  };
  const config = readConfig(env);
  assert.equal(config.repoDir, root);
  assert.equal(config.dataDir, data);
  assert.throws(() => readConfig({ ...env, BLOG_DATA_DIR: join(root, 'private') }), /outside/i);
});

test('public server blocks repository internals', async () => {
  const { createApp } = require('../server/app.js');
  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  await writeFile(join(root, 'index.html'), '<h1>home</h1>');
  await writeFile(join(root, 'AGENT.md'), 'private instructions');
  const app = createApp({ repoDir: root, env: 'test' }, { installAdmin: false });
  await request(app).get('/').expect(200, /home/);
  await request(app).get('/AGENT.md').expect(404);
  await request(app).get('/server/app.js').expect(404);
});
