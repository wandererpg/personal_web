const path = require('node:path');

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function readConfig(env = process.env) {
  const repoDir = path.resolve(required(env, 'BLOG_REPO_DIR'));
  const dataDir = path.resolve(required(env, 'BLOG_DATA_DIR'));
  if (dataDir === repoDir || dataDir.startsWith(`${repoDir}${path.sep}`)) {
    throw new Error('BLOG_DATA_DIR must remain outside BLOG_REPO_DIR');
  }
  const sessionSecret = required(env, 'BLOG_SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('BLOG_SESSION_SECRET must be at least 32 characters');
  return {
    env: env.NODE_ENV || 'development',
    port: Number(env.PORT || 3000),
    repoDir,
    dataDir,
    adminUsername: required(env, 'BLOG_ADMIN_USERNAME'),
    adminPasswordHash: required(env, 'BLOG_ADMIN_PASSWORD_HASH'),
    sessionSecret,
    gitBranch: env.BLOG_GIT_BRANCH || 'master'
  };
}

module.exports = { readConfig };
