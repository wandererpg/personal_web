const { spawn } = require('node:child_process');
const path = require('node:path');
const { contentError } = require('./content-model.js');

const PUBLIC_GIT_PATH = /^(?:posts\/index\.json|posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.md|assets\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9a-f-]+\.(?:png|jpg|webp))$/i;

function validateGitPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 64
      || paths.some(value => typeof value !== 'string' || path.isAbsolute(value)
        || value.includes('\\') || !PUBLIC_GIT_PATH.test(value))) {
    throw contentError('GIT_PATH_INVALID');
  }
  return [...new Set(paths)];
}

function spawnGit(repoDir, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: repoDir,
      shell: false,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => reject(Object.assign(error, { code: 'GIT_FAILED', args })));
    child.on('close', code => {
      if (code === 0) return resolve(stdout.trim());
      return reject(Object.assign(new Error(stderr.trim() || `git exited ${code}`), {
        code: 'GIT_FAILED',
        exitCode: code,
        args
      }));
    });
  });
}

function createGitPublisher({ repoDir, branch, run = args => spawnGit(repoDir, args) }) {
  let queue = Promise.resolve();
  const serialize = operation => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => {});
    return next;
  };

  async function preflightCommands() {
    await run(['fetch', 'origin', branch]);
    try {
      await run(['merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD']);
    } catch (error) {
      error.code = 'GIT_REMOTE_DIVERGED';
      throw error;
    }
  }

  return {
    preflight: () => serialize(preflightCommands),
    async commitAndPush(input) {
      const paths = validateGitPaths(input.paths);
      if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 200) {
        return Promise.reject(contentError('GIT_MESSAGE_INVALID'));
      }
      return serialize(async () => {
        await preflightCommands();
        await run(['add', '--', ...paths]);
        await run(['commit', '-m', input.message]);
        const commit = await run(['rev-parse', 'HEAD']);
        try {
          await run(['push', 'origin', `HEAD:${branch}`]);
        } catch (error) {
          error.code = 'GIT_PUSH_PENDING';
          error.commit = commit;
          throw error;
        }
        return { commit };
      });
    },
    retryPush() {
      return serialize(async () => {
        await run(['push', 'origin', `HEAD:${branch}`]);
        return { syncStatus: 'synced' };
      });
    }
  };
}

module.exports = { createGitPublisher, spawnGit, validateGitPaths };
