const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

function createToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function sameToken(left = '', right = '') {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && first.length > 0
    && crypto.timingSafeEqual(first, second);
}

function createAuth(config, options = {}) {
  const comparePassword = options.passwordCompare || bcrypt.compare;
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'LOGIN_RATE_LIMITED' }
  });

  function ensureCsrf(req, _res, next) {
    req.session.csrfToken ||= createToken();
    next();
  }

  function requireCsrf(req, res, next) {
    if (!sameToken(req.get('x-csrf-token'), req.session.csrfToken)) {
      return res.status(403).json({ error: 'CSRF_TOKEN_INVALID' });
    }
    return next();
  }

  function requireAuth(req, res, next) {
    if (req.session.authenticated !== true) {
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }
    return next();
  }

  async function login(req, res, next) {
    try {
      const validPassword = await comparePassword(
        typeof req.body?.password === 'string' ? req.body.password : '',
        config.adminPasswordHash
      );
      const validUsername = req.body?.username === config.adminUsername;
      if (!validUsername || !validPassword) {
        return res.status(401).json({ error: 'LOGIN_FAILED' });
      }
      return req.session.regenerate(error => {
        if (error) return next(error);
        req.session.authenticated = true;
        req.session.csrfToken = createToken();
        return res.json({ authenticated: true, csrfToken: req.session.csrfToken });
      });
    } catch (error) {
      return next(error);
    }
  }

  return { ensureCsrf, requireCsrf, requireAuth, login, loginLimiter };
}

module.exports = { createAuth, createToken, sameToken };
