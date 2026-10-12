import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import request from 'supertest';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const legacyDir = fileURLToPath(new URL('../../', import.meta.url));

test('vite version preserves legacy styles and page content, changing only script entries', async () => {
  for (const file of ['styles.css', 'admin/admin.css', 'favicon.svg']) {
    assert.deepEqual(await readFile(join(webDir, file)), await readFile(join(legacyDir, file)), file);
  }
  const normalize = html => html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .split('\n').map(line => line.trim()).filter(Boolean).join('\n')
    .replaceAll('href="/favicon.svg"', 'href="favicon.svg"')
    .replaceAll('href="../favicon.svg"', 'href="favicon.svg"')
    .replaceAll('src="/assets/avatar.jpg"', 'src="assets/avatar.jpg"');
  for (const file of ['index.html', 'notes.html', 'post.html', 'projects.html', 'schedule.html', 'admin/login.html', 'admin/index.html', 'admin/editor.html', 'admin/schedule.html', 'admin/guestbook.html']) {
    assert.equal(normalize(await readFile(join(webDir, file), 'utf8')), normalize(await readFile(join(legacyDir, file), 'utf8')), file);
  }
});

test('all native browser module dependencies resolve inside the vite workspace', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = [];
  async function collect(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', 'dist'].includes(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (/\.js$/.test(entry.name)) files.push(path);
    }
  }
  await collect(webDir);
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /\brequire\s*\(|module\.exports|\bcreateRequire\b/, file);
    for (const match of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const target = new URL(specifier, `file://${file.replace(/\\/g, '/')}`);
      assert.ok(await access(target).then(() => true, () => false), `${file}: missing module ${specifier}`);
    }
  }
});

test('pages declare a single module entry that Vite can bundle', async () => {
  assert.equal(await access(join(webDir, 'public.js')).then(() => true, () => false), true);
  const entry = await readFile(join(webDir, 'public.js'), 'utf8');
  assert.match(entry, /import\s/);
  for (const file of ['index.html', 'notes.html', 'post.html', 'projects.html', 'schedule.html']) {
    const html = await readFile(join(webDir, file), 'utf8');
    assert.match(html, /<script type="module" src="public\.js"><\/script>/);
    assert.equal((html.match(/<script\b/g) || []).length, 1);
  }
  for (const file of ['admin/index.html', 'admin/login.html', 'admin/editor.html', 'admin/schedule.html', 'admin/guestbook.html']) {
    const html = await readFile(join(webDir, file), 'utf8');
    assert.match(html, /<script type="module" src="\/admin\/[a-z-]+\.js"><\/script>/);
  }
});

test('vite build output emits every page with hashed bundle references', async () => {
  // The production build itself runs through `npm run build` (see package.json); this test
  // validates the committed build output shape so a stale or partial dist fails loudly.
  const dist = join(webDir, 'dist');
  for (const file of ['index.html', 'notes.html', 'post.html', 'projects.html', 'schedule.html',
    'admin/index.html', 'admin/login.html', 'admin/editor.html', 'admin/schedule.html', 'admin/guestbook.html']) {
    const html = await readFile(join(dist, file), 'utf8');
    assert.match(html, /\/static\/[a-zA-Z0-9/._-]+\.js/, file);
    assert.doesNotMatch(html, /src="public\.js"/, file);
  }
  const builtIndex = await readFile(join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(builtIndex, /styles\.css/);
  assert.match(builtIndex, /\/static\/[a-zA-Z0-9/._-]+\.css/);
});

test('ESM server separates the vite web directory from shared content and private data', async t => {
  assert.equal(await access(join(webDir, 'server/app.js')).then(() => true, () => false), true);
  const { createApp } = await import('../server/app.js');
  const root = await mkdtemp(join(tmpdir(), 'wanderer-vite-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repoDir = join(root, 'repo');
  const customWebDir = join(root, 'dist');
  const dataDir = join(root, 'private');
  await Promise.all([mkdir(customWebDir, { recursive: true }), mkdir(join(repoDir, 'posts'), { recursive: true }), mkdir(dataDir)]);
  await writeFile(join(repoDir, 'index.html'), 'original home');
  await writeFile(join(customWebDir, 'index.html'), 'Vite home');
  await writeFile(join(repoDir, 'posts/index.json'), '[]');
  await writeFile(join(dataDir, 'secret.json'), '{"private":true}');
  const app = createApp({ env: 'test', repoDir, webDir: customWebDir, dataDir }, { installAdmin: false });
  await request(app).get('/').expect(200, 'Vite home');
  await request(app).get('/posts/index.json').expect(200, []);
  for (const path of ['/server/app.js', '/package.json', '/tests/modules.test.mjs', '/vite/server/app.js', '/private/secret.json']) {
    await request(app).get(path).expect(404);
  }
});
