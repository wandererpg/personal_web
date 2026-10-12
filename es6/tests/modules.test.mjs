import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import request from 'supertest';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const legacyDir = fileURLToPath(new URL('../../', import.meta.url));

test('new version preserves legacy styles and page content, changing only script entries', async () => {
  for (const file of ['styles.css', 'admin/admin.css', 'favicon.svg']) {
    assert.deepEqual(await readFile(join(webDir, file)), await readFile(join(legacyDir, file)), file);
  }
  const normalize = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').split('\n').map(line => line.trim()).filter(Boolean).join('\n');
  for (const file of ['index.html', 'notes.html', 'post.html', 'projects.html', 'schedule.html', 'admin/login.html', 'admin/index.html', 'admin/editor.html', 'admin/schedule.html', 'admin/guestbook.html']) {
    assert.equal(normalize(await readFile(join(webDir, file), 'utf8')), normalize(await readFile(join(legacyDir, file), 'utf8')), file);
  }
});

test('all native browser module dependencies are served as JavaScript', async t => {
  const { createApp, PUBLIC_ROOT_FILES } = await import('../server/app.js');
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-module-http-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const app = createApp({ env: 'test', repoDir: legacyDir, webDir, dataDir, sessionSecret: 'temporary-module-routing-secret-123456' });
  const paths = [...PUBLIC_ROOT_FILES].filter(file => file.endsWith('.js')).map(file => `/${file}`);
  paths.push(...['login.js', 'dashboard.js', 'editor.js', 'schedule.js', 'guestbook.js', 'admin-api.js', 'admin-model.js'].map(file => `/admin/${file}`));
  for (const path of paths) {
    const response = await request(app).get(path).expect(200).expect('Content-Type', /javascript/);
    for (const match of response.text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) {
        const target = new URL(match[1], `http://localhost${path}`).pathname;
        await request(app).get(target).expect(200).expect('Content-Type', /javascript/);
      }
    }
  }
});

test('new version supplies a native ES module browser entry', async () => {
  assert.equal(await access(join(webDir, 'public.js')).then(() => true, () => false), true);
  const entry = await readFile(join(webDir, 'public.js'), 'utf8');
  assert.match(entry, /import\s/);
  for (const file of ['index.html', 'notes.html', 'post.html', 'projects.html', 'schedule.html']) {
    const html = await readFile(join(webDir, file), 'utf8');
    assert.match(html, /<script type="module" src="public\.js"><\/script>/);
    assert.equal((html.match(/<script\b/g) || []).length, 1);
  }
});

test('ESM server separates new page files from shared content and private data', async t => {
  assert.equal(await access(join(webDir, 'server/app.js')).then(() => true, () => false), true);
  const { createApp } = await import('../server/app.js');
  const root = await mkdtemp(join(tmpdir(), 'wanderer-esm-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoDir = join(root, 'repo');
  const newWebDir = join(repoDir, 'es6');
  const dataDir = join(root, 'private');
  await Promise.all([mkdir(newWebDir, { recursive: true }), mkdir(join(repoDir, 'posts'), { recursive: true }), mkdir(dataDir)]);
  await writeFile(join(repoDir, 'index.html'), 'original home');
  await writeFile(join(newWebDir, 'index.html'), 'ESM home');
  await writeFile(join(newWebDir, 'public.js'), 'export const ready = true;');
  await writeFile(join(repoDir, 'posts/index.json'), '[]');
  await writeFile(join(dataDir, 'secret.json'), '{"private":true}');
  const app = createApp({ env: 'test', repoDir, webDir: newWebDir, dataDir }, { installAdmin: false });
  await request(app).get('/').expect(200, 'ESM home');
  await request(app).get('/public.js').expect(200).expect('Content-Type', /javascript/);
  await request(app).get('/posts/index.json').expect(200, []);
  for (const path of ['/server/app.js', '/package.json', '/tests/modules.test.mjs', '/es6/server/app.js', '/private/secret.json']) {
    await request(app).get(path).expect(404);
  }
});
