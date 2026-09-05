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
