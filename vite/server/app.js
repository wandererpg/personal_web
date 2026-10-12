import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import createFileStore from 'session-file-store';
import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { createAuth } from './auth.js';
import { createAdminRouter } from './admin-api.js';
import { createDraftStore } from './draft-store.js';
import { createMediaStore } from './media-store.js';
import { createGitPublisher } from './git-publisher.js';
import { createPublishService } from './publish-service.js';
import { createDeleteService } from './delete-service.js';
import { createScheduleStore } from './schedule-store.js';
import { createGuestbookStore } from './guestbook-store.js';
import { createAdminScheduleRouter, createPublicScheduleRouter } from './schedule-api.js';
import { createAdminGuestbookRouter, createPublicGuestbookRouter } from './guestbook-api.js';

// Built pages are served from the Vite output directory.
const PUBLIC_PAGES = new Set([
  'index.html', 'notes.html', 'post.html', 'projects.html', 'schedule.html'
]);
// Hashed JavaScript, CSS, and fonts emitted by `vite build` (see vite.config.js assetsDir).
const BUNDLE_DIRECTORIES = new Set(['static']);
// Public content still lives in the Git repository and is served unchanged.
const CONTENT_DIRECTORIES = new Set(['posts', 'assets', 'music']);

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
  if (rawSegments.length === 1 && PUBLIC_PAGES.has(rawSegments[0])) {
    return { rootFile: rawSegments[0] };
  }
  if (rawSegments.length > 1
      && (CONTENT_DIRECTORIES.has(rawSegments[0]) || BUNDLE_DIRECTORIES.has(rawSegments[0]))) {
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

function installPublicFiles(app, repoDir, webDir) {
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const selected = selectPublicPath(req.originalUrl);
    if (!selected) return next();
    try {
      // Pages and bundles belong to the Vite build output; public content stays in the Git repo.
      const servesWebDir = !selected.directory || BUNDLE_DIRECTORIES.has(selected.directory);
      const selectedRoot = servesWebDir ? webDir : repoDir;
      const selectedReal = await realpath(selectedRoot);
      let allowedBase = selectedReal;
      const candidate = path.join(selectedRoot, selected.rootFile || selected.directory,
        ...(selected.childSegments || []));
      if (selected.directory) {
        allowedBase = await realpath(path.join(selectedRoot, selected.directory));
        if (!isWithin(selectedReal, allowedBase) || allowedBase === selectedReal) return next();
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
  const deleteService = options.deleteService || createDeleteService({
    repoDir: config.repoDir,
    dataDir: config.dataDir,
    draftStore,
    mediaStore,
    gitPublisher
  });
  const scheduleStore = options.scheduleStore || createScheduleStore({ dataDir: config.dataDir });
  const guestbookStore = options.guestbookStore || createGuestbookStore({ dataDir: config.dataDir });
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
    deleteService,
    auth
  }));
  app.use('/api/admin/schedule', auth.requireAuth, createAdminScheduleRouter({ scheduleStore, auth }));
  app.use('/api/admin/guestbook', auth.requireAuth, createAdminGuestbookRouter({ guestbookStore, auth }));

  // Admin pages come from the Vite build output; their scripts and styles are bundled under /static.
  const adminFile = name => path.join(config.webDir || config.repoDir, 'admin', name);
  const requireAdminPage = (req, res, next) => (
    req.session.authenticated === true ? next() : res.redirect('/admin/login')
  );
  app.get('/admin/login', (_req, res) => res.sendFile(adminFile('login.html')));
  app.get('/admin', requireAdminPage, (_req, res) => res.sendFile(adminFile('index.html')));
  app.get('/admin/editor', requireAdminPage, (_req, res) => res.sendFile(adminFile('editor.html')));
  app.get('/admin/schedule', requireAdminPage, (_req, res) => res.sendFile(adminFile('schedule.html')));
  app.get('/admin/guestbook', requireAdminPage, (_req, res) => res.sendFile(adminFile('guestbook.html')));

  if (typeof options.installAdmin === 'function') {
    options.installAdmin(app, { auth, store, draftStore, mediaStore, gitPublisher, publishService, deleteService });
  }
}

function handleServerError(error, req, res, next) {
  // Audio streaming may be cancelled when selecting tracks or leaving the page.
  if (error.code === 'ECONNABORTED' || req.aborted || res.destroyed || res.writableEnded) return;
  if (res.headersSent) return next(error);
  console.error(error);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}

function createApp(config, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.env === 'production') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '256kb' }));
  const scheduleStore = options.scheduleStore || createScheduleStore({ dataDir: config.dataDir });
  const guestbookStore = options.guestbookStore || createGuestbookStore({ dataDir: config.dataDir });
  app.use('/api/schedule', createPublicScheduleRouter({ scheduleStore }));
  app.use('/api/guestbook', createPublicGuestbookRouter({ guestbookStore }));
  if (options.installAdmin !== false) installAdmin(app, config, { ...options, scheduleStore, guestbookStore });
  installPublicFiles(app, config.repoDir, config.webDir || config.repoDir);
  app.use(handleServerError);
  app.use((req, res) => res.sendStatus(404));
  return app;
}

export { createApp, handleServerError, PUBLIC_PAGES, BUNDLE_DIRECTORIES, CONTENT_DIRECTORIES };
