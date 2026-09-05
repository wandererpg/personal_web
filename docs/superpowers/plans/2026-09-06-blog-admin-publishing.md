# Secure Blog Admin Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private single-admin Markdown publishing interface with image uploads, three public blog modules, and automatic scoped Git Commit + Push publishing.

**Architecture:** Keep published posts in the existing repository-backed `posts/` and `assets/blog/` structure. Add an Express service that serves the public site, protects `/admin` and `/api/admin/*` with server-side sessions and CSRF checks, stores drafts outside the repository, and serializes publication through a Git publisher. Public pages continue to render only `posts/index.json`, so drafts never enter the public data path.

**Tech Stack:** Node.js 20+, Express 5, `express-session`, `session-file-store`, `bcryptjs`, `helmet`, `express-rate-limit`, Multer 2.3+, vanilla HTML/CSS/JavaScript, Markdown, Node test runner, Supertest, Git, Nginx.

---

## File responsibility map

### Server

- `server.js`: process entry point; loads configuration, creates the app, starts listening.
- `server/config.js`: validates environment variables and resolves repository/private paths.
- `server/app.js`: composes middleware, routes, static-file policy, and error responses.
- `server/auth.js`: login, logout, authentication guard, CSRF token lifecycle, and login limiter.
- `server/draft-store.js`: atomic private draft CRUD and optimistic version checks.
- `server/media-store.js`: image signature validation, private staging, and publication copy/rewrite.
- `server/git-publisher.js`: shell-free Git runner, publication queue, scoped Commit, Push, and retry.
- `server/publish-service.js`: validates a draft and coordinates files, index, media, and Git.
- `server/admin-api.js`: authenticated JSON and multipart endpoints.
- `server/content-model.js`: module constants and server-side article metadata validation.

### Admin frontend

- `admin/login.html`, `admin/login.js`: login form and CSRF-aware session creation.
- `admin/index.html`, `admin/dashboard.js`: private post archive and filters.
- `admin/editor.html`, `admin/editor.js`: Markdown editing, preview, autosave, uploads, and publish.
- `admin/admin-api.js`: browser API client and CSRF header handling.
- `admin/admin-model.js`: pure filtering, form normalization, Markdown insertion, and dirty-state helpers.
- `admin/admin.css`: Wanderer.OS admin visual system and responsive layout.

### Public frontend and content

- `blog.js`: normalized module metadata, filtering, module cards, article-list routing.
- `notes.html`: three-module public landing and filtered published list.
- `index.html`: latest published cards display module labels.
- `post.html`: article metadata displays creation time and module.
- `styles.css`: public module cards, list rows, responsive and reduced-motion states.
- `posts/index.json`: migrate existing posts to `module` and ISO timestamps.

### Tests and operations

- `tests/helpers/admin-fixture.mjs`: isolated authenticated API fixture.
- `tests/server-config.test.mjs`: environment and path boundary tests.
- `tests/auth.test.mjs`: session, CSRF, login, logout, and access tests.
- `tests/draft-store.test.mjs`: draft persistence, versions, and path safety.
- `tests/media-store.test.mjs`: image signatures, limits, staging, and rewrite tests.
- `tests/admin-api.test.mjs`: protected CRUD/upload API tests.
- `tests/git-publisher.test.mjs`: exact shell-free Git command and queue tests.
- `tests/publish-service.test.mjs`: end-to-end publication in a temporary Git repository.
- `tests/admin-ui.test.mjs`: static admin hooks and pure editor model tests.
- `tests/blog.test.mjs`, `tests/blog-content.test.mjs`, `tests/site-smoke.mjs`: public module regressions.
- `.env.example`: required environment-variable names without secrets.
- `.gitignore`: excludes dependencies, secrets, and local private data.
- `scripts/hash-password.js`: locally generates a bcrypt password hash without storing plaintext.
- `deploy/nginx.conf.example`, `deploy/personal-website.service.example`: HTTPS proxy and service templates.
- `README.md`: local start, admin setup, publishing, backup, recovery, and deployment instructions.

---

### Task 1: Node runtime, configuration, and safe static shell

**Files:**
- Create: `package.json`
- Create: `package-lock.json` through `npm install`
- Create: `server.js`
- Create: `server/config.js`
- Create: `server/app.js`
- Create: `tests/server-config.test.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing configuration and static-policy tests**

```js
// tests/server-config.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import request from 'supertest';

const require = createRequire(import.meta.url);

function validEnv(repoDir, dataDir, overrides = {}) {
  return {
    NODE_ENV: 'test', BLOG_REPO_DIR: repoDir, BLOG_DATA_DIR: dataDir,
    BLOG_ADMIN_USERNAME: 'wanderer', BLOG_ADMIN_PASSWORD_HASH: '$2b$hash',
    BLOG_SESSION_SECRET: 'x'.repeat(32), BLOG_GIT_BRANCH: 'master',
    ...overrides
  };
}

test('readConfig resolves real paths and rejects overlapping repo/data roots', async () => {
  const { readConfig } = require('../server/config.js');
  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  const data = await mkdtemp(join(tmpdir(), 'wanderer-data-'));
  const nested = join(root, 'private');
  await mkdir(nested);
  const linked = join(data, 'linked-repo');
  await symlink(root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const config = readConfig(validEnv(root, data));
  assert.equal(config.repoDir, root);
  assert.equal(config.dataDir, data);
  for (const dataDir of [root, nested, join(root, '..', basename(root)), linked]) {
    assert.throws(() => readConfig(validEnv(root, dataDir)), /outside/i);
  }
});

test('readConfig only accepts decimal integer ports from 1 through 65535', async () => {
  const { readConfig } = require('../server/config.js');
  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  const data = await mkdtemp(join(tmpdir(), 'wanderer-data-'));
  for (const port of ['', '0', '65536', '1.5', '1e3']) {
    assert.throws(() => readConfig(validEnv(root, data, { PORT: port })), /PORT/);
  }
});

test('public server serves the allowlist and rejects real sensitive files and path bypasses', async () => {
  const { createApp } = require('../server/app.js');
  const root = await mkdtemp(join(tmpdir(), 'wanderer-site-'));
  await Promise.all(['posts', 'assets', 'music', 'server'].map(dir => mkdir(join(root, dir))));
  await writeFile(join(root, 'index.html'), 'public home');
  await writeFile(join(root, 'assets', 'image.txt'), 'public asset');
  for (const file of ['config.yml', 'school-calendar.JPG', 'AGENT.md', 'package.json']) {
    await writeFile(join(root, file), 'must stay private');
  }
  await writeFile(join(root, 'server', 'app.js'), 'must stay private');
  const app = createApp({ repoDir: root, env: 'test' }, { installAdmin: false });
  await request(app).get('/').expect(200, /public home/);
  await request(app).get('/assets/image.txt').expect(200);
  for (const url of ['/config.yml', '/school-calendar.JPG', '/AGENT.md', '/package.json',
    '/server/app.js', '/assets%2Fimage.txt', '/%70osts/article.md',
    '/assets/%2e%2e/config.yml', '/assets%5C..%5Cconfig.yml']) {
    await request(app).get(url).expect(404);
  }
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm init -y
npm install express express-session session-file-store bcryptjs helmet express-rate-limit "multer@^2.3.0"
npm install --save-dev supertest
node --test tests/server-config.test.mjs
```

Expected: FAIL against the original Task 1 implementation with sensitive files returning 200 and missing path/PORT exceptions.

- [ ] **Step 3: Implement validated configuration and the app shell**

```js
// server/config.js
const path = require('node:path');
const fs = require('node:fs');

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function existingDirectory(env, key) {
  const configuredPath = path.resolve(required(env, key));
  let realPath;
  try {
    realPath = fs.realpathSync.native(configuredPath);
    if (!fs.statSync(realPath).isDirectory()) throw new Error('not a directory');
  } catch (error) {
    throw new Error(`${key} must reference an existing directory`, { cause: error });
  }
  return { configuredPath, realPath };
}

function isWithin(baseDir, targetPath) {
  const relation = path.relative(baseDir, targetPath);
  return relation === '' || (relation !== '..'
    && !relation.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relation));
}

function pathsOverlap(firstPath, secondPath) {
  return isWithin(firstPath, secondPath) || isWithin(secondPath, firstPath);
}

function readConfig(env = process.env) {
  const repo = existingDirectory(env, 'BLOG_REPO_DIR');
  const data = existingDirectory(env, 'BLOG_DATA_DIR');
  if (pathsOverlap(repo.configuredPath, data.configuredPath)
      || pathsOverlap(repo.realPath, data.realPath)) {
    throw new Error('BLOG_DATA_DIR must remain outside BLOG_REPO_DIR');
  }
  const sessionSecret = required(env, 'BLOG_SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('BLOG_SESSION_SECRET must be at least 32 characters');
  const rawPort = env.PORT === undefined ? '3000' : String(env.PORT).trim();
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 through 65535');
  }
  return {
    env: env.NODE_ENV || 'development',
    port,
    repoDir: repo.realPath,
    dataDir: data.realPath,
    adminUsername: required(env, 'BLOG_ADMIN_USERNAME'),
    adminPasswordHash: required(env, 'BLOG_ADMIN_PASSWORD_HASH'),
    sessionSecret,
    gitBranch: env.BLOG_GIT_BRANCH || 'master'
  };
}

module.exports = { readConfig };
```

```js
// server/app.js
const express = require('express');
const helmet = require('helmet');
const path = require('node:path');
const { realpath, stat } = require('node:fs/promises');

const PUBLIC_ROOT_FILES = new Set([
  'index.html', 'projects.html', 'notes.html', 'post.html', 'styles.css',
  'script.js', 'blog.js', 'calendar.js', 'clock.js', 'liquid-glass.js', 'favicon.svg'
]);
const PUBLIC_DIRECTORIES = new Set(['posts', 'assets', 'music']);

function isWithin(baseDir, targetPath) {
  const relation = path.relative(baseDir, targetPath);
  return relation === '' || (relation !== '..'
    && !relation.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relation));
}

function selectPublicPath(rawUrl) {
  const rawPath = rawUrl.split('?', 1)[0];
  if (/%[0-9a-f]{2}/i.test(rawPath)) return null;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (!decodedPath.startsWith('/') || decodedPath.includes('\\') || decodedPath.includes('\0')) return null;
  if (decodedPath === '/') return { rootFile: 'index.html' };
  const segments = decodedPath.slice(1).split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  if (segments.length === 1 && PUBLIC_ROOT_FILES.has(segments[0])) return { rootFile: segments[0] };
  if (segments.length > 1 && PUBLIC_DIRECTORIES.has(segments[0])) {
    return { directory: segments[0], childSegments: segments.slice(1) };
  }
  return null;
}

function isMissingPath(error) {
  return ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code);
}

function installPublicFiles(app, repoDir) {
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const selected = selectPublicPath(req.originalUrl);
    if (!selected) return next();
    try {
      const repoReal = await realpath(repoDir);
      let allowedBase = repoReal;
      const candidate = path.join(repoDir, selected.rootFile || selected.directory,
        ...(selected.childSegments || []));
      if (selected.directory) {
        allowedBase = await realpath(path.join(repoDir, selected.directory));
        if (!isWithin(repoReal, allowedBase) || allowedBase === repoReal) return next();
      }
      const candidateReal = await realpath(candidate);
      if (!isWithin(allowedBase, candidateReal) || !(await stat(candidateReal)).isFile()) return next();
      return res.sendFile(candidateReal, error => {
        if (!error) return;
        if (isMissingPath(error)) return next();
        return next(error);
      });
    } catch (error) {
      if (isMissingPath(error)) return next();
      return next(error);
    }
  });
}

function createApp(config, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.env === 'production') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '256kb' }));
  if (options.installAdmin !== false && options.installAdmin) options.installAdmin(app);
  installPublicFiles(app, config.repoDir);
  app.use((req, res) => res.sendStatus(404));
  return app;
}

module.exports = { createApp, PUBLIC_ROOT_FILES, PUBLIC_DIRECTORIES };
```

```js
// server.js
const { readConfig } = require('./server/config.js');
const { createApp } = require('./server/app.js');

const config = readConfig();
const app = createApp(config);
app.listen(config.port, '127.0.0.1', () => {
  console.log(`Wanderer.OS listening on 127.0.0.1:${config.port}`);
});
```

Set `package.json` scripts to:

```json
{
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/*.test.mjs tests/site-smoke.mjs"
  },
  "engines": { "node": ">=20" }
}
```

Append these exact lines to `.gitignore`:

```gitignore
node_modules/
.env
.blog-private/
```

- [ ] **Step 4: Run the focused and existing tests**

Run:

```powershell
node --test tests/server-config.test.mjs tests/site-smoke.mjs
```

Expected: PASS; only allowlisted public files load, while unknown files, encoded paths, traversal, backslashes, and out-of-root links return 404.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json server.js server/config.js server/app.js tests/server-config.test.mjs .gitignore
git commit -m "feat: add secure Node site runtime"
```

---

### Task 2: Single-admin session, login, logout, and CSRF

**Files:**
- Create: `server/auth.js`
- Create: `admin/login.html`
- Create: `admin/login.js`
- Create: `admin/admin-api.js`
- Create: `tests/auth.test.mjs`
- Modify: `server/app.js`

- [ ] **Step 1: Write failing authentication-boundary tests**

```js
// tests/auth.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
const require = createRequire(import.meta.url);
const { createApp } = require('../server/app.js');

async function makeApp() {
  const repoDir = await mkdtemp(join(tmpdir(), 'wanderer-auth-site-'));
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-auth-data-'));
  return createApp({ env: 'test', repoDir, dataDir, adminUsername: 'wanderer',
    adminPasswordHash: 'test-hash', sessionSecret: 'x'.repeat(32), gitBranch: 'master' },
  { passwordCompare: async value => value === 'correct' });
}

async function loggedInAgent() {
  const agent = request.agent(await makeApp());
  const session = await agent.get('/api/admin/session').expect(200);
  const login = await agent.post('/api/admin/login').set('x-csrf-token', session.body.csrfToken)
    .send({ username: 'wanderer', password: 'correct' }).expect(200);
  return { agent, csrfToken: login.body.csrfToken };
}

test('admin session requires CSRF and hides protected APIs before login', async () => {
  const app = await makeApp();
  const agent = request.agent(app);
  const session = await agent.get('/api/admin/session').expect(200);
  assert.equal(session.body.authenticated, false);
  await agent.get('/api/admin/posts').expect(401);
  await agent.post('/api/admin/login').send({ username: 'wanderer', password: 'correct' }).expect(403);
  await agent.post('/api/admin/login').set('x-csrf-token', session.body.csrfToken)
    .send({ username: 'wanderer', password: 'correct' }).expect(200);
  await agent.get('/api/admin/posts').expect(200);
});

test('logout destroys the authenticated session', async () => {
  const { agent, csrfToken } = await loggedInAgent();
  await agent.post('/api/admin/logout').set('x-csrf-token', csrfToken).expect(204);
  await agent.get('/api/admin/posts').expect(401);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/auth.test.mjs`

Expected: FAIL because `/api/admin/session` and the auth middleware do not exist.

- [ ] **Step 3: Implement server-side sessions and constant-time CSRF comparison**

```js
// server/auth.js
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

function token() { return crypto.randomBytes(32).toString('base64url'); }
function sameToken(left = '', right = '') {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createAuth(config, options = {}) {
  const compare = options.passwordCompare || bcrypt.compare;
  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  const ensureCsrf = (req, _res, next) => { req.session.csrfToken ||= token(); next(); };
  const requireCsrf = (req, res, next) => sameToken(req.get('x-csrf-token'), req.session.csrfToken)
    ? next() : res.status(403).json({ error: 'CSRF_TOKEN_INVALID' });
  const requireAuth = (req, res, next) => req.session.authenticated === true
    ? next() : res.status(401).json({ error: 'AUTH_REQUIRED' });

  async function login(req, res, next) {
    try {
      const validUser = req.body.username === config.adminUsername;
      const validPassword = await compare(req.body.password || '', config.adminPasswordHash);
      if (!validUser || !validPassword) return res.status(401).json({ error: 'LOGIN_FAILED' });
      req.session.regenerate(error => {
        if (error) return next(error);
        req.session.authenticated = true;
        req.session.csrfToken = token();
        res.json({ authenticated: true, csrfToken: req.session.csrfToken });
      });
    } catch (error) { next(error); }
  }
  return { ensureCsrf, requireCsrf, requireAuth, login, loginLimiter };
}

module.exports = { createAuth };
```

In `server/app.js`, install `express-session` with a file-backed store under `BLOG_DATA_DIR/sessions`, `resave: false`, `saveUninitialized: false`, cookie name `wanderer.admin`, `httpOnly: true`, `sameSite: 'strict'`, an eight-hour `maxAge`, and `secure: config.env === 'production'`. Register:

```js
app.get('/api/admin/session', auth.ensureCsrf, (req, res) => res.json({
  authenticated: req.session.authenticated === true,
  csrfToken: req.session.csrfToken
}));
app.post('/api/admin/login', auth.loginLimiter, auth.ensureCsrf, auth.requireCsrf, auth.login);
app.post('/api/admin/logout', auth.requireAuth, auth.requireCsrf, (req, res, next) => {
  req.session.destroy(error => error ? next(error) : res.sendStatus(204));
});
app.get('/api/admin/posts', auth.requireAuth, (_req, res) => res.json({ posts: [] }));
```

`admin/admin-api.js` must fetch the session first and attach the returned token to every POST, PUT, PATCH, and DELETE request. `admin/login.js` posts credentials without storing them and redirects to `/admin` only after a successful response.

- [ ] **Step 4: Run auth and regression tests**

Run: `node --test tests/auth.test.mjs tests/server-config.test.mjs tests/site-smoke.mjs`

Expected: PASS; unauthenticated API requests return 401 and missing CSRF returns 403.

- [ ] **Step 5: Commit**

```powershell
git add server/auth.js server/app.js admin/login.html admin/login.js admin/admin-api.js tests/auth.test.mjs
git commit -m "feat: protect blog admin sessions"
```

---

### Task 3: Private draft model and atomic storage

**Files:**
- Create: `server/content-model.js`
- Create: `server/draft-store.js`
- Create: `tests/draft-store.test.mjs`

- [ ] **Step 1: Write failing draft tests**

```js
// tests/draft-store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);

test('draft CRUD preserves Markdown and increments optimistic version', async () => {
  const { createDraftStore } = require('../server/draft-store.js');
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-drafts-'));
  const store = createDraftStore({ dataDir });
  const draft = await store.create({ module: 'learning' });
  const saved = await store.update(draft.id, {
    version: 1, title: 'Node 学习记录', slug: 'node-learning', module: 'learning',
    excerpt: '记录服务端学习过程。', tags: ['Node'], body: '## 第一节\n\n正文'
  });
  assert.equal(saved.version, 2);
  assert.match((await store.get(draft.id)).body, /## 第一节/);
  await assert.rejects(() => store.update(draft.id, { ...saved, version: 1 }), /VERSION_CONFLICT/);
});

test('a published article can seed a private revision draft', async () => {
  const { createDraftStore } = require('../server/draft-store.js');
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-revision-'));
  const store = createDraftStore({ dataDir });
  const draft = await store.create({ title: '已发布文章', slug: 'published-post', module: 'insights',
    excerpt: '公开摘要', tags: ['Method'], body: '## 原正文', sourceSlug: 'published-post' });
  assert.equal(draft.sourceSlug, 'published-post');
  assert.equal(draft.status, 'draft');
  assert.match(draft.body, /原正文/);
});

test('draft identifiers and slugs cannot traverse paths', async () => {
  const { validateSlug, validateDraftId } = require('../server/content-model.js');
  assert.throws(() => validateSlug('../secret'), /SLUG_INVALID/);
  assert.throws(() => validateDraftId('../../secret'), /DRAFT_ID_INVALID/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/draft-store.test.mjs`

Expected: FAIL with missing `server/draft-store.js`.

- [ ] **Step 3: Implement the content model and atomic JSON draft store**

```js
// server/content-model.js
const MODULES = Object.freeze(['projects', 'insights', 'learning']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRAFT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateSlug(value) {
  if (!SLUG.test(value || '')) throw Object.assign(new Error('SLUG_INVALID'), { code: 'SLUG_INVALID' });
  return value;
}
function validateDraftId(value) {
  if (!DRAFT_ID.test(value || '')) throw Object.assign(new Error('DRAFT_ID_INVALID'), { code: 'DRAFT_ID_INVALID' });
  return value;
}
function validateModule(value) {
  if (!MODULES.includes(value)) throw Object.assign(new Error('MODULE_INVALID'), { code: 'MODULE_INVALID' });
  return value;
}
module.exports = { MODULES, validateSlug, validateDraftId, validateModule };
```

```js
// server/draft-store.js
const { randomUUID } = require('node:crypto');
const { mkdir, readFile, readdir, rename, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { validateDraftId, validateModule, validateSlug } = require('./content-model.js');

async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

function createDraftStore({ dataDir, now = () => new Date().toISOString() }) {
  const root = path.join(dataDir, 'drafts');
  const fileFor = id => path.join(root, `${validateDraftId(id)}.json`);
  async function create(input = {}) {
    await mkdir(root, { recursive: true });
    const stamp = now();
    const draft = { id: randomUUID(), version: 1, status: 'draft', title: input.title || '',
      slug: input.slug || '', module: validateModule(input.module || 'projects'), excerpt: input.excerpt || '',
      tags: Array.isArray(input.tags) ? input.tags : [], cover: input.cover || '', body: input.body || '',
      sourceSlug: input.sourceSlug || null, createdAt: input.createdAt || stamp, updatedAt: stamp,
      publishedAt: input.publishedAt || null, syncStatus: 'private' };
    if (draft.slug) validateSlug(draft.slug);
    await atomicJson(fileFor(draft.id), draft);
    return draft;
  }
  async function get(id) { return JSON.parse(await readFile(fileFor(id), 'utf8')); }
  async function update(id, input) {
    const current = await get(id);
    if (Number(input.version) !== current.version) throw new Error('VERSION_CONFLICT');
    if (input.slug) validateSlug(input.slug);
    const next = { ...current, ...input, id: current.id, version: current.version + 1,
      module: validateModule(input.module), updatedAt: now() };
    await atomicJson(fileFor(id), next);
    return next;
  }
  async function list() {
    await mkdir(root, { recursive: true });
    return Promise.all((await readdir(root)).filter(name => name.endsWith('.json'))
      .map(name => get(name.slice(0, -5))));
  }
  return { create, get, update, list };
}
module.exports = { createDraftStore };
```

Wrap `get` so an `ENOENT` filesystem error becomes an error with `code: 'DRAFT_NOT_FOUND'`; API callers must never receive the private absolute filename.

- [ ] **Step 4: Run draft tests**

Run: `node --test tests/draft-store.test.mjs`

Expected: PASS, including the stale-version and traversal cases.

- [ ] **Step 5: Commit**

```powershell
git add server/content-model.js server/draft-store.js tests/draft-store.test.mjs
git commit -m "feat: add private blog draft storage"
```

---

### Task 4: Safe image staging and Markdown media rewrite

**Files:**
- Create: `server/media-store.js`
- Create: `tests/media-store.test.mjs`

- [ ] **Step 1: Write failing image validation and staging tests**

```js
// tests/media-store.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

test('detectImage accepts signatures rather than trusting names', () => {
  const { detectImage } = require('../server/media-store.js');
  assert.deepEqual(detectImage(png), { extension: 'png', mime: 'image/png' });
  assert.throws(() => detectImage(Buffer.from('<svg><script>')), /IMAGE_TYPE_INVALID/);
});

test('staged media URL is rewritten to the published article directory', () => {
  const { rewriteDraftMediaUrls } = require('../server/media-store.js');
  const body = '![结构图](/api/admin/media/11111111-1111-4111-8111-111111111111/image.png)';
  assert.equal(rewriteDraftMediaUrls(body, '11111111-1111-4111-8111-111111111111', 'site-log'),
    '![结构图](assets/blog/site-log/image.png)');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/media-store.test.mjs`

Expected: FAIL because `detectImage` is undefined or the module is missing.

- [ ] **Step 3: Implement signature detection, limits, staging, and publication**

```js
// server/media-store.js
const { randomUUID } = require('node:crypto');
const { copyFile, mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { validateDraftId, validateSlug } = require('./content-model.js');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
function detectImage(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return { extension: 'png', mime: 'image/png' };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: 'jpg', mime: 'image/jpeg' };
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return { extension: 'webp', mime: 'image/webp' };
  throw new Error('IMAGE_TYPE_INVALID');
}

function rewriteDraftMediaUrls(body, draftId, slug) {
  const prefix = `/api/admin/media/${validateDraftId(draftId)}/`;
  return body.split(prefix).join(`assets/blog/${validateSlug(slug)}/`);
}

function validateMediaName(name) {
  if (!/^[0-9a-f-]+\.(?:png|jpg|webp)$/i.test(name || '')) throw new Error('IMAGE_NAME_INVALID');
  return name;
}

function createMediaStore({ dataDir, repoDir }) {
  async function stage(draftId, buffer) {
    validateDraftId(draftId);
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_SIZE_INVALID');
    const type = detectImage(buffer);
    const name = `${randomUUID()}.${type.extension}`;
    const directory = path.join(dataDir, 'media', draftId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), buffer, { flag: 'wx' });
    return { name, mime: type.mime, url: `/api/admin/media/${draftId}/${name}` };
  }
  async function publish(draftId, slug, names) {
    const destination = path.join(repoDir, 'assets', 'blog', validateSlug(slug));
    await mkdir(destination, { recursive: true });
    for (const name of names) {
      validateMediaName(name);
      await copyFile(path.join(dataDir, 'media', validateDraftId(draftId), name), path.join(destination, name));
    }
    return destination;
  }
  return { stage, publish, readPrivate: (id, name) => readFile(path.join(dataDir, 'media', validateDraftId(id), validateMediaName(name))) };
}
module.exports = { MAX_IMAGE_BYTES, createMediaStore, detectImage, rewriteDraftMediaUrls, validateMediaName };
```

Configure Multer with `memoryStorage()`, `fileSize: MAX_IMAGE_BYTES`, `files: 1`, `fields: 2`, and `parts: 3`. Do not trust Multer's MIME value; call `detectImage(req.file.buffer)` before writing.

- [ ] **Step 4: Run media tests**

Run: `node --test tests/media-store.test.mjs tests/draft-store.test.mjs`

Expected: PASS; SVG-like content and oversized buffers are rejected.

- [ ] **Step 5: Commit**

```powershell
git add server/media-store.js tests/media-store.test.mjs
git commit -m "feat: stage safe blog images"
```

---

### Task 5: Migrate published metadata to three modules

**Files:**
- Modify: `posts/index.json`
- Modify: `blog.js`
- Modify: `tests/blog.test.mjs`
- Modify: `tests/blog-content.test.mjs`

- [ ] **Step 1: Add failing public-model tests**

```js
test('public posts use one of the three stable modules and ISO creation time', () => {
  const posts = Blog.normalizePosts([{ slug: 'one', title: 'One', module: 'projects',
    createdAt: '2026-09-06T14:32:08+08:00', excerpt: 'x', content: 'posts/one.md' }]);
  assert.equal(posts[0].module, 'projects');
  assert.equal(posts[0].createdAt, '2026-09-06T14:32:08+08:00');
  assert.deepEqual(Blog.filterPostsByModule(posts, 'projects'), posts);
  assert.deepEqual(Blog.filterPostsByModule(posts, 'unknown'), []);
});

test('published index contains only supported module values', async () => {
  const index = JSON.parse(await readFile('posts/index.json', 'utf8'));
  assert.ok(index.every(post => ['projects', 'insights', 'learning'].includes(post.module)));
  assert.ok(index.every(post => !Number.isNaN(Date.parse(post.createdAt))));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/blog.test.mjs tests/blog-content.test.mjs`

Expected: FAIL because current records contain `category` and `date`, not `module` and `createdAt`.

- [ ] **Step 3: Add module constants and migrate existing records**

Add to the public `Blog` API:

```js
const BLOG_MODULES = Object.freeze([
  { id: 'projects', label: '我的项目', signal: 'PROJECT ARCHIVE', description: '记录正在制作的东西、实现过程与阶段成果。' },
  { id: 'insights', label: '心得分享', signal: 'INSIGHT LOG', description: '整理实践后的判断、方法和值得留下的想法。' },
  { id: 'learning', label: '日常学习', signal: 'LEARNING ORBIT', description: '保存近期学过并真正理解的知识。' }
]);
const findModule = id => BLOG_MODULES.find(module => module.id === id) || null;
const filterPostsByModule = (posts, id) => findModule(id) ? posts.filter(post => post.module === id) : [];
```

Update `normalizePost` and `sortPosts` to require a supported `module`, parse `createdAt`, retain `updatedAt`/`publishedAt`, and sort by `createdAt`. Migrate the examples:

- `small-projects` → `projects`
- `visible-steps` → `insights`
- `first-orbit` → `learning`

Use ISO timestamps with `+08:00`; do not keep duplicate `category` or `date` fields.

- [ ] **Step 4: Run public model tests**

Run: `node --test tests/blog.test.mjs tests/blog-content.test.mjs`

Expected: PASS with all three module values represented.

- [ ] **Step 5: Commit**

```powershell
git add posts/index.json blog.js tests/blog.test.mjs tests/blog-content.test.mjs
git commit -m "feat: organize posts into three modules"
```

---

### Task 6: Public module landing, filtered list, and article metadata

**Files:**
- Modify: `notes.html`
- Modify: `index.html`
- Modify: `post.html`
- Modify: `blog.js`
- Modify: `styles.css`
- Modify: `tests/site-smoke.mjs`
- Modify: `tests/blog.test.mjs`

- [ ] **Step 1: Add failing DOM-contract and route tests**

```js
test('public blog exposes three module cards and a filtered published list', async () => {
  const html = await read('notes.html');
  assert.match(html, /data-blog-modules/);
  assert.match(html, /data-blog-module-current/);
  assert.match(html, /我的项目/);
  assert.match(html, /心得分享/);
  assert.match(html, /日常学习/);
});

test('module route resolves only known modules', () => {
  assert.equal(Blog.getBlogModule('?module=projects'), 'projects');
  assert.equal(Blog.getBlogModule('?module=unknown'), null);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/blog.test.mjs tests/site-smoke.mjs`

Expected: FAIL because the module hooks and `getBlogModule` do not exist.

- [ ] **Step 3: Implement the public hierarchy**

Add the following structure to `notes.html`:

```html
<section class="blog-modules container" aria-labelledby="blog-modules-title">
  <div class="section-heading"><div><span class="section-label">Three orbital archives</span><h2 id="blog-modules-title">选择一条记录轨道。</h2></div></div>
  <div class="blog-module-grid" data-blog-modules></div>
</section>
<section class="blog-module-list container" data-blog-module-section hidden aria-labelledby="blog-module-title">
  <a class="text-link" href="notes.html">← 返回全部模块</a>
  <div class="section-heading"><div><span data-blog-module-signal></span><h2 id="blog-module-title" data-blog-module-current></h2></div><p data-blog-module-description></p></div>
  <div class="blog-list" data-blog-list></div>
</section>
```

Implement:

```js
function getBlogModule(search = window.location.search) {
  const id = new URLSearchParams(search).get('module');
  return findModule(id) ? id : null;
}
function moduleHref(id) { return `notes.html?module=${encodeURIComponent(id)}`; }
```

On `notes.html` without a module, render all three cards with published counts. With a valid module, hide the overview, render only matching posts, and update the heading. Invalid modules render a readable error and a return link. Keep every article card as one semantic anchor to `post.html?slug=...`.

Add module label and `createdAt` to home cards and article metadata. Add CSS for a three-card orbital grid, list rows, clear focus states, one-column mobile layout, and `prefers-reduced-motion`; preserve the existing no-halo and no-downward-shift rules.

- [ ] **Step 4: Run public tests and full static regression**

Run: `node --test tests/blog.test.mjs tests/blog-content.test.mjs tests/site-smoke.mjs`

Expected: PASS; unknown modules do not expose unfiltered content.

- [ ] **Step 5: Commit**

```powershell
git add notes.html index.html post.html blog.js styles.css tests/blog.test.mjs tests/site-smoke.mjs
git commit -m "feat: add public blog module navigation"
```

---

### Task 7: Shell-free Git publisher and publication coordinator

**Files:**
- Create: `server/git-publisher.js`
- Create: `server/publish-service.js`
- Create: `tests/git-publisher.test.mjs`
- Create: `tests/publish-service.test.mjs`

- [ ] **Step 1: Write failing Git command and publication tests**

```js
// tests/git-publisher.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createGitPublisher } = require('../server/git-publisher.js');

test('publisher serializes exact scoped Git arguments without a shell', async () => {
  const calls = [];
  const run = async args => { calls.push(args); return args[0] === 'rev-parse' ? 'abc123\n' : ''; };
  const publisher = createGitPublisher({ repoDir: '/repo', branch: 'master', run });
  const result = await publisher.commitAndPush({
    paths: ['posts/site-log.md', 'posts/index.json', 'assets/blog/site-log/image.png'],
    message: 'blog: publish 个人网站重构日志'
  });
  assert.deepEqual(calls, [
    ['fetch', 'origin', 'master'], ['merge-base', '--is-ancestor', 'origin/master', 'HEAD'],
    ['add', '--', 'posts/site-log.md', 'posts/index.json', 'assets/blog/site-log/image.png'],
    ['commit', '-m', 'blog: publish 个人网站重构日志'], ['rev-parse', 'HEAD'],
    ['push', 'origin', 'HEAD:master']
  ]);
  assert.equal(result.commit, 'abc123');
});
```

```js
// tests/publish-service.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { createPublishService } = require('../server/publish-service.js');

test('publishing writes Markdown and index, then commits only public files', async () => {
  const repoDir = await mkdtemp(join(tmpdir(), 'wanderer-publish-'));
  await mkdir(join(repoDir, 'posts'));
  await writeFile(join(repoDir, 'posts', 'index.json'), '[]\n');
  const draft = { id: '11111111-1111-4111-8111-111111111111', version: 2, title: '项目日志',
    slug: 'site-log', module: 'projects', excerpt: '项目摘要', tags: ['Project'], cover: '',
    body: '## 正文', createdAt: '2026-09-06T14:32:08+08:00' };
  let gitInput;
  const service = createPublishService({ repoDir, now: () => '2026-09-06T15:00:00+08:00',
    draftStore: { get: async () => draft, update: async (_id, value) => value },
    mediaStore: { publish: async () => [] },
    gitPublisher: { commitAndPush: async input => { gitInput = input; return { commit: 'abc123' }; } } });
  const result = await service.publish(draft.id);
  assert.match(await readFile(join(repoDir, 'posts', 'site-log.md'), 'utf8'), /## 正文/);
  const index = JSON.parse(await readFile(join(repoDir, 'posts', 'index.json'), 'utf8'));
  assert.equal(index[0].module, 'projects');
  assert.deepEqual(result.paths.sort(), ['posts/index.json', 'posts/site-log.md'].sort());
  assert.deepEqual(gitInput.paths.sort(), result.paths.sort());
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/git-publisher.test.mjs tests/publish-service.test.mjs`

Expected: FAIL with missing publisher modules.

- [ ] **Step 3: Implement queued Git and publication transaction**

```js
// server/git-publisher.js
const { spawn } = require('node:child_process');

function spawnGit(repoDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoDir, shell: false, windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim())
      : reject(Object.assign(new Error(stderr.trim() || `git exited ${code}`), { code: 'GIT_FAILED', args })));
  });
}

function createGitPublisher({ repoDir, branch, run = args => spawnGit(repoDir, args) }) {
  let queue = Promise.resolve();
  function serialize(operation) { const next = queue.then(operation, operation); queue = next.catch(() => {}); return next; }
  return {
    commitAndPush(input) {
      return serialize(async () => {
        await run(['fetch', 'origin', branch]);
        await run(['merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD']);
        await run(['add', '--', ...input.paths]);
        await run(['commit', '-m', input.message]);
        const commit = await run(['rev-parse', 'HEAD']);
        try { await run(['push', 'origin', `HEAD:${branch}`]); }
        catch (error) { error.code = 'GIT_PUSH_PENDING'; error.commit = commit; throw error; }
        return { commit };
      });
    },
    retryPush() { return serialize(() => run(['push', 'origin', `HEAD:${branch}`])); }
  };
}
module.exports = { createGitPublisher, spawnGit };
```

`server/publish-service.js` must validate required fields, rewrite private media URLs, atomically write the Markdown and index, call `mediaStore.publish`, then call `gitPublisher.commitAndPush`. Only relative paths beneath `posts/` and `assets/blog/<slug>/` may enter the Git path list. On `GIT_PUSH_PENDING`, update the private draft to `syncStatus: 'pending'` with the Commit ID; on success set `status: 'published'`, `syncStatus: 'synced'`, and `publishedAt`.

- [ ] **Step 4: Run publisher and content regressions**

Run: `node --test tests/git-publisher.test.mjs tests/publish-service.test.mjs tests/blog-content.test.mjs`

Expected: PASS; tests prove no shell is used and private draft paths are never staged.

- [ ] **Step 5: Commit**

```powershell
git add server/git-publisher.js server/publish-service.js tests/git-publisher.test.mjs tests/publish-service.test.mjs
git commit -m "feat: publish blog posts through Git"
```

---

### Task 8: Protected admin CRUD, upload, preview, publish, and retry API

**Files:**
- Create: `server/admin-api.js`
- Create: `tests/admin-api.test.mjs`
- Create: `tests/helpers/admin-fixture.mjs`
- Modify: `server/app.js`

- [ ] **Step 1: Write failing API integration tests**

```js
// tests/admin-api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import request from 'supertest';
import { createAdminFixture, pngFixture } from './helpers/admin-fixture.mjs';
const require = createRequire(import.meta.url);

test('authenticated admin can create, save, upload, and publish a draft', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const created = await agent.post('/api/admin/posts').set('x-csrf-token', csrfToken)
    .send({ module: 'projects' }).expect(201);
  const id = created.body.post.id;
  await agent.put(`/api/admin/posts/${id}`).set('x-csrf-token', csrfToken).send({
    version: 1, title: '项目日志', slug: 'project-log', module: 'projects',
    excerpt: '项目摘要', tags: ['Project'], body: '## 正文'
  }).expect(200);
  await agent.post(`/api/admin/posts/${id}/media`).set('x-csrf-token', csrfToken)
    .attach('image', pngFixture, 'fake.svg').expect(201);
  await agent.post(`/api/admin/posts/${id}/publish`).set('x-csrf-token', csrfToken).expect(200);
  const revision = await agent.post('/api/admin/posts/project-log/revise')
    .set('x-csrf-token', csrfToken).expect(201);
  assert.equal(revision.body.post.sourceSlug, 'project-log');
});

test('draft and media routes stay private', async () => {
  const { app } = await createAdminFixture();
  await request(app).get('/api/admin/posts').expect(401);
  await request(app).get('/api/admin/media/11111111-1111-4111-8111-111111111111/image.png').expect(401);
  await request(app).post('/api/admin/posts').expect(401);
});
```

Create `tests/helpers/admin-fixture.mjs` with temporary repository/data directories, the Task 1 `createApp`, the real draft/media stores, a fake Git publisher returning `{ commit: 'fixture-commit' }`, and this login helper:

```js
export const pngFixture = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

export async function createAdminFixture() {
  const repoDir = await mkdtemp(join(tmpdir(), 'wanderer-api-site-'));
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-api-data-'));
  await mkdir(join(repoDir, 'posts'));
  await writeFile(join(repoDir, 'posts', 'index.json'), '[]\n');
  const config = { env: 'test', repoDir, dataDir, adminUsername: 'wanderer',
    adminPasswordHash: 'fixture-hash', sessionSecret: 'x'.repeat(32), gitBranch: 'master' };
  const app = createApp(config, {
    passwordCompare: async value => value === 'correct',
    gitPublisher: { commitAndPush: async () => ({ commit: 'fixture-commit' }), retryPush: async () => {} }
  });
  return { app, repoDir, dataDir, async login() {
    const agent = request.agent(app);
    const session = await agent.get('/api/admin/session');
    const login = await agent.post('/api/admin/login').set('x-csrf-token', session.body.csrfToken)
      .send({ username: 'wanderer', password: 'correct' });
    return { agent, csrfToken: login.body.csrfToken };
  } };
}
```

The helper file imports `mkdtemp`, `mkdir`, and `writeFile` from `node:fs/promises`, `tmpdir` from `node:os`, `join` from `node:path`, Supertest, and `createApp` through `createRequire`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/admin-api.test.mjs`

Expected: FAIL because CRUD and upload routes are missing.

- [ ] **Step 3: Implement the protected router**

`server/admin-api.js` must register these exact contracts behind `requireAuth`; mutation routes also require `requireCsrf`:

```text
GET    /api/admin/posts                 -> { posts }
POST   /api/admin/posts                 -> 201 { post }
POST   /api/admin/posts/:slug/revise    -> 201 { post }
GET    /api/admin/posts/:id             -> { post }
PUT    /api/admin/posts/:id             -> { post }
GET    /api/admin/media/:id/:name       -> private image bytes
POST   /api/admin/posts/:id/media       -> 201 { asset, markdown }
POST   /api/admin/posts/:id/publish     -> { post, commit, syncStatus }
POST   /api/admin/sync                  -> { syncStatus: "synced" }
```

`GET /api/admin/posts` merges private drafts with records from `posts/index.json`; public records are returned as `status: 'published'` without exposing a private path. `POST /api/admin/posts/:slug/revise` validates the slug against the published index, reads its Markdown file through the indexed `content` field, and seeds a private draft with `sourceSlug`. Editing a published row always calls this revision endpoint first, so the public file stays unchanged until republishing.

Use Multer memory storage with the Task 4 limits. Return stable JSON errors:

```js
function sendError(error, res) {
  const status = {
    AUTH_REQUIRED: 401, CSRF_TOKEN_INVALID: 403, DRAFT_NOT_FOUND: 404,
    VERSION_CONFLICT: 409, SLUG_CONFLICT: 409, IMAGE_TYPE_INVALID: 415,
    IMAGE_SIZE_INVALID: 413, GIT_PUSH_PENDING: 502
  }[error.code] || 500;
  res.status(status).json({ error: error.code || 'INTERNAL_ERROR', message: safeMessage(error) });
}
```

Do not include stack traces, filesystem paths, Git remote URLs, command output, or environment values in client responses.

- [ ] **Step 4: Run API, auth, media, and publisher tests**

Run: `node --test tests/admin-api.test.mjs tests/auth.test.mjs tests/media-store.test.mjs tests/publish-service.test.mjs`

Expected: PASS with 401/403/409/413/415 mappings asserted.

- [ ] **Step 5: Commit**

```powershell
git add server/admin-api.js server/app.js tests/admin-api.test.mjs tests/helpers/admin-fixture.mjs
git commit -m "feat: add protected blog management API"
```

---

### Task 9: Private dashboard UI

**Files:**
- Create: `admin/index.html`
- Create: `admin/dashboard.js`
- Create: `admin/admin-model.js`
- Create: `admin/admin.css`
- Create: `tests/admin-ui.test.mjs`
- Modify: `server/app.js`

- [ ] **Step 1: Write failing dashboard-model and markup tests**

```js
// tests/admin-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const AdminModel = require('../admin/admin-model.js');
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard filters posts by module, status, and query', () => {
  const posts = [
    { title: '项目日志', excerpt: '网站', module: 'projects', status: 'draft' },
    { title: '学习记录', excerpt: 'Node', module: 'learning', status: 'published' }
  ];
  assert.deepEqual(AdminModel.filterPosts(posts, { module: 'learning', status: 'published', query: 'node' }), [posts[1]]);
});

test('dashboard page exposes private archive controls', async () => {
  const html = await read('admin/index.html');
  for (const hook of ['data-admin-posts', 'data-admin-query', 'data-admin-module', 'data-admin-status', 'data-admin-new']) {
    assert.match(html, new RegExp(hook));
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/admin-ui.test.mjs`

Expected: FAIL because `admin/index.html` and `admin/admin-model.js` do not exist.

- [ ] **Step 3: Implement the dashboard**

`admin/admin-model.js` must expose a UMD/CommonJS API with:

```js
function filterPosts(posts, filters) {
  const query = filters.query.trim().toLocaleLowerCase('zh-CN');
  return posts.filter(post => (!filters.module || post.module === filters.module)
    && (!filters.status || post.status === filters.status)
    && (!query || `${post.title} ${post.excerpt}`.toLocaleLowerCase('zh-CN').includes(query)));
}
```

Build `admin/index.html` with the approved sidebar modules, draft/published/sync-pending counts, search, filters, list, loading/empty/error states, logout, and “新建文章”. `dashboard.js` loads `/api/admin/posts`, renders text with DOM properties rather than interpolated HTML, and sends new drafts to `/admin/editor?id=<uuid>`. Clicking a published row first calls `POST /api/admin/posts/:slug/revise`, then opens the returned private draft ID; clicking an existing draft opens it directly.

In `server/app.js`, serve `/admin/login` publicly, but protect `/admin` and `/admin/editor` with an HTML auth guard that redirects unauthenticated browsers to `/admin/login`. Admin CSS/JS files may be static; all data remains API-protected.

- [ ] **Step 4: Run dashboard and server tests**

Run: `node --test tests/admin-ui.test.mjs tests/auth.test.mjs tests/admin-api.test.mjs`

Expected: PASS; the dashboard HTML route redirects before login and loads after login.

- [ ] **Step 5: Commit**

```powershell
git add admin/index.html admin/dashboard.js admin/admin-model.js admin/admin.css server/app.js tests/admin-ui.test.mjs
git commit -m "feat: add private blog dashboard"
```

---

### Task 10: Markdown editor, private preview, autosave, and image insertion

**Files:**
- Create: `admin/editor.html`
- Create: `admin/editor.js`
- Modify: `admin/admin-model.js`
- Modify: `admin/admin.css`
- Modify: `tests/admin-ui.test.mjs`
- Modify: `server/app.js`

- [ ] **Step 1: Add failing editor behavior tests**

```js
test('editor inserts uploaded Markdown at the current selection', () => {
  assert.deepEqual(AdminModel.insertMarkdown('before after', 7, 7, '![结构图](/private/image.png)'), {
    value: 'before ![结构图](/private/image.png)after',
    cursor: 33
  });
});

test('editor normalizes tags and detects publish requirements', () => {
  const post = AdminModel.normalizeEditorPayload({ title: ' 项目日志 ', slug: 'project-log',
    module: 'projects', excerpt: ' 摘要 ', tags: 'Web, Design,Web', body: '## 正文' });
  assert.deepEqual(post.tags, ['Web', 'Design']);
  assert.deepEqual(AdminModel.validateForPublish(post), []);
});

test('editor page exposes Markdown, preview, upload, and publication controls', async () => {
  const html = await read('admin/editor.html');
  for (const hook of ['data-editor-body', 'data-editor-preview', 'data-editor-upload',
    'data-editor-save', 'data-editor-publish', 'data-editor-status']) assert.match(html, new RegExp(hook));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/admin-ui.test.mjs`

Expected: FAIL because editor functions and markup are missing.

- [ ] **Step 3: Implement pure editor helpers and the approved UI**

Add to `admin/admin-model.js`:

```js
function insertMarkdown(value, start, end, markdown) {
  const next = `${value.slice(0, start)}${markdown}${value.slice(end)}`;
  return { value: next, cursor: start + markdown.length };
}
function normalizeEditorPayload(fields) {
  const tags = [...new Set(String(fields.tags || '').split(',').map(tag => tag.trim()).filter(Boolean))].slice(0, 10);
  return { title: fields.title.trim(), slug: fields.slug.trim(), module: fields.module,
    excerpt: fields.excerpt.trim(), tags, cover: fields.cover || '', body: fields.body };
}
function validateForPublish(post) {
  return [['title', post.title], ['slug', post.slug], ['module', post.module], ['excerpt', post.excerpt], ['body', post.body.trim()]]
    .filter(([, value]) => !value).map(([field]) => field);
}
```

`admin/editor.html` must implement the approved top action bar, metadata fields, Markdown textarea, live preview, cover/body upload controls, private-state indicator, and accessible status region. `editor.js` must:

- Load the draft ID only through `new URLSearchParams(location.search).get('id')`.
- Render preview through the existing safe `Blog.renderMarkdown` function.
- Debounce autosave by 1.5 seconds and include the current optimistic `version`.
- Set dirty state on user input and clear it only after a successful response.
- Add `beforeunload` only while dirty.
- Accept drop, paste, and file-picker images.
- Ask for image alt text, upload with `FormData`, and insert returned Markdown at the selection.
- Disable publish during upload/save/publish operations.
- Show field-level validation without clearing input.
- Redirect to the public article only after `syncStatus === 'synced'`; otherwise show the retry-sync action.

- [ ] **Step 4: Run editor, API, and public regressions**

Run: `node --test tests/admin-ui.test.mjs tests/admin-api.test.mjs tests/blog.test.mjs tests/site-smoke.mjs`

Expected: PASS; no admin hook appears on public pages and preview output remains escaped.

- [ ] **Step 5: Commit**

```powershell
git add admin/editor.html admin/editor.js admin/admin-model.js admin/admin.css server/app.js tests/admin-ui.test.mjs
git commit -m "feat: add Markdown blog editor"
```

---

### Task 11: Password setup, deployment, backup, and final acceptance

**Files:**
- Create: `.env.example`
- Create: `scripts/hash-password.js`
- Create: `deploy/nginx.conf.example`
- Create: `deploy/personal-website.service.example`
- Modify: `README.md`
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: Add failing operations-documentation tests**

```js
test('operations docs define secure admin deployment without secrets', async () => {
  for (const path of ['.env.example', 'scripts/hash-password.js', 'deploy/nginx.conf.example',
    'deploy/personal-website.service.example']) assert.equal(await exists(path), true, `${path} is missing`);
  const env = await read('.env.example');
  assert.match(env, /BLOG_ADMIN_PASSWORD_HASH=/);
  assert.match(env, /BLOG_SESSION_SECRET=/);
  assert.doesNotMatch(env, /jianhaolin03|BEGIN OPENSSH PRIVATE KEY|password123/i);
  const readme = await read('README.md');
  assert.match(readme, /BLOG_DATA_DIR/);
  assert.match(readme, /npm start/);
  assert.match(readme, /草稿备份/);
  assert.match(readme, /待同步/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/site-smoke.mjs`

Expected: FAIL because deployment artifacts and instructions do not exist.

- [ ] **Step 3: Add secure setup and deployment artifacts**

`.env.example` must list keys but contain no usable secret:

```dotenv
NODE_ENV=production
PORT=3000
BLOG_REPO_DIR=/srv/personal_website
BLOG_DATA_DIR=/srv/personal_website-data
BLOG_ADMIN_USERNAME=wanderer
BLOG_ADMIN_PASSWORD_HASH=
BLOG_SESSION_SECRET=
BLOG_GIT_BRANCH=master
```

`scripts/hash-password.js` must read a password from an interactive TTY with echo disabled, reject fewer than 12 characters, print only the bcrypt hash, and clear the local password variable after hashing. `README.md` must document generating the hash, generating a 32-byte-or-longer session secret, creating the private data directory, installing dependencies, starting locally, Nginx HTTPS proxying, systemd restart, SSH Push verification, private draft backup, pending-sync retry, and Git conflict recovery without force-push.

`deploy/nginx.conf.example` must proxy all traffic to `127.0.0.1:3000`, set `X-Forwarded-Proto`, limit uploads to 9 MB, and rely on the production HTTPS server block. `deploy/personal-website.service.example` must use `/srv/personal_website`, an `EnvironmentFile` outside the repository, `Restart=on-failure`, and a non-root service user.

- [ ] **Step 4: Run the complete automated suite**

Run:

```powershell
npm test
node --check server.js
Get-ChildItem server,admin,scripts -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
```

Expected: every test passes, every script parses, and `git diff --check` prints no errors.

- [ ] **Step 5: Perform browser acceptance**

Start with a temporary external private directory:

```powershell
$env:NODE_ENV='development'
$env:PORT='3000'
$env:BLOG_REPO_DIR=(Get-Location).Path
$env:BLOG_DATA_DIR=(Join-Path (Split-Path (Get-Location).Path) 'personal_website-data-test')
npm start
```

Verify at 1440×1000 and 390×844:

- Public Blog shows exactly three modules and only published posts.
- Each list entry shows title, creation time, preview text, reading time, tags, and optional cover.
- Unauthenticated `/admin` redirects to login; admin APIs return 401.
- Login, create draft, autosave, refresh recovery, private preview, image drop/paste/select, publish, and retry-sync states work.
- The published article appears in the correct module and its detail page loads all Markdown and images.
- Keyboard focus is visible, screen-reader status text changes, reduced-motion mode is respected, and no console errors appear.
- Existing calendar, clock, music player, navigation, and liquid-glass interactions still work.

- [ ] **Step 6: Commit**

```powershell
git add .env.example scripts/hash-password.js deploy/nginx.conf.example deploy/personal-website.service.example README.md tests/site-smoke.mjs
git commit -m "docs: add secure blog admin deployment"
```

---

## Final release gate

- [ ] Review `git status --short` and leave the user-provided school-calendar JPG untouched unless explicitly requested.
- [ ] Verify no `.env`, password, Session Secret, private draft, SSH private key, or temporary upload is tracked.
- [ ] Run `npm test`, all `node --check` commands, and `git diff --check` once more.
- [ ] Review every task commit and confirm the branch contains no unrelated files.
- [ ] Do not Push implementation commits until the user explicitly requests remote upload; the publishing feature itself may Push only after it is configured on the user's server.
