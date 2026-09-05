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
