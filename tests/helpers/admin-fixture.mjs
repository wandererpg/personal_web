import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

const require = createRequire(import.meta.url);
const session = require('express-session');
const { createApp } = require('../../server/app.js');
const { createDraftStore } = require('../../server/draft-store.js');
const { createScheduleStore } = require('../../server/schedule-store.js');
const { createGuestbookStore } = require('../../server/guestbook-store.js');

export const pngFixture = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

export async function createAdminFixture(options = {}) {
  const repoDir = await mkdtemp(join(tmpdir(), 'wanderer-api-site-'));
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-api-data-'));
  await mkdir(join(repoDir, 'posts'));
  await mkdir(join(repoDir, 'assets', 'blog'), { recursive: true });
  await writeFile(join(repoDir, 'posts', 'index.json'), '[]\n');
  await writeFile(join(repoDir, 'index.html'), '<h1>home</h1>');

  const gitCalls = [];
  const gitPublisher = options.gitPublisher || {
    async commitAndPush(input) {
      gitCalls.push(input);
      return { commit: 'fixturecommit123' };
    },
    async retryPush() {
      gitCalls.push({ retry: true });
      return { syncStatus: 'synced' };
    }
  };
  const config = {
    env: 'test', repoDir, dataDir, adminUsername: 'wanderer',
    adminPasswordHash: 'fixture-hash', sessionSecret: 'x'.repeat(32), gitBranch: 'master'
  };
  const draftStore = createDraftStore({ dataDir });
  const scheduleStore = options.scheduleStore || createScheduleStore({ dataDir });
  const guestbookStore = options.guestbookStore || createGuestbookStore({ dataDir });
  const app = createApp(config, {
    sessionStore: new session.MemoryStore(),
    passwordCompare: async value => value === 'correct',
    gitPublisher,
    draftStore,
    scheduleStore,
    guestbookStore
  });

  return {
    app, repoDir, dataDir, draftStore, scheduleStore, guestbookStore, gitCalls,
    async login() {
      const agent = request.agent(app);
      const sessionResponse = await agent.get('/api/admin/session').expect(200);
      const login = await agent.post('/api/admin/login')
        .set('x-csrf-token', sessionResponse.body.csrfToken)
        .send({ username: 'wanderer', password: 'correct' }).expect(200);
      return { agent, csrfToken: login.body.csrfToken };
    }
  };
}
