import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

const require = createRequire(import.meta.url);
const session = require('express-session');
const { createApp } = require('../server/app.js');

async function makeApp(overrides = {}) {
  const repoDir = await mkdtemp(join(tmpdir(), 'wanderer-auth-site-'));
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-auth-data-'));
  await writeFile(join(repoDir, 'index.html'), '<h1>home</h1>');
  await mkdir(join(repoDir, 'posts'));
  await mkdir(join(repoDir, 'assets', 'blog'), { recursive: true });
  await writeFile(join(repoDir, 'posts', 'index.json'), '[]\n');
  await mkdir(join(repoDir, 'admin'));
  for (const name of [
    'login.html', 'login.js', 'admin-api.js', 'index.html', 'dashboard.js', 'admin-model.js',
    'admin.css', 'editor.html', 'editor.js', 'guestbook.html', 'guestbook.js'
  ]) {
    await copyFile(new URL(`../admin/${name}`, import.meta.url), join(repoDir, 'admin', name));
  }
  return createApp({
    env: 'test', repoDir, dataDir, adminUsername: 'wanderer',
    adminPasswordHash: 'test-hash', sessionSecret: 'x'.repeat(32), gitBranch: 'master',
    ...overrides
  }, {
    sessionStore: new session.MemoryStore(),
    passwordCompare: async value => value === 'correct'
  });
}

async function loggedInAgent() {
  const agent = request.agent(await makeApp());
  const sessionResponse = await agent.get('/api/admin/session').expect(200);
  const login = await agent.post('/api/admin/login')
    .set('x-csrf-token', sessionResponse.body.csrfToken)
    .send({ username: 'wanderer', password: 'correct' })
    .expect(200);
  return { agent, csrfToken: login.body.csrfToken };
}

test('admin session issues CSRF but hides protected APIs before login', async () => {
  const agent = request.agent(await makeApp());
  const sessionResponse = await agent.get('/api/admin/session').expect(200);

  assert.equal(sessionResponse.body.authenticated, false);
  assert.match(sessionResponse.body.csrfToken, /^[A-Za-z0-9_-]{40,}$/);
  await agent.get('/api/admin/posts').expect(401, { error: 'AUTH_REQUIRED' });
});

test('session cookie is HttpOnly and SameSite Strict', async () => {
  const response = await request(await makeApp()).get('/api/admin/session').expect(200);
  const cookie = response.headers['set-cookie']?.[0] || '';

  assert.match(cookie, /wanderer\.admin=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
});

test('login rejects missing CSRF and invalid credentials', async () => {
  const agent = request.agent(await makeApp());
  const sessionResponse = await agent.get('/api/admin/session').expect(200);

  await agent.post('/api/admin/login')
    .send({ username: 'wanderer', password: 'correct' })
    .expect(403, { error: 'CSRF_TOKEN_INVALID' });
  await agent.post('/api/admin/login')
    .set('x-csrf-token', sessionResponse.body.csrfToken)
    .send({ username: 'wanderer', password: 'wrong' })
    .expect(401, { error: 'LOGIN_FAILED' });
  await agent.get('/api/admin/posts').expect(401);
});

test('valid login rotates CSRF and grants access to protected APIs', async () => {
  const agent = request.agent(await makeApp());
  const sessionResponse = await agent.get('/api/admin/session').expect(200);
  const login = await agent.post('/api/admin/login')
    .set('x-csrf-token', sessionResponse.body.csrfToken)
    .send({ username: 'wanderer', password: 'correct' })
    .expect(200);

  assert.equal(login.body.authenticated, true);
  assert.notEqual(login.body.csrfToken, sessionResponse.body.csrfToken);
  await agent.get('/api/admin/posts').expect(200, { posts: [] });
});

test('logout requires CSRF and destroys the authenticated session', async () => {
  const { agent, csrfToken } = await loggedInAgent();

  await agent.post('/api/admin/logout').expect(403, { error: 'CSRF_TOKEN_INVALID' });
  await agent.post('/api/admin/logout').set('x-csrf-token', csrfToken).expect(204);
  await agent.get('/api/admin/posts').expect(401);
});

test('login page and scripts are available without exposing the dashboard', async () => {
  const app = await makeApp();

  await request(app).get('/admin/login').expect(200, /data-admin-login/);
  await request(app).get('/admin/login.js').expect(200, /AdminLogin/);
  await request(app).get('/admin/admin-api.js').expect(200, /AdminApi/);
  await request(app).get('/admin/admin.css').expect(200, /admin-shell/);
  await request(app).get('/admin/dashboard.js').expect(200, /AdminDashboard/);
  await request(app).get('/admin/guestbook.js').expect(200, /api\/admin\/guestbook/);
  await request(app).get('/admin/admin-model.js').expect(200, /AdminModel/);
  await request(app).get('/admin').expect(302, /Redirecting to \/admin\/login/)
    .expect('Location', '/admin/login');
  await request(app).get('/admin/editor?id=private').expect(302).expect('Location', '/admin/login');
});

test('authenticated browser can load the private dashboard', async () => {
  const { agent } = await loggedInAgent();
  await agent.get('/admin').expect(200, /data-admin-posts/);
  await agent.get('/admin/editor?id=private').expect(200, /data-editor-body/);
  await agent.get('/admin/guestbook').expect(200, /data-admin-guestbook/);
});
