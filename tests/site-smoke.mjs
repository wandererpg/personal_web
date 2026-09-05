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
  for (const file of ['index.html', 'projects.html', 'notes.html', 'styles.css', 'script.js', 'clock.js']) {
    assert.equal(await exists(file), true, `${file} is missing`);
  }
});

test('pages expose shared navigation and semantic landmarks', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
    const html = await read(page);
    assert.match(html, /<header[\s>]/);
    assert.match(html, /<main[\s>]/);
    assert.match(html, /<footer[\s>]/);
    assert.match(html, /href="projects\.html"/);
    assert.match(html, /href="notes\.html"/);
    assert.match(html, /href="https:\/\//);
  }
});

test('pages expose the shared Beijing clock', async () => {
  const clock = await read('clock.js');
  assert.match(clock, /Asia\/Shanghai/);
  assert.match(clock, /setInterval/);

  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
    const html = await read(page);
    assert.match(html, /<script src="clock\.js" defer><\/script>/);
    assert.match(html, /class="header-status"/);
    assert.match(html, /data-current-date/);
    assert.match(html, /data-current-time/);
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
  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
    const html = await read(page);
    assert.match(html, /rel="icon" href="favicon\.svg"/);
  }
});

test('pages do not ship unfinished placeholder copy', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
    const html = await read(page);
    assert.doesNotMatch(html, /lorem ipsum|TODO|TBD|coming soon/i);
  }
});

test('pages expose the owner platform links', async () => {
  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
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

  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
    const html = await read(page);
    assert.match(html, /data-music-player/);
    assert.match(html, /data-music-toggle/);
    assert.match(html, /data-music-select/);
    assert.match(html, /data-music-audio/);
    assert.match(html, /<audio[^>]*data-music-audio[^>]*autoplay/);
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
  assert.match(js, /loadTrack\(defaultTrackIndex, true\)/);
  assert.match(js, /自动播放被拦截/);
  assert.match(js, /autoplayBlocked/);
  assert.match(js, /handleAutoplayRecovery/);
  assert.match(js, /document\.addEventListener\('click', handleAutoplayRecovery\)/);
  assert.match(js, /document\.addEventListener\('keydown', handleAutoplayRecovery\)/);
  assert.doesNotMatch(js, /ORBITAL AMBIENCE|本地音乐/);

  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
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

test('blog admin publishing spec preserves private drafts and repository publishing', async () => {
  const specPath = 'docs/superpowers/specs/2026-09-06-blog-admin-publishing-design.md';

  assert.equal(await exists(specPath), true, `${specPath} is missing`);
  const spec = await read(specPath);
  assert.match(spec, /我的项目/);
  assert.match(spec, /心得分享/);
  assert.match(spec, /日常学习/);
  assert.match(spec, /草稿不会写入 `posts\/index\.json`/);
  assert.match(spec, /不会进入 Git/);
  assert.match(spec, /Markdown 编辑/);
  assert.match(spec, /Git Commit/);
  assert.match(spec, /Push 到 GitHub/);
  assert.match(spec, /JPEG、PNG 和 WebP/);
});

test('blog admin publishing plan defines test-first private publishing delivery', async () => {
  const planPath = 'docs/superpowers/plans/2026-09-06-blog-admin-publishing.md';

  assert.equal(await exists(planPath), true, `${planPath} is missing`);
  const plan = await read(planPath);
  assert.match(plan, /tests\/auth\.test\.mjs/);
  assert.match(plan, /tests\/draft-store\.test\.mjs/);
  assert.match(plan, /tests\/media-store\.test\.mjs/);
  assert.match(plan, /tests\/publish-service\.test\.mjs/);
  assert.match(plan, /POST   \/api\/admin\/posts\/:slug\/revise/);
  assert.match(plan, /multer@\^2\.3\.0/);
  assert.match(plan, /shell: false/);
  assert.match(plan, /npm test/);
  assert.match(plan, /git commit/);
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
  assert.doesNotMatch(spec, /国庆调休上班/);
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
  assert.doesNotMatch(plan, /国庆调休上班/);
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

test('home calendar exposes the school schedule and nearby events panel', async () => {
  const html = await read('index.html');
  const calendarJs = await read('calendar.js');
  const css = await read('styles.css');

  assert.match(html, /class="calendar-layout"/);
  assert.match(html, /data-upcoming-events/);
  assert.match(html, /data-upcoming-list/);
  assert.match(html, /id="upcoming-events-title">近期事件<\/h2>/);
  assert.match(calendarJs, /getSchoolCalendarEvents/);
  assert.match(calendarJs, /getUpcomingEvents/);
  assert.match(calendarJs, /中秋节放假/);
  assert.match(calendarJs, /国庆节放假/);
  assert.match(calendarJs, /学生寒假/);
  assert.match(calendarJs, /学生注册/);
  assert.doesNotMatch(calendarJs, /title:\s*['"]教师放寒假/);
  assert.doesNotMatch(calendarJs, /title:\s*['"]教师上班/);
  assert.doesNotMatch(calendarJs, /title:\s*['"]国庆调休上班/);
  assert.doesNotMatch(calendarJs, /workday/);
  assert.match(calendarJs, /calendar-day__dots/);
  assert.match(calendarJs, /calendar-day__dot/);
  assert.doesNotMatch(calendarJs, /calendar-day__count/);
  assert.match(css, /\.calendar-layout\s*\{/);
  assert.match(css, /\.upcoming-events\s*\{/);
  assert.match(css, /\.calendar-day\.has-events\s*\{/);
  assert.match(css, /\.calendar-day__dots\s*\{/);
  assert.match(css, /\.calendar-day__dot\s*\{/);
  assert.doesNotMatch(css, /\.calendar-day__count\s*\{/);
  assert.doesNotMatch(css, /workday/);
});

test('all primary glass surfaces load the shared interaction module', async () => {
  const expectedTargets = new Map([
    ['index.html', 8],
    ['projects.html', 4],
    ['notes.html', 1],
    ['post.html', 1],
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
  assert.match(css, /\.liquid-glass__shine\s*\{[^}]*display:\s*none;/s);
  assert.doesNotMatch(css, /radial-gradient\(circle 220px at var\(--glass-x\)/);
  assert.match(css, /\.liquid-glass\.is-glass-active\s*\{[^}]*perspective\(900px\)/s);
  assert.match(css, /\.liquid-glass\.is-glass-active\s*\{[^}]*transition-delay:\s*0ms\s*!important;/s);
  assert.doesNotMatch(css, /\.liquid-glass\.is-glass-active\s*\{[\s\S]*?0 0 34px rgba\(119, 230, 255/);
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

  for (const page of ['index.html', 'projects.html', 'notes.html', 'post.html']) {
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

test('home exposes the repository-driven blog preview', async () => {
  const html = await read('index.html');
  const blog = await read('blog.js');

  assert.match(html, /<script src="blog\.js" defer><\/script>\s*<script src="script\.js" defer><\/script>/);
  assert.match(html, /id="blog"/);
  assert.match(html, /data-blog-preview/);
  assert.match(html, /data-blog-preview-empty/);
  assert.match(html, /data-blog-preview-error/);
  assert.match(html, /我的博客/);
  assert.match(html, /查看全部博客/);
  assert.match(html, /href="notes\.html"/);
  assert.match(html, /进入博客/);
  assert.match(html, /BLOG: IN TRANSMISSION/);
  assert.doesNotMatch(html, /值得留下的想法/);

  assert.match(blog, /latestPosts\([^)]*,\s*3\)/);
  assert.match(blog, /post\.html\?slug=/);
  assert.match(blog, /const card = doc\.createElement\('a'\)/);
  assert.doesNotMatch(blog, /createTextElement\(doc, 'a', 'card-arrow'/);
});

test('blog archive and article pages expose dynamic content hooks', async () => {
  const archive = await read('notes.html');
  const article = await read('post.html');
  const blogJs = await read('blog.js');

  assert.match(archive, /<script src="blog\.js" defer><\/script>/);
  assert.match(archive, /data-blog-list/);
  assert.match(archive, /data-blog-list-empty/);
  assert.match(archive, /我的博客/);
  assert.match(article, /data-blog-article/);
  assert.match(article, /data-blog-article-title/);
  assert.match(article, /data-blog-article-content/);
  assert.match(article, /data-blog-article-previous/);
  assert.match(article, /data-blog-article-next/);
  assert.match(blogJs, /loadPostContent\(/);
  assert.match(blogJs, /URLSearchParams/);
});

test('styles provide cosmic blog archive surfaces and responsive states', async () => {
  const css = await read('styles.css');

  assert.match(css, /\.blog-section\s+\.card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,[^}]*grid-template-rows:\s*repeat\(2,/s);
  assert.match(css, /\.blog-card--featured\s*\{[^}]*grid-column:\s*span\s+2;[^}]*grid-row:\s*1\s*\/\s*span\s+2;/s);
  assert.match(css, /\.blog-card--compact\s*\{[^}]*height:\s*161px;/s);
  assert.match(css, /\.blog-card--compact\s*\{[^}]*min-height:\s*161px;/s);
  assert.match(css, /\.blog-card\s*\{[\s\S]*?position:\s*relative;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.blog-card--featured\s*\{[\s\S]*?min-height:/);
  assert.match(css, /\.blog-card__cover\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/);
  assert.match(css, /\.blog-card__cover-image\s*\{[\s\S]*?object-fit:\s*cover;/);
  assert.match(css, /\.blog-card__cover-fallback[\s\S]*?\{[\s\S]*?background:/);

  assert.match(css, /\.blog-card:hover[\s\S]*?transform:\s*translateY\(-[23]px\)/);
  assert.match(css, /\.blog-card:hover \.blog-card__cover-image[\s\S]*?transform:\s*scale\(1\.0[4-9]\)/);
  assert.match(css, /\.blog-card:hover \.card-arrow[\s\S]*?transform:\s*rotate\(45deg\)/);
  assert.match(css, /\.blog-card\.is-glass-pressed[\s\S]*?transform:\s*translateY\(-[23]px\)/);
  assert.match(css, /\.liquid-glass__shine\s*\{[^}]*display:\s*none;/s);
  assert.doesNotMatch(css, /\.blog-card\s*\{[^}]*radial-gradient/);

  assert.match(css, /\.blog-list\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:/);
  assert.match(css, /\.blog-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.blog-row__media\s*\{[\s\S]*?aspect-ratio:/);
  assert.match(css, /\.blog-row__date\s*\{[\s\S]*?font-family:\s*var\(--mono\)/);
  assert.match(css, /\.blog-row__arrow\s*\{[\s\S]*?border-radius:\s*50%/);
  assert.match(css, /\.blog-row:hover \.blog-row__arrow[\s\S]*?transform:\s*translate\(/);
  assert.match(css, /\.blog-cover-fallback\s*\{[\s\S]*?background:/);

  assert.match(css, /\.blog-article\s*\{[\s\S]*?max-width:/);
  assert.match(css, /\.blog-article__hero\s*\{[\s\S]*?padding:/);
  assert.match(css, /\.blog-article__cover\s*\{[\s\S]*?aspect-ratio:/);
  assert.match(css, /\.blog-article__content\s*\{[\s\S]*?max-width:/);
  assert.match(css, /\.blog-article__content img[\s\S]*?display:\s*block;/);
  assert.match(css, /\.blog-article__content pre[\s\S]*?overflow:\s*auto;/);
  assert.match(css, /\.blog-article__content figcaption\s*\{[\s\S]*?font-family:\s*var\(--mono\)/);
  assert.match(css, /\.blog-article__nav\s*\{[\s\S]*?display:\s*grid;/);
  assert.match(css, /\.blog-empty,[\s\S]*?\.blog-error,[\s\S]*?\{[\s\S]*?border:/);

  assert.match(css, /@media\s*\(max-width:\s*920px\)[\s\S]*?\.blog-section\s+\.card-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /@media\s*\(max-width:\s*920px\)[\s\S]*?\.blog-card--featured\s*\{[\s\S]*?grid-column:\s*span\s+2;[\s\S]*?grid-row:\s*auto;/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.blog-section\s+\.card-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?grid-template-rows:\s*auto;/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.blog-card--featured\s*\{[\s\S]*?grid-column:\s*auto;[\s\S]*?grid-row:\s*auto;/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.blog-row\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.blog-article__nav\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.blog-article\s*\{[\s\S]*?padding-bottom:/);
  assert.match(css, /\.blog-article\s*\{[^}]*padding-bottom:/s);

  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.blog-card:hover[\s\S]*?transform:\s*none\s*!important;/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.blog-card__cover-image[\s\S]*?filter:\s*none\s*!important;/);
});

test('README documents the repository-driven blog publishing workflow', async () => {
  const readme = await read('README.md');

  for (const pattern of [
    /posts\/index\.json/,
    /assets\/blog/,
    /Markdown/,
    /小写短横线/,
    /本地静态服务器/,
    /post\.html\?slug=<slug>/,
    /git add posts assets\/blog/,
    /git commit -m/,
    /git push/,
    /没有网页在线上传后台/,
  ]) {
    assert.match(readme, pattern);
  }
});

test('public page inventory preserves blog entry, shared hooks, and external links', async () => {
  const publicPages = ['index.html', 'projects.html', 'notes.html', 'post.html'];
  const blogPages = ['index.html', 'notes.html', 'post.html'];

  for (const page of publicPages) {
    const html = await read(page);
    assert.match(html, /<nav[^>]*id="site-nav"[\s\S]*href="notes\.html"/);
    assert.match(html, /https:\/\/github\.com\/wandererpg/);
    assert.match(html, /https:\/\/space\.bilibili\.com\/1065241718/);
    assert.match(html, /<link rel="icon" href="favicon\.svg"/);
    assert.match(html, /<script src="clock\.js" defer><\/script>/);
    assert.match(html, /class="header-status"/);
    assert.match(html, /data-current-date/);
    assert.match(html, /data-current-time/);
    assert.match(html, /data-music-player/);
    assert.match(html, /data-music-audio/);
  }

  for (const page of blogPages) {
    const html = await read(page);
    assert.match(html, /<script src="blog\.js" defer><\/script>/);
  }
});
