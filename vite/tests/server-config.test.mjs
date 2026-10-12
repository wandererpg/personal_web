import { readConfig } from '../server/config.js';
import { createApp, PUBLIC_PAGES, BUNDLE_DIRECTORIES, CONTENT_DIRECTORIES } from '../server/app.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const repoDir = fileURLToPath(new URL('../../', import.meta.url));
const musicFiles = [
  '松本文紀 - 花弁となり 世界は大いに歌う.mp3',
  '松本文紀 - 月の眼球譚.mp3',
  '松本文紀 - 夢の歩みを見上げて (仰望梦想的脚步).mp3',
  '松本文紀 - 夜の向日葵.flac'
];

function validEnv(repoDir, dataDir, overrides = {}) {
  return {
    NODE_ENV: 'test', BLOG_REPO_DIR: repoDir, BLOG_DATA_DIR: dataDir,
    BLOG_ADMIN_USERNAME: 'wanderer', BLOG_ADMIN_PASSWORD_HASH: '$2b$hash',
    BLOG_SESSION_SECRET: 'x'.repeat(32), BLOG_GIT_BRANCH: 'master',
    ...overrides
  };
}

async function createSiteFixture() {
  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  const outside = await mkdtemp(join(tmpdir(), 'wanderer-outside-'));
  const webFiles = [
    'index.html', 'notes.html', 'post.html', 'projects.html', 'schedule.html',
    'static/app.js', 'static/app.css', 'static/favicon.svg',
    'static/admin/dashboard.js', 'static/admin/login.js'
  ];
  await Promise.all(['posts', 'assets', 'music', 'static', 'static/admin', 'server'].map(dir => mkdir(join(root, dir), { recursive: true })));
  await Promise.all(webFiles.map(file => writeFile(join(root, file), 'web')));
  await writeFile(join(root, 'posts', 'article.md'), 'public post');
  await writeFile(join(root, 'posts', 'index.json'), '[]');
  await writeFile(join(root, 'assets', 'image.txt'), 'public asset');
  await writeFile(join(root, 'music', 'track.mp3'), 'public music');
  await writeFile(join(root, 'server', 'app.js'), 'must stay private');
  await writeFile(join(root, 'vite.config.js'), 'must stay private');
  for (const file of ['config.yml', 'school-calendar.JPG', 'AGENT.md', 'package.json', 'package-lock.json']) {
    await writeFile(join(root, file), 'must stay private');
  }
  await writeFile(join(outside, 'secret.txt'), 'outside secret');
  await symlink(outside, join(root, 'assets', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  return { root };
}

test('readConfig requires secrets and resolves separate existing directories', async () => {

  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  const data = await mkdtemp(join(tmpdir(), 'wanderer-data-'));
  const config = readConfig(validEnv(root, data));
  assert.equal(config.repoDir, root);
  assert.equal(config.dataDir, data);
  assert.throws(() => readConfig(validEnv(root, join(data, 'missing'))), /existing directory/i);
});

test('readConfig defaults the web directory to the Vite build output and honours overrides', async () => {

  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  const data = await mkdtemp(join(tmpdir(), 'wanderer-data-'));
  const expectedWebDir = fileURLToPath(new URL('../dist/', import.meta.url));
  assert.equal(readConfig(validEnv(root, data)).webDir, expectedWebDir);
  const custom = await mkdtemp(join(tmpdir(), 'wanderer-web-'));
  assert.equal(readConfig(validEnv(root, data, { BLOG_WEB_DIR: custom })).webDir, custom);
  assert.throws(() => readConfig(validEnv(root, data, { BLOG_WEB_DIR: join(custom, 'missing') })), /existing directory/i);
});

test('readConfig rejects same, nested, dot-segment, and linked repository data paths', async () => {

  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  const nested = join(root, 'private');
  await mkdir(nested);
  const sameViaDots = join(root, '..', basename(root));
  const outside = await mkdtemp(join(tmpdir(), 'wanderer-data-'));
  const linkedToRepo = join(outside, 'linked-repo');
  await symlink(root, linkedToRepo, process.platform === 'win32' ? 'junction' : 'dir');
  const containingDataDir = await mkdtemp(join(tmpdir(), 'wanderer-containing-data-'));
  const containedRepoDir = join(containingDataDir, 'repo');
  await mkdir(containedRepoDir);

  for (const dataDir of [root, nested, sameViaDots, linkedToRepo]) {
    assert.throws(() => readConfig(validEnv(root, dataDir)), /outside/i);
  }
  assert.throws(() => readConfig(validEnv(containedRepoDir, containingDataDir)), /outside/i);

  if (process.platform === 'win32') {
    const caseVariant = `${root[0] === root[0].toUpperCase() ? root[0].toLowerCase() : root[0].toUpperCase()}${root.slice(1)}`;
    assert.throws(() => readConfig(validEnv(root, caseVariant)), /outside/i);
  }
});

test('readConfig only accepts integer ports from 1 through 65535', async () => {

  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  const data = await mkdtemp(join(tmpdir(), 'wanderer-data-'));
  assert.equal(readConfig(validEnv(root, data, { PORT: '1' })).port, 1);
  assert.equal(readConfig(validEnv(root, data, { PORT: '65535' })).port, 65535);
  for (const port of ['', ' ', '0', '65536', '1.5', '1e3', 'not-a-port']) {
    assert.throws(() => readConfig(validEnv(root, data, { PORT: port })), /PORT/);
  }
});

test('public server serves only built pages, bundles, and repository content', async () => {

  const { root } = await createSiteFixture();
  const app = createApp({ repoDir: root, webDir: root, env: 'test' }, { installAdmin: false });

  for (const url of ['/', '/index.html', '/projects.html', '/notes.html', '/post.html', '/schedule.html',
    '/static/app.js', '/static/app.css', '/static/favicon.svg',
    '/static/admin/dashboard.js', '/static/admin/login.js',
    '/posts/article.md', '/assets/image.txt', '/music/track.mp3']) {
    await request(app).get(url).expect(200);
  }

  for (const url of ['/config.yml', '/school-calendar.JPG', '/AGENT.md', '/package.json',
    '/package-lock.json', '/server/app.js', '/vite.config.js', '/notes.html.js', '/static/secret.js']) {
    await request(app).get(url).expect(404);
  }
});

test('public app keeps the schedule API available without an optional data directory', async () => {

  const { root } = await createSiteFixture();
  const app = createApp({ repoDir: root, webDir: root, env: 'test' }, { installAdmin: false });

  await request(app).get('/api/schedule').expect(200).expect(response => {
    assert.deepEqual(response.body.schedule, {
      version: 1,
      termStart: '',
      totalWeeks: 20,
      courses: [],
    });
  });
});

test('public server serves browser-encoded real music filenames as audio', async () => {

  const app = createApp({ repoDir, webDir: repoDir, env: 'test' }, { installAdmin: false });

  for (const filename of musicFiles) {
    const browserUrl = `/music/${encodeURIComponent(filename)}`;
    await request(app).get(browserUrl).expect(200).expect('Content-Type', /^audio\//);
  }
});

test('encoded, traversal, and backslash paths cannot bypass the public allowlist', async () => {

  const { root } = await createSiteFixture();
  const app = createApp({ repoDir: root, webDir: root, env: 'test' }, { installAdmin: false });

  for (const url of ['/assets%2Fimage.txt', '/%70osts/index.json', '/server%2Fapp.js',
    '/%73erver/app.js', '/assets/../config.yml', '/assets/%2e%2e/config.yml',
    '/assets%5Cimage.txt', '/assets/%2Fimage.txt',
    '/assets/%5Cimage.txt', '/assets/%00image.txt', '/assets/%252e%252e/config.yml',
    '/assets/%252Fimage.txt', '/assets%5C..%5Cconfig.yml',
    '/static%2Fapp.js', '/%73tatic/app.js', '/static%5C..%5Cconfig.yml']) {
    await request(app).get(url).expect(404);
  }
});

test('public directories reject links that resolve outside their allowed roots', async () => {

  const { root } = await createSiteFixture();
  const app = createApp({ repoDir: root, webDir: root, env: 'test' }, { installAdmin: false });
  await request(app).get('/assets/escape/secret.txt').expect(404);
});

test('allowlist constants cover every built page and content directory', () => {

  for (const page of ['index.html', 'notes.html', 'post.html', 'projects.html', 'schedule.html']) {
    assert.ok(PUBLIC_PAGES.has(page), page);
  }
  for (const directory of ['static']) assert.ok(BUNDLE_DIRECTORIES.has(directory), directory);
  for (const directory of ['posts', 'assets', 'music']) assert.ok(CONTENT_DIRECTORIES.has(directory), directory);
});
