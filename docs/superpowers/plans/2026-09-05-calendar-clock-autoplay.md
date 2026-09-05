# 北京时间、自动播放与校历近期事项 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为静态个人主页增加北京时间时钟、默认音乐自动播放、无鼠标光晕的卡片交互，以及基于 2026—2027 学年校历（不展示调休上班）的近期事项面板。

**Architecture:** 保持无框架、无后端依赖。新增 `clock.js` 承担北京时间格式化与每秒更新；`calendar.js` 继续负责用户事件，并增加不可变校历数据、日期范围和近期事项合并函数；`script.js` 只调整播放器自动播放与失败提示；三页共享页头和样式。

**Tech Stack:** Semantic HTML5, CSS, vanilla JavaScript, Node.js built-in test runner, local Chromium browser verification.

---

## 文件地图

- `index.html`: 首页页头时钟、日历旁近期事项面板、自动播放音频属性。
- `projects.html`: 共享页头时钟和自动播放音频属性。
- `notes.html`: 共享页头时钟和自动播放音频属性。
- `clock.js`: 北京时间纯格式化函数和页头时钟初始化。
- `calendar.js`: 用户事件、校历范围展开、日历标记、选中日期校历信息和近期事项列表。
- `script.js`: 默认曲目自动播放尝试、浏览器拦截提示及首次用户操作恢复。
- `styles.css`: 页头时钟、近期事项卡片、低对比度校历标记、事件圆点和无鼠标光晕液态玻璃样式。
- `tests/clock.test.mjs`: 北京时区格式化测试。
- `tests/calendar.test.mjs`: 校历数据、日期范围和近期事项测试。
- `tests/site-smoke.mjs`: 三页 HTML/CSS/JS 结构契约测试。

## Task 1: 记录计划契约并锁定时钟与校历范围

**Files:**
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: Write the plan contract test**

在现有设计文档契约测试附近加入：

```js
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
```

- [ ] **Step 2: Run the contract test**

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "calendar clock autoplay plan"
```

Expected: PASS because the approved plan is present and names all confirmed scope boundaries.

- [ ] **Step 3: Commit the implementation plan**

```powershell
git add docs/superpowers/plans/2026-09-05-calendar-clock-autoplay.md tests/site-smoke.mjs
git commit -m "docs: plan calendar clock and autoplay update"
```

## Task 2: Add the shared Beijing time display

**Files:**
- Create: `clock.js`
- Create: `tests/clock.test.mjs`
- Modify: `index.html:7-38`
- Modify: `projects.html:7-38`
- Modify: `notes.html:7-38`
- Modify: `styles.css` in the shared header and mobile media query rules
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: Write the failing clock unit test**

Create `tests/clock.test.mjs`:

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { formatBeijingDateTime } = require('../clock.js');

test('formatBeijingDateTime uses Beijing time across the UTC date boundary', () => {
  const result = formatBeijingDateTime(new Date('2026-09-04T16:05:06.000Z'));

  assert.equal(result.dateText, '2026.09.05 · 周六');
  assert.equal(result.timeText, '00:05:06');
  assert.equal(result.datetime, '2026-09-05T00:05:06+08:00');
});
```

Run:

```powershell
node --test tests/clock.test.mjs
```

Expected: FAIL because `clock.js` does not exist yet.

- [ ] **Step 2: Implement the minimal clock module**

Create `clock.js` with a browser-safe IIFE. `formatBeijingDateTime` must use `Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ... }).formatToParts(date)` and return the tested `{ dateText, timeText, datetime }` object. `initBeijingClock(document)` must find `[data-current-date]` and `[data-current-time]`, render immediately, update both nodes every 1000ms, update the date node’s `dateTime`, and return a cleanup function that clears the interval. Export the API through both `window.WandererClock` and `module.exports`.

- [ ] **Step 3: Add the shared page-head markup**

In the existing header of all three HTML pages, add this status block between the brand and navigation/menu controls:

```html
<div class="header-status" aria-label="当前北京时间">
  <time class="header-status__date" data-current-date datetime="2026-09-05T00:00:00+08:00">2026.09.05 · 周六</time>
  <time class="header-status__time" data-current-time>00:00:00</time>
</div>
```

Add `<script src="clock.js" defer></script>` before `script.js` in every page. The initial text is only a no-JavaScript fallback; `clock.js` replaces it immediately.

- [ ] **Step 4: Style the shared clock without disturbing navigation**

Add a compact right-aligned `.header-status` grid using the existing mono font. Use muted color for the date, cyan-soft for the time, and at `max-width: 680px` reduce the font sizes and keep the block between the navigation area and menu toggle. Do not use `aria-live`, because a seconds clock should not interrupt screen readers once per second.

- [ ] **Step 5: Update and run the page contract test**

Add assertions that every page loads `clock.js`, contains `.header-status`, `[data-current-date]`, and `[data-current-time]`. Run:

```powershell
node --test tests/clock.test.mjs tests/site-smoke.mjs
node --check clock.js
```

Expected: all tests pass and `node --check` exits successfully.

- [ ] **Step 6: Commit the Beijing clock**

```powershell
git add clock.js tests/clock.test.mjs index.html projects.html notes.html styles.css tests/site-smoke.mjs
git commit -m "feat: add shared Beijing time display"
```

## Task 3: Make the default track autoplay and remove the pointer halo

**Files:**
- Modify: `index.html:40-60`
- Modify: `projects.html:40-60`
- Modify: `notes.html:40-60`
- Modify: `script.js:142-171`
- Modify: `styles.css:1748-1790`
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: Write failing autoplay and halo assertions**

Extend the existing music/player smoke test with:

```js
assert.match(js, /loadTrack\(defaultTrackIndex, true\)/);
assert.match(js, /自动播放被拦截/);
assert.match(css, /\.liquid-glass__shine\s*\{[^}]*display:\s*none;/s);
assert.doesNotMatch(css, /radial-gradient\(circle 220px at var\(--glass-x\)/);
assert.doesNotMatch(css, /\.liquid-glass\.is-glass-active\s*\{[\s\S]*?0 0 34px rgba\(119, 230, 255/);

for (const page of ['index.html', 'projects.html', 'notes.html']) {
  const html = await read(page);
  assert.match(html, /<audio[^>]*data-music-audio[^>]*autoplay/);
}
```

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "music player defaults|cross-page transition and music player hooks"
```

Expected: FAIL because the current audio tag is not autoplaying and the current shine uses a cursor-positioned radial gradient.

- [ ] **Step 2: Enable autoplay with an explicit blocked-policy fallback**

Add `autoplay` to each page’s `<audio>` element and change initialization in `script.js` from:

```js
void loadTrack(defaultTrackIndex);
```

to:

```js
void loadTrack(defaultTrackIndex, true);
```

In `playCurrentTrack`, keep successful playback as `正在播放`. For a `NotAllowedError`, use `自动播放被拦截 · 点击页面启用声音`; register document-level `click` and Enter/Space `keydown` recovery handlers so the first user gesture retries playback. For other errors retain `播放失败 · 请检查音频文件`. This makes the desired default behavior work where allowed and provides the strongest browser-compliant fallback where browsers enforce autoplay policy.

- [ ] **Step 3: Remove only the mouse halo**

Replace the `.liquid-glass__shine` rule with `display: none;` and remove the active-state rule that makes it opaque. Keep the pointer event listeners, pointer-derived tilt, press scale, and border feedback. Remove the active-state external cyan `0 0 34px ...` shadow while retaining the inset material highlights and depth shadow.

- [ ] **Step 4: Verify the focused behavior**

Run:

```powershell
node --test tests/site-smoke.mjs --test-name-pattern "music player defaults|cross-page transition and music player hooks"
node --test tests/site-smoke.mjs tests/liquid-glass.test.mjs tests/calendar.test.mjs
node --check script.js
node --check liquid-glass.js
git diff --check
```

Expected: all tests pass, the JavaScript checks pass, and the diff has no whitespace errors.

- [ ] **Step 5: Commit autoplay and halo removal**

```powershell
git add index.html projects.html notes.html script.js styles.css tests/site-smoke.mjs
git commit -m "feat: autoplay music without pointer halo"
```

## Task 4: Add the confirmed school calendar and nearby three-event panel

**Files:**
- Modify: `calendar.js:1-105,151-233,253-327`
- Modify: `index.html:64-116`
- Modify: `styles.css` in calendar rules and the mobile media query
- Modify: `tests/calendar.test.mjs`
- Modify: `tests/site-smoke.mjs`

- [ ] **Step 1: Write failing calendar data tests**

Extend the CommonJS API import in `tests/calendar.test.mjs` with `expandDateRange`, `getSchoolCalendarEvents`, `getUpcomingEvents`, and `schoolEventsForDate`. Add:

```js
test('school calendar contains confirmed student and holiday dates only', () => {
  const schedule = getSchoolCalendarEvents();

  assert.equal(schedule.some((event) => event.title.includes('教师')), false);
  assert.equal(schedule.some((event) => event.title.includes('调休上班')), false);
  assert.deepEqual(schoolEventsForDate('2026-09-20'), []);
  assert.deepEqual(
    schoolEventsForDate('2026-09-26').map((event) => event.title),
    ['中秋节放假'],
  );
  assert.deepEqual(
    schoolEventsForDate('2026-10-03').map((event) => event.title),
    ['国庆节放假'],
  );
  assert.deepEqual(
    schoolEventsForDate('2027-01-11').map((event) => event.title),
    ['学生寒假'],
  );
  assert.deepEqual(
    schoolEventsForDate('2027-02-21').map((event) => event.title),
    ['学生注册'],
  );
});

test('school date ranges expand and upcoming events keep holiday ranges grouped', () => {
  assert.deepEqual(
    expandDateRange('2026-09-25', '2026-09-27'),
    ['2026-09-25', '2026-09-26', '2026-09-27'],
  );

  const upcoming = getUpcomingEvents(
    [{ id: 'event-1', date: '2026-09-18', title: '整理网站', note: '', createdAt: '2026-09-05T12:00:00.000Z' }],
    '2026-09-05',
  );

  assert.equal(upcoming.length, 3);
  assert.deepEqual(upcoming.slice(0, 3).map((event) => [event.title, event.start, event.end]), [
    ['整理网站', '2026-09-18', '2026-09-18'],
    ['中秋节放假', '2026-09-25', '2026-09-27'],
    ['国庆节放假', '2026-10-01', '2026-10-07'],
  ]);
});
```

Run:

```powershell
node --test tests/calendar.test.mjs --test-name-pattern "school calendar|school date ranges"
```

Expected: FAIL because the calendar module has no school schedule API.

- [ ] **Step 2: Add immutable confirmed school schedule APIs**

Add a frozen schedule to `calendar.js` with exactly these records;调休上班安排不进入数据源：

```js
[
  { id: 'school-mid-autumn-2026', title: '中秋节放假', start: '2026-09-25', end: '2026-09-27', type: 'holiday' },
  { id: 'school-national-day-2026', title: '国庆节放假', start: '2026-10-01', end: '2026-10-07', type: 'holiday' },
  { id: 'school-student-winter-break-2027', title: '学生寒假', start: '2027-01-11', end: '2027-02-20', type: 'break' },
  { id: 'school-student-registration-2027', title: '学生注册', start: '2027-02-21', end: '2027-02-21', type: 'school' },
]
```

Implement `expandDateRange(start, end = start)` using date-key arithmetic rather than locale parsing; `schoolEventsForDate(dateKey)` must match inclusive ranges; `getSchoolCalendarEvents()` must return a new array of the frozen records; and `getUpcomingEvents(userEvents, todayKey)` must normalize one-day user events to `start === end`, discard records whose `end` is before `todayKey`, sort by `start` then title, and return only the first three records. Export all four APIs without changing existing CRUD behavior.

- [ ] **Step 3: Render school marks and selected-date schedule entries**

In `renderMonth`, combine user event count with `schoolEventsForDate(cell.dateKey)`, add schedule titles to each day button’s accessible label, add a low-contrast `has-events` treatment, and render one small bottom-right dot per combined event. Keep holiday/break/school text markers; no `is-workday` class or workday record is needed.

In `renderEvents`, prepend read-only school schedule rows to user event rows. School rows show the title and a `校历` label and have no edit/delete controls. User rows keep their current controls and local-storage behavior. Call the upcoming renderer after every month/date/event mutation so the panel stays current.

- [ ] **Step 4: Add the nearby upcoming-events markup**

Wrap the existing home calendar in this layout inside `.hero-copy`:

```html
<div class="calendar-layout">
  <section class="home-calendar liquid-glass" data-liquid-glass data-calendar aria-labelledby="calendar-title">
    <!-- existing calendar markup -->
  </section>
  <aside class="upcoming-events" data-upcoming-events aria-labelledby="upcoming-events-title">
    <span class="calendar-kicker">Upcoming</span>
    <h2 id="upcoming-events-title">近期事件</h2>
    <ol class="upcoming-events__list" data-upcoming-list></ol>
    <p class="upcoming-events__empty" data-upcoming-empty hidden>暂无近期事件</p>
  </aside>
</div>
```

In `calendar.js`, render each normalized item with title, date/range, and a relative label (`进行中`, `今天`, `明天`, or `N 天后`). Use an ordered list and text nodes so user-entered event text remains escaped. Keep the panel read-only.

- [ ] **Step 5: Style the compact panel and schedule markers**

Add a two-column `.calendar-layout` with a narrow `.upcoming-events` card at desktop widths; reduce it to one column under `680px`. Keep the calendar fluid and preserve the previous compact footprint. Use faded event-date colors, one dot per event, and readable holiday/break/school labels without relying only on color. Do not style or render compensatory workday events. Add `overflow-wrap: anywhere` to long event titles.

- [ ] **Step 6: Add page and style smoke assertions**

Assert in `tests/site-smoke.mjs` that `index.html` contains `[data-upcoming-events]`, `[data-upcoming-list]`, and the calendar script; that `calendar.js` contains the confirmed schedule titles and `getUpcomingEvents`, has no teacher or compensatory-workday title, and renders dot hooks; and that all three pages keep the shared calendar-independent player and clock hooks.

- [ ] **Step 7: Verify calendar behavior and the full suite**

Run:

```powershell
node --test tests/calendar.test.mjs --test-name-pattern "school calendar|school date ranges"
node --test tests/site-smoke.mjs tests/liquid-glass.test.mjs tests/calendar.test.mjs tests/clock.test.mjs
node --check calendar.js
node --check clock.js
node --check script.js
git diff --check
```

Expected: all tests pass with zero failures and all syntax/diff checks succeed.

- [ ] **Step 8: Commit the school calendar and nearby events**

```powershell
git add calendar.js index.html styles.css tests/calendar.test.mjs tests/site-smoke.mjs
git commit -m "feat: add school calendar and upcoming events"
```

## Task 5: Browser verification and delivery

**Files:**
- Verify: `index.html`
- Verify: `projects.html`
- Verify: `notes.html`
- Verify: `clock.js`
- Verify: `calendar.js`
- Verify: `script.js`
- Verify: `styles.css`

- [ ] **Step 1: Confirm the preview is reachable**

Run:

```powershell
(Invoke-WebRequest -Uri 'http://localhost:4173/index.html' -UseBasicParsing).StatusCode
```

Expected: `200`.

- [ ] **Step 2: Verify desktop behavior at 1440 × 1000**

Use local Chromium and confirm all pages show the Beijing date/time in the upper-right, with seconds changing after one second. Confirm the homepage shows the nearby panel beside the calendar, the three nearest grouped events are ordered by date, and 2026-09-25 through 2026-09-27 remain grouped as one upcoming item. Hover cards and confirm there is no cursor-following halo, while the existing tilt and press feedback remain available. Confirm the station panel does not move downward.

- [ ] **Step 3: Verify mobile behavior at 390 × 844**

Confirm no horizontal overflow on all pages, the header date/time does not overlap the menu toggle, the upcoming panel stacks below the calendar, and the fixed music player remains within the viewport.

- [ ] **Step 4: Verify autoplay policy behavior**

Load the homepage in Chromium with autoplay allowed and confirm the audio element uses the default `夜の向日葵` source and enters playing state. Load once with normal browser policy and confirm either playback begins or the status reads `自动播放被拦截 · 点击页面启用声音`; click a blank page area and confirm playback then starts through the user-gesture recovery handler.

- [ ] **Step 5: Verify reduced motion and final checks**

With `prefers-reduced-motion: reduce`, confirm cards have no pointer halo, ambient animations remain static, while the clock, calendar, upcoming list, and player controls remain usable. Finish with:

```powershell
node --test tests/site-smoke.mjs tests/liquid-glass.test.mjs tests/calendar.test.mjs tests/clock.test.mjs
node --check calendar.js
node --check clock.js
node --check liquid-glass.js
node --check script.js
git diff --check
git push origin master
git status --short --branch
```

Expected: every test and check passes, `master` matches `origin/master`, and the worktree is clean.
