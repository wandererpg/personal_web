const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const createFileStore = require('session-file-store');
const path = require('node:path');
const { realpath, stat } = require('node:fs/promises');
const { createAuth } = require('./auth.js');
const { createAdminRouter } = require('./admin-api.js');
const { createDraftStore } = require('./draft-store.js');
const { createMediaStore } = require('./media-store.js');
const { createGitPublisher } = require('./git-publisher.js');
const { createPublishService } = require('./publish-service.js');

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
  if (!rawPath.startsWith('/')) return null;
  if (rawPath === '/') return { rootFile: 'index.html' };
  const rawSegments = rawPath.slice(1).split('/');
  if (rawSegments.some(segment => !segment)) return null;
  if (rawSegments.length === 1 && PUBLIC_ROOT_FILES.has(rawSegments[0])) {
    return { rootFile: rawSegments[0] };
  }
  if (rawSegments.length > 1 && PUBLIC_DIRECTORIES.has(rawSegments[0])) {
    const childSegments = [];
    for (const rawSegment of rawSegments.slice(1)) {
      let segment;
      try {
        segment = decodeURIComponent(rawSegment);
      } catch {
        return null;
      }
      if (!segment || segment === '.' || segment === '..'
          || segment.includes('/') || segment.includes('\\') || segment.includes('\0')
          || /%[0-9a-f]{2}/i.test(segment)) return null;
      childSegments.push(segment);
    }
    return { directory: rawSegments[0], childSegments };
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
      let candidate = path.join(repoDir, selected.rootFile || selected.directory,
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

function installAdmin(app, config, options) {
  const FileStore = createFileStore(session);
  const store = options.sessionStore || new FileStore({
    path: path.join(config.dataDir, 'sessions'),
    retries: 1,
    logFn() {}
  });
  app.use(session({
    name: 'wanderer.admin',
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.env === 'production',
      maxAge: 8 * 60 * 60_000
    }
  }));

  const auth = createAuth(config, options);
  const draftStore = options.draftStore || createDraftStore({ dataDir: config.dataDir });
  const mediaStore = options.mediaStore || createMediaStore({ dataDir: config.dataDir, repoDir: config.repoDir });
  const gitPublisher = options.gitPublisher || createGitPublisher({
    repoDir: config.repoDir,
    branch: config.gitBranch
  });
  const publishService = options.publishService || createPublishService({
    repoDir: config.repoDir,
    draftStore,
    mediaStore,
    gitPublisher
  });
  app.get('/api/admin/session', auth.ensureCsrf, (req, res) => res.json({
    authenticated: req.session.authenticated === true,
    csrfToken: req.session.csrfToken
  }));
  app.post('/api/admin/login', auth.loginLimiter, auth.ensureCsrf, auth.requireCsrf, auth.login);
  app.post('/api/admin/logout', auth.requireAuth, auth.requireCsrf, (req, res, next) => {
    req.session.destroy(error => error ? next(error) : res.sendStatus(204));
  });
  app.use('/api/admin', auth.requireAuth, createAdminRouter({
    repoDir: config.repoDir,
    draftStore,
    mediaStore,
    publishService,
    auth
  }));

  const adminFile = name => path.join(config.repoDir, 'admin', name);
  app.get('/admin/login', (_req, res) => res.sendFile(adminFile('login.html')));
  app.get('/admin/login.js', (_req, res) => res.sendFile(adminFile('login.js')));
  app.get('/admin/admin-api.js', (_req, res) => res.sendFile(adminFile('admin-api.js')));
  app.get(['/admin', '/admin/editor'], auth.requireAuth, (_req, res) => res.sendStatus(501));

  if (typeof options.installAdmin === 'function') {
    options.installAdmin(app, { auth, store, draftStore, mediaStore, gitPublisher, publishService });
  }
}

function createApp(config, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.env === 'production') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '256kb' }));
  if (options.installAdmin !== false) installAdmin(app, config, options);
  installPublicFiles(app, config.repoDir);
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });
  app.use((req, res) => res.sendStatus(404));
  return app;
}

module.exports = { createApp, PUBLIC_ROOT_FILES, PUBLIC_DIRECTORIES };
