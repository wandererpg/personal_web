// Optional real-Chromium verification. Uses disposable data and never publishes or pushes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import session from 'express-session';
import { createApp } from '../server/app.js';

assert.equal(typeof WebSocket, 'function', 'Browser smoke checks require Node.js 22+');
const chromePath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(existsSync);
assert.ok(chromePath && existsSync(chromePath), 'Set CHROME_PATH to a Chromium browser executable');
const root = await mkdtemp(join(tmpdir(), 'wanderer-es6-browser-'));
const config = {
  env: 'test', repoDir: fileURLToPath(new URL('../', import.meta.url)),
  webDir: fileURLToPath(new URL('./', import.meta.url)), dataDir: root,
  adminUsername: 'browser-test', adminPasswordHash: 'test-only',
  sessionSecret: 'browser-test-session-secret-'.repeat(3), gitBranch: 'test-only',
};
const rejectPublish = () => { throw new Error('Publishing disabled in browser verification'); };
const options = () => ({
  sessionStore: new session.MemoryStore(),
  passwordCompare: async value => value === 'browser-only-test',
  publishService: { publish: rejectPublish, retrySync: rejectPublish },
  deleteService: { deleteDraft: rejectPublish, deletePublished: rejectPublish },
  gitPublisher: { commitAndPush: rejectPublish, retryPush: rejectPublish },
});
let server;
let browser;
let socket;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function startServer() {
  server = createApp(config, options()).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  return `http://127.0.0.1:${server.address().port}`;
}
const closeServer = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

try {
  let origin = await startServer();
  const profile = join(root, 'chromium');
  browser = spawn(chromePath, ['--headless=new', '--disable-gpu', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  browser.on('error', error => console.error(error.message));
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await delay(100); }
  }
  assert.ok(port, 'Chromium did not open its local debug endpoint');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map();
  const exceptions = [];
  const failedRequests = [];
  let sequence = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      failedRequests.push({ url: message.params.response.url, status: message.params.response.status });
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 300; attempt++) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    const page = await evaluate("({path: location.href, ready: document.readyState, status: document.querySelector('[data-editor-status]')?.textContent, text: document.body.innerText.slice(-1500)})");
    assert.fail(`${label}: ${JSON.stringify({ exceptions, failedRequests, page })}`);
  };
  const go = async path => {
    const previousTimeOrigin = await evaluate('performance.timeOrigin');
    await cdp('Page.navigate', { url: `${origin}${path}` });
    await waitFor(`performance.timeOrigin !== ${previousTimeOrigin} && location.href === ${JSON.stringify(`${origin}${path}`)} && document.readyState !== 'loading'`, path);
  };
  const fill = (selector, value) => evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(value)}; document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event('input', {bubbles:true}));`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Network.enable');
  // Do not let remote fonts or bot-console icons stall local functional checks.
  await cdp('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*39.96.37.102*'] });

  await go('/');
  await waitFor("document.querySelectorAll('[data-calendar-date]').length > 0", 'calendar renders');
  await click('[data-calendar-add]');
  await fill('[data-calendar-title]', 'ESM browser calendar event');
  await evaluate("document.querySelector('[data-calendar-form]').requestSubmit()");
  await waitFor("document.querySelector('[data-calendar-event-list]').textContent.includes('ESM browser calendar event')", 'calendar event saves');
  await waitFor("document.querySelector('[data-blog-preview]')?.children.length === 3", 'three blog categories render');
  assert.match(await evaluate("document.querySelector('[data-current-time]').textContent"), /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(await evaluate("document.querySelector('[data-music-select]').options.length"), 4);
  assert.match(await evaluate("decodeURIComponent(document.querySelector('[data-music-audio]').getAttribute('src'))"), /夜の向日葵/);
  assert.deepEqual(await evaluate("Object.keys(window).filter(key => /^(Wanderer(?:Blog|Clock|Schedule|Calendar|LiquidGlass)|Admin(?:Api|Model))$/.test(key))"), []);
  await evaluate("document.querySelector('[data-music-select]').selectedIndex = 0; document.querySelector('[data-music-select]').dispatchEvent(new Event('change', {bubbles:true}));");
  await waitFor("decodeURIComponent(document.querySelector('[data-music-audio]').getAttribute('src')).includes('花弁')", 'music selection works');
  for (const path of ['/projects.html', '/notes.html?module=learning', '/post.html?slug=missing-browser-check', '/schedule.html']) {
    await go(path);
    await waitFor("document.querySelector('[data-current-time]')?.textContent !== '00:00:00'", `module entry runs on ${path}`);
    if (path.startsWith('/notes')) await waitFor("document.querySelector('[data-blog-module-current]')?.textContent !== '正在读取模块…'", 'blog archive initializes');
    if (path.startsWith('/post')) await waitFor("document.querySelector('[data-blog-article-error]')?.hidden === false", 'missing article state renders');
    if (path.startsWith('/schedule')) await waitFor("document.querySelector('[data-schedule-empty]')?.hidden === false", 'unconfigured public schedule state renders');
  }
  console.log('PASS public modules: calendar, clock, blog, music selection, schedule, no global APIs');

  const login = async () => {
    await go('/admin/login');
    await fill('[name="username"]', 'browser-test');
    await fill('[name="password"]', 'browser-only-test');
    await evaluate("document.querySelector('[data-admin-login]').requestSubmit()");
    await waitFor("location.pathname === '/admin' && document.querySelector('[data-admin-new]') && document.querySelector('[data-admin-loading]')?.hidden === true", 'admin login');
  };
  await login();
  await click('[data-admin-new]');
  await waitFor("location.pathname === '/admin/editor' && document.querySelector('[data-editor-shell]')?.getAttribute('aria-busy') === 'false'", 'create draft');
  const draftId = await evaluate("new URLSearchParams(location.search).get('id')");
  await fill('[data-editor-title]', 'ESM browser draft');
  await fill('[data-editor-body]', '# Browser check\n\nDraft content **saved**');
  await click('[data-editor-save]');
  await waitFor("document.querySelector('[data-editor-status]').textContent.includes('已保存')", 'save draft');
  await go(`/admin/editor?id=${draftId}`);
  await waitFor("document.querySelector('[data-editor-title]').value === 'ESM browser draft'", 'draft survives reload');
  assert.match(await evaluate("document.querySelector('[data-editor-preview]').innerHTML"), /<h2>Browser check<\/h2>/);
  assert.match(await evaluate("document.querySelector('[data-editor-preview]').textContent"), /Draft content \*\*saved\*\*/);

  await go('/admin/schedule');
  await waitFor("document.querySelector('[data-schedule-save-state]')?.textContent.includes('已连接')", 'schedule loads');
  await fill('[data-term-start]', '2026-09-07');
  await fill('[data-total-weeks]', '16');
  await evaluate("document.querySelector('[data-schedule-settings-form]').requestSubmit()");
  await waitFor("document.querySelector('[data-schedule-save-state]').textContent.includes('已保存')", 'save term');
  await click('[data-course-add]');
  await waitFor("!document.querySelector('[data-course-form]').hidden", 'new course form opens');
  await fill('[data-course-name]', 'ESM browser course');
  await fill('[data-course-room]', 'Test room');
  await fill('[data-course-teacher]', 'Test teacher');
  await fill('[data-course-start-period]', '3');
  await fill('[data-course-end-period]', '4');
  await evaluate("document.querySelector('[data-course-form]').requestSubmit()");
  await waitFor("document.querySelector('[data-course-list]').textContent.includes('ESM browser course')", 'save course');
  await go('/admin/guestbook');
  await waitFor("document.querySelector('[data-admin-guestbook-empty]')?.hidden === false", 'guestbook moderation loads');
  assert.deepEqual(exceptions, [], 'No uncaught JavaScript errors');
  console.log('PASS admin modules: login, create/save/reload Markdown draft, add/save course, guestbook');

  await closeServer();
  origin = await startServer();
  await login();
  await go(`/admin/editor?id=${draftId}`);
  await waitFor("document.querySelector('[data-editor-title]').value === 'ESM browser draft'", 'draft survives restart');
  await go('/admin/schedule');
  await waitFor("document.querySelector('[data-course-list]').textContent.includes('ESM browser course')", 'course survives restart');
  await go('/schedule.html');
  await waitFor("document.querySelector('[data-schedule-grid]')?.textContent.includes('ESM browser course')", 'saved course appears on public schedule');
  assert.equal(await evaluate("document.querySelectorAll('.schedule-period').length"), 12);
  assert.deepEqual(exceptions, [], 'No uncaught JavaScript errors after restart');
  console.log('PASS persistence: draft and course survive a new server instance; original private data untouched');
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    const exited = new Promise(resolve => browser.once('exit', resolve));
    browser.kill();
    await exited;
  }
  if (server?.listening) await closeServer();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
