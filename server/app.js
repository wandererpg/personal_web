const express = require('express');
const helmet = require('helmet');
const path = require('node:path');

const BLOCKED = /^\/(?:\.git|server|tests|docs|deploy|scripts|node_modules)(?:\/|$)|^\/(?:AGENT\.md|README\.md|package(?:-lock)?\.json|\.env)$/i;

function createApp(config, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.env === 'production') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req, res, next) => BLOCKED.test(req.path) ? res.sendStatus(404) : next());
  app.use(express.json({ limit: '256kb' }));
  if (options.installAdmin !== false && options.installAdmin) options.installAdmin(app);
  app.use(express.static(config.repoDir, { dotfiles: 'deny', index: 'index.html' }));
  app.use((req, res) => res.sendStatus(404));
  return app;
}

module.exports = { createApp };
