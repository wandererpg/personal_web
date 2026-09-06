import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

test('publisher uses exact scoped Git arguments without a shell', async () => {
  const { createGitPublisher } = require('../server/git-publisher.js');
  const calls = [];
  const run = async args => {
    calls.push(args);
    return args[0] === 'rev-parse' ? 'abc123' : '';
  };
  const publisher = createGitPublisher({ repoDir: 'C:/repo', branch: 'master', run });
  const result = await publisher.commitAndPush({
    paths: ['posts/site-log.md', 'posts/index.json', 'assets/blog/site-log/22222222-2222-4222-8222-222222222222.png'],
    message: 'blog: publish 个人网站重构日志'
  });

  assert.deepEqual(calls, [
    ['fetch', 'origin', 'master'],
    ['merge-base', '--is-ancestor', 'origin/master', 'HEAD'],
    ['add', '--', 'posts/site-log.md', 'posts/index.json', 'assets/blog/site-log/22222222-2222-4222-8222-222222222222.png'],
    ['commit', '-m', 'blog: publish 个人网站重构日志'],
    ['rev-parse', 'HEAD'],
    ['push', 'origin', 'HEAD:master']
  ]);
  assert.equal(result.commit, 'abc123');
});

test('publisher rejects paths outside public blog content', async () => {
  const { createGitPublisher } = require('../server/git-publisher.js');
  const publisher = createGitPublisher({ repoDir: 'C:/repo', branch: 'master', run: async () => '' });

  await assert.rejects(() => publisher.commitAndPush({
    paths: ['../.env'], message: 'blog: publish unsafe'
  }), error => error.code === 'GIT_PATH_INVALID');
});

test('push failure exposes a pending commit without losing it', async () => {
  const { createGitPublisher } = require('../server/git-publisher.js');
  const run = async args => {
    if (args[0] === 'rev-parse') return 'pending123';
    if (args[0] === 'push') throw Object.assign(new Error('offline'), { code: 'GIT_FAILED' });
    return '';
  };
  const publisher = createGitPublisher({ repoDir: 'C:/repo', branch: 'master', run });

  await assert.rejects(() => publisher.commitAndPush({
    paths: ['posts/index.json'], message: 'blog: publish pending'
  }), error => error.code === 'GIT_PUSH_PENDING' && error.commit === 'pending123');
});

test('publisher creates and pushes a real commit to an isolated bare remote', async () => {
  const { createGitPublisher, spawnGit } = require('../server/git-publisher.js');
  const root = await mkdtemp(join(tmpdir(), 'wanderer-git-'));
  const repoDir = join(root, 'site');
  const remoteDir = join(root, 'remote.git');
  await mkdir(repoDir);
  await spawnGit(root, ['init', '--bare', remoteDir]);
  await spawnGit(repoDir, ['init', '-b', 'master']);
  await spawnGit(repoDir, ['config', 'user.name', 'Wanderer Test']);
  await spawnGit(repoDir, ['config', 'user.email', 'test@example.invalid']);
  await spawnGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
  await mkdir(join(repoDir, 'posts'));
  await writeFile(join(repoDir, 'posts', 'index.json'), '[]\n');
  await spawnGit(repoDir, ['add', '--', 'posts/index.json']);
  await spawnGit(repoDir, ['commit', '-m', 'initial']);
  await spawnGit(repoDir, ['push', '-u', 'origin', 'master']);
  await writeFile(join(repoDir, 'posts', 'real.md'), '# Real\n');

  const result = await createGitPublisher({ repoDir, branch: 'master' }).commitAndPush({
    paths: ['posts/real.md'], message: 'blog: publish real'
  });
  const remoteHead = await spawnGit(remoteDir, ['rev-parse', 'refs/heads/master']);
  assert.equal(remoteHead, result.commit);
});
