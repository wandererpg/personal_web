import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const exists = async (name) => access(new URL(name, root)).then(() => true, () => false);
const musicFiles = [
  'music/松本文紀 - 花弁となり 世界は大いに歌う.mp3',
  'music/松本文紀 - 夢の歩みを見上げて (仰望梦想的脚步).mp3',
  'music/松本文紀 - 夜の向日葵.flac',
  'music/松本文紀 - 月の眼球譚.mp3',
];

test('required site files exist', async () => {
  for (const file of ['index.html', 'projects.html', 'notes.html', 'styles.css', 'script.js']) {
    assert.equal(await exists(file), true, `${file} is missing`);
  }
});

test('pages expose shared navigation and semantic landmarks', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /<header[\s>]/);
    assert.match(html, /<main[\s>]/);
    assert.match(html, /<footer[\s>]/);
    assert.match(html, /href="projects\.html"/);
    assert.match(html, /href="notes\.html"/);
    assert.match(html, /href="https:\/\//);
  }
});

test('styles include responsive and reduced-motion rules', async () => {
  const css = await read('styles.css');
  assert.match(css, /@media/);
  assert.match(css, /prefers-reduced-motion/);
});

test('page hero clips decorative overflow', async () => {
  const css = await read('styles.css');
  assert.match(css, /\.page-hero\s*\{[^}]*overflow:\s*hidden;/s);
});

test('pages provide a local favicon', async () => {
  assert.equal(await exists('favicon.svg'), true, 'favicon.svg is missing');
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /rel="icon" href="favicon\.svg"/);
  }
});

test('pages do not ship unfinished placeholder copy', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.doesNotMatch(html, /lorem ipsum|TODO|TBD|coming soon/i);
  }
});

test('pages expose the owner platform links', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /https:\/\/github\.com\/wandererpg/);
    assert.match(html, /https:\/\/space\.bilibili\.com\/1065241718/);
  }
});

test('pages include cross-page transition and music player hooks', async () => {
  const css = await read('styles.css');
  const js = await read('script.js');

  assert.match(css, /is-entering/);
  assert.match(css, /is-leaving/);
  assert.match(js, /location\.assign/);
  assert.match(js, /data-music-audio/);
  assert.match(js, /data-music-select/);
  assert.match(js, /\.play\(\)/);

  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /data-music-player/);
    assert.match(html, /data-music-toggle/);
    assert.match(html, /data-music-select/);
    assert.match(html, /data-music-audio/);
    assert.match(html, /<option value="0"(?: selected)?>/);
    assert.match(html, /<option value="3">/);
    assert.match(html, /aria-pressed="false"/);
  }
});

test('music playlist assets exist and are wired into the player', async () => {
  const js = await read('script.js');
  for (const file of musicFiles) {
    assert.equal(await exists(file), true, `${file} is missing`);
    const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(js, new RegExp(escapedFile));
  }
});

test('music player stays fixed to the viewport during page transitions', async () => {
  const css = await read('styles.css');
  assert.match(css, /\.music-player\s*\{[^}]*position:\s*fixed;/s);
  assert.doesNotMatch(css, /html(?:\.[\w-]+)? body\s*\{[^}]*transform:/s);
});

test('music player defaults to 夜の向日葵 without legacy labels', async () => {
  const js = await read('script.js');
  assert.match(js, /defaultTrackIndex\s*=\s*2/);
  assert.doesNotMatch(js, /ORBITAL AMBIENCE|本地音乐/);

  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /<strong data-music-title>夜の向日葵<\/strong>/);
    assert.match(html, /<option value="2" selected>夜の向日葵<\/option>/);
    assert.doesNotMatch(html, /ORBITAL AMBIENCE|本地音乐/);
  }
});

test('README documents the GitHub SSH upload workflow', async () => {
  assert.equal(await exists('README.md'), true, 'README.md is missing');
  const readme = await read('README.md');
  assert.match(readme, /git@github\.com:wandererpg\/personal_web\.git/);
  assert.match(readme, /ssh -T git@github\.com/);
  assert.match(readme, /git add \./);
  assert.match(readme, /git commit -m/);
  assert.match(readme, /git push/);
});

test('home calendar design spec records the approved MVP boundaries', async () => {
  const specPath = 'docs/superpowers/specs/2026-09-05-home-calendar-design.md';
  assert.equal(await exists(specPath), true, `${specPath} is missing`);
  const spec = await read(specPath);
  assert.match(spec, /wanderer\.calendar\.events\.v1/);
  assert.match(spec, /同一天允许添加多条事件/);
  assert.match(spec, /localStorage/);
  assert.match(spec, /不包含[：:].*云同步/);
});

test('liquid glass design spec defines material, motion, and accessibility boundaries', async () => {
  const specPath = 'docs/superpowers/specs/2026-09-05-liquid-glass-cards-design.md';

  assert.equal(await exists(specPath), true, `${specPath} is missing`);
  const spec = await read(specPath);
  assert.match(spec, /指针驱动/);
  assert.match(spec, /项目卡片|知识卡片/);
  assert.match(spec, /日历|音乐播放器/);
  assert.match(spec, /prefers-reduced-motion/);
});

test('wanderer avatar and ambient motion spec records the approved visual direction', async () => {
  const specPath = 'docs/superpowers/specs/2026-09-05-wanderer-avatar-ambient-motion-design.md';

  assert.equal(await exists(specPath), true, `${specPath} is missing`);
  const spec = await read(specPath);
  assert.match(spec, /A.*星尘漂移/);
  assert.match(spec, /B.*星云呼吸/);
  assert.match(spec, /45%.*50%/);
  assert.match(spec, /`wanderer`/);
  assert.match(spec, /头像占位符/);
  assert.match(spec, /prefers-reduced-motion/);
});

test('home calendar implementation plan defines tested delivery steps', async () => {
  const planPath = 'docs/superpowers/plans/2026-09-05-home-calendar.md';
  assert.equal(await exists(planPath), true, `${planPath} is missing`);
  const plan = await read(planPath);
  assert.match(plan, /tests\/calendar\.test\.mjs/);
  assert.match(plan, /calendar\.js/);
  assert.match(plan, /localStorage/);
  assert.match(plan, /git commit/);
});

test('liquid glass implementation plan defines test-first delivery steps', async () => {
  const planPath = 'docs/superpowers/plans/2026-09-05-liquid-glass-cards.md';

  assert.equal(await exists(planPath), true, `${planPath} is missing`);
  const plan = await read(planPath);
  assert.match(plan, /tests\/liquid-glass\.test\.mjs/);
  assert.match(plan, /liquid-glass\.js/);
  assert.match(plan, /data-liquid-glass/);
  assert.match(plan, /prefers-reduced-motion/);
  assert.match(plan, /git commit/);
});

test('wanderer avatar ambient motion plan defines tested delivery steps', async () => {
  const planPath = 'docs/superpowers/plans/2026-09-05-wanderer-avatar-ambient-motion.md';

  assert.equal(await exists(planPath), true, `${planPath} is missing`);
  const plan = await read(planPath);
  assert.match(plan, /index\.html/);
  assert.match(plan, /styles\.css/);
  assert.match(plan, /tests\/site-smoke\.mjs/);
  assert.match(plan, /cosmic-star-drift-near/);
  assert.match(plan, /station-nebula/);
  assert.match(plan, /prefers-reduced-motion/);
  assert.match(plan, /git commit/);
});

test('calendar clock autoplay design records the confirmed scope', async () => {
  const specPath = 'docs/superpowers/specs/2026-09-05-calendar-clock-autoplay-design.md';

  assert.equal(await exists(specPath), true, `${specPath} is missing`);
  const spec = await read(specPath);
  assert.match(spec, /北京时间/);
  assert.match(spec, /autoplay/);
  assert.match(spec, /liquid-glass__shine/);
  assert.match(spec, /2026-09-25 至 2026-09-27/);
  assert.match(spec, /2026-10-01 至 2026-10-07/);
  assert.match(spec, /2027-01-11/);
  assert.match(spec, /2027-02-21/);
  assert.match(spec, /不加入校历中的“教师放寒假”和“教师上班”事项/);
  assert.match(spec, /最近三项/);
});

test('calendar clock autoplay plan defines the confirmed delivery steps', async () => {
  const planPath = 'docs/superpowers/plans/2026-09-05-calendar-clock-autoplay.md';

  assert.equal(await exists(planPath), true, `${planPath} is missing`);
  const plan = await read(planPath);
  assert.match(plan, /clock\.js/);
  assert.match(plan, /calendar\.js/);
  assert.match(plan, /autoplay/);
  assert.match(plan, /液态玻璃/);
  assert.match(plan, /2026-09-25/);
  assert.match(plan, /2027-02-21/);
  assert.match(plan, /教师放寒假/);
  assert.match(plan, /不加入/);
  assert.match(plan, /git commit/);
});

test('home hero exposes the editable calendar interface', async () => {
  const html = await read('index.html');
  const css = await read('styles.css');
  const calendarJs = await read('calendar.js');

  assert.doesNotMatch(html, /探索、建造|欢迎来到我的个人空间/);
  assert.match(html, /src="calendar\.js"/);
  for (const hook of [
    'data-calendar',
    'data-calendar-grid',
    'data-calendar-month',
    'data-calendar-prev',
    'data-calendar-today',
    'data-calendar-next',
    'data-calendar-event-list',
    'data-calendar-add',
    'data-calendar-form',
  ]) {
    assert.match(html, new RegExp(hook));
  }
  assert.match(css, /\.home-calendar\s*\{/);
  assert.match(css, /\.calendar-grid(?:\s*\{|\s*,)/);
  assert.match(calendarJs, /wanderer\.calendar\.events\.v1/);
  assert.match(calendarJs, /data-calendar-date/);
  assert.match(calendarJs, /data-calendar-form/);
  assert.match(calendarJs, /saveEvents/);
  assert.match(calendarJs, /window\.confirm/);
});

test('home calendar uses a compact desktop footprint while staying fluid on mobile', async () => {
  const css = await read('styles.css');

  assert.match(css, /\.home-calendar\s*\{[^}]*max-width:\s*540px;/s);
  assert.match(css, /\.calendar-day\s*\{[^}]*min-height:\s*40px;/s);
  assert.match(css, /\.calendar-event-list\s*\{[^}]*max-height:\s*140px;/s);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.home-calendar\s*\{[^}]*max-width:\s*none;/s);
});

test('all primary glass surfaces load the shared interaction module', async () => {
  const expectedTargets = new Map([
    ['index.html', 11],
    ['projects.html', 4],
    ['notes.html', 4],
  ]);

  for (const [page, count] of expectedTargets) {
    const html = await read(page);
    assert.match(html, /<script src="liquid-glass\.js" defer><\/script>/);
    assert.equal((html.match(/data-liquid-glass/g) ?? []).length, count);
  }

  const glassJs = await read('liquid-glass.js');
  assert.match(glassJs, /requestAnimationFrame/);
  assert.match(glassJs, /pointerdown/);
  assert.match(glassJs, /pointercancel/);
  assert.match(glassJs, /liquid-glass__shine/);
});

test('liquid glass material provides responsive and reduced-motion feedback', async () => {
  const css = await read('styles.css');

  assert.match(css, /\.liquid-glass\s*\{[^}]*backdrop-filter:/s);
  assert.match(css, /\.liquid-glass__shine\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(css, /\.liquid-glass\.is-glass-active\s*\{[^}]*perspective\(900px\)/s);
  assert.match(css, /\.liquid-glass\.is-glass-active\s*\{[^}]*transition-delay:\s*0ms\s*!important;/s);
  assert.match(css, /@media\s*\(hover:\s*none\)[\s\S]*?\.liquid-glass\.is-glass-active/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.liquid-glass[^}]*transform:\s*none\s*!important;/s);
});

test('station glass card keeps desktop vertical centering while active', async () => {
  const css = await read('styles.css');
  assert.match(css, /@media\s*\(min-width:\s*921px\)[\s\S]*?\.station-panel\.liquid-glass\.is-glass-active\s*\{[^}]*transform:\s*translateY\(-50%\)[^}]*perspective\(900px\)/s);
});

test('home station presents wanderer with an accessible avatar placeholder', async () => {
  const html = await read('index.html');

  assert.match(html, /<span class="station-nebula" aria-hidden="true"><\/span>/);
  assert.match(html, /<div class="avatar-stage">/);
  assert.match(html, /class="avatar-placeholder" role="img" aria-label="Wanderer 头像占位符"/);
  assert.match(html, /<span aria-hidden="true">W<\/span>/);
  assert.match(html, /<small aria-hidden="true">AVATAR<\/small>/);
  assert.match(html, /<h2>wanderer<\/h2>/);
  assert.doesNotMatch(html, /class="planet(?:-stage)?"/);
  assert.doesNotMatch(html, /把好奇心，变成可见的东西。/);
});

test('all pages share two composited drifting star layers', async () => {
  const css = await read('styles.css');

  for (const page of ['index.html', 'projects.html', 'notes.html']) {
    const html = await read(page);
    assert.match(html, /class="site-shell"/);
  }

  assert.match(css, /body::before\s*\{[^}]*animation:\s*cosmic-star-drift-near 18s linear infinite;/s);
  assert.match(css, /\.site-shell::before\s*\{[^}]*animation:\s*cosmic-star-drift-far 30s linear infinite;/s);
  assert.match(css, /@keyframes cosmic-star-drift-near/);
  assert.match(css, /@keyframes cosmic-star-drift-far/);
  assert.match(css, /\.site-shell::before\s*\{[^}]*pointer-events:\s*none;/s);
});

test('wanderer station uses transparent nebula and avatar styling', async () => {
  const css = await read('styles.css');

  assert.match(css, /\.station-panel\s*\{[^}]*rgba\(20, 43, 89, 0\.44\)[^}]*rgba\(5, 10, 29, 0\.5\)/s);
  assert.match(css, /\.station-nebula\s*\{[^}]*animation:\s*station-nebula-turn 24s linear infinite;/s);
  assert.match(css, /\.station-nebula::before[\s\S]*?station-nebula-breathe 8s/s);
  assert.match(css, /\.station-nebula::after[\s\S]*?station-nebula-breathe 10s/s);
  assert.match(css, /\.avatar-placeholder\s*\{[^}]*border-radius:\s*50%;[^}]*animation:\s*avatar-breathe 5s/s);
  assert.match(css, /@keyframes station-nebula-breathe/);
  assert.match(css, /@keyframes avatar-breathe/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.station-nebula/s);
});
