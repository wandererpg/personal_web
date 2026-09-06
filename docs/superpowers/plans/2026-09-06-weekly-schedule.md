# 每周课程表实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在现有原生 HTML、CSS、Node/Express 站点中加入服务器保存的每周课程表、首页紧凑摘要、完整周视图和受管理员权限保护的编辑页。

**Architecture:** 用可在浏览器和 Node 中复用的 schedule-model.js 统一时间轴、周次计算、课程筛选和冲突规则；用 server/schedule-store.js 将经过校验的课表原子写入现有 BLOG_DATA_DIR/schedule.json。公开页面通过 GET /api/schedule 读取，后台通过现有 Session/CSRF 保护的 GET/PUT /api/admin/schedule 管理。

**Tech Stack:** 原生 HTML5、CSS、浏览器 JavaScript、Node.js CommonJS/UMD 模块、Express 5、Node 内置测试运行器、Supertest。

---

## 文件地图

- Create: schedule-model.js — 12 节时间模板、日期键、周次计算、课程筛选和纯校验函数；浏览器挂载 window.WandererSchedule，Node 通过 require 使用。
- Create: schedule.js — 公开首页摘要和完整课表页控制器，只负责读取公开 API、渲染和周次切换。
- Create: schedule.html — 访客只读的完整周课表页。
- Create: server/schedule-store.js — 读取、校验、原子保存服务器课表文件。
- Create: server/schedule-api.js — 公开读取路由和管理员读写路由。
- Create: admin/schedule.html — 受保护的课表管理界面。
- Create: admin/schedule.js — 后台课程列表、设置、编辑面板、保存和删除行为。
- Create: tests/schedule.test.mjs — 时间轴、日期、周次、课程筛选和冲突单元测试。
- Create: tests/schedule-store.test.mjs — 默认数据、JSON 读写、原子保存和损坏文件测试。
- Modify: server/app.js — 挂载 API、注册公开页面和后台页面/脚本白名单。
- Modify: tests/helpers/admin-fixture.mjs — 为 API 测试提供独立数据目录和可注入的课表存储。
- Modify: tests/admin-api.test.mjs — 覆盖管理员权限、CSRF、读写和冲突响应。
- Modify: tests/site-smoke.mjs — 覆盖页面入口、脚本钩子、视觉类名、文档和 public allowlist。
- Modify: index.html — 在右侧站点卡片下增加首页紧凑课表卡片，并加载课程表脚本。
- Modify: styles.css — 调整右侧卡片顶部对齐，增加首页摘要和完整课表的星空/玻璃样式、响应式和 reduced-motion 状态。
- Modify: admin/admin.css — 增加课程列表、设置面板、周次选择和表单状态样式。

## 数据与接口约定

课表文件结构固定为：

~~~json
{
  "version": 1,
  "termStart": "2026-09-07",
  "totalWeeks": 20,
  "courses": [
    {
      "id": "course-1",
      "name": "计算物理基础",
      "teacher": "赵虎",
      "room": "九 202",
      "weekday": 3,
      "startPeriod": 1,
      "endPeriod": 2,
      "weeks": [1, 2, 3, 4, 5],
      "color": "mint"
    }
  ]
}
~~~

termStart 必须是周一；totalWeeks 为 1–60；weekday 为 1–7；节次为 1–12；weeks 去重升序并在学期范围内；颜色只允许 mint、pink、blue、orange。默认时间轴为：08:00–08:45、08:55–09:40、10:00–10:45、10:55–11:40、13:30–14:15、14:25–15:10、15:30–16:15、16:35–17:20、18:00–18:45、18:55–19:40、20:00–20:45、20:55–21:40。

接口约定：

- GET /api/schedule → { schedule }，缺少课表文件时返回默认空课表。
- GET /api/admin/schedule → { schedule }，要求登录。
- PUT /api/admin/schedule → 接收完整 schedule，要求登录和 x-csrf-token，保存成功返回 { schedule }。
- 校验失败返回 SCHEDULE_VALIDATION 和 400；课程冲突返回 SCHEDULE_CONFLICT 和 409；未登录/CSRF 错误复用现有 401/403 响应。

### Task 1: 建立课程表纯模型

**Files:**
- Create: tests/schedule.test.mjs
- Create: schedule-model.js

- [ ] Step 1: Write the failing tests for the fixed time axis and week model

通过 createRequire 引入 schedule-model.js，先覆盖以下行为：

~~~javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  PERIODS, calculateWeek, coursesForWeek, validateSchedule,
} = require('../schedule-model.js');

test('periods match the supplied twelve-period timetable', () => {
  assert.equal(PERIODS.length, 12);
  assert.deepEqual(PERIODS[0], { index: 1, start: '08:00', end: '08:45' });
  assert.deepEqual(PERIODS[4], { index: 5, start: '13:30', end: '14:15' });
  assert.deepEqual(PERIODS[11], { index: 12, start: '20:55', end: '21:40' });
});

test('calculateWeek uses a Monday term start and handles boundaries', () => {
  const term = { termStart: '2026-09-07', totalWeeks: 20 };
  assert.deepEqual(calculateWeek('2026-09-06', term), { week: 1, state: 'before' });
  assert.deepEqual(calculateWeek('2026-09-07', term), { week: 1, state: 'active' });
  assert.deepEqual(calculateWeek('2026-09-13', term), { week: 1, state: 'active' });
  assert.deepEqual(calculateWeek('2026-09-14', term), { week: 2, state: 'active' });
  assert.deepEqual(calculateWeek('2027-01-25', term), { week: 20, state: 'active' });
  assert.deepEqual(calculateWeek('2027-02-01', term), { week: 20, state: 'after' });
});

test('coursesForWeek filters by selected week and leaves the input untouched', () => {
  const courses = [
    { id: 'a', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 3] },
    { id: 'b', weekday: 2, startPeriod: 3, endPeriod: 4, weeks: [2] },
  ];
  assert.deepEqual(coursesForWeek(courses, 1).map(course => course.id), ['a']);
  assert.deepEqual(coursesForWeek(courses, 2).map(course => course.id), ['b']);
  assert.deepEqual(courses, [
    { id: 'a', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 3] },
    { id: 'b', weekday: 2, startPeriod: 3, endPeriod: 4, weeks: [2] },
  ]);
});

test('validateSchedule rejects invalid fields and overlapping courses', () => {
  const base = {
    version: 1, termStart: '2026-09-07', totalWeeks: 20,
    courses: [{ id: 'a', name: 'A', teacher: 'T', room: 'R', weekday: 1,
      startPeriod: 1, endPeriod: 2, weeks: [1], color: 'mint' }],
  };
  assert.deepEqual(validateSchedule(base).courses[0], base.courses[0]);
  assert.throws(() => validateSchedule({ ...base, termStart: '2026-09-08' }), /周一/);
  assert.throws(() => validateSchedule({ ...base, courses: [{ ...base.courses[0], weeks: [21] }] }), /周次/);
  assert.throws(() => validateSchedule({ ...base, courses: [
    ...base.courses, { ...base.courses[0], id: 'b', name: 'B', startPeriod: 2 }
  ] }), /冲突/);
});
~~~

- [ ] Step 2: Run the focused test and verify the expected missing-module failure

Run: node --test tests/schedule.test.mjs

Expected: FAIL because schedule-model.js does not exist.

- [ ] Step 3: Implement the minimal UMD model

Create schedule-model.js with browser/Node dual export and these public members:

~~~javascript
const api = {
  DEFAULT_SCHEDULE,
  PERIODS,
  calculateWeek,
  coursesForDate,
  coursesForWeek,
  getWeekDates,
  validateSchedule,
};
~~~

Use UTC date arithmetic on YYYY-MM-DD keys so Windows local time cannot move a class across a day. calculateWeek(dateKey, { termStart, totalWeeks }) returns { week, state }, clamps before-term dates to week 1 and after-term dates to the last week, and returns state: 'unconfigured' when no term start exists. coursesForDate requires both the matching weekday and selected week. validateSchedule returns a normalized defensive copy and throws errors with the Chinese messages used by the API.

- [ ] Step 4: Run the focused tests and syntax checks

Run: node --test tests/schedule.test.mjs && node --check schedule-model.js

Expected: all model tests pass and Node reports no syntax errors.

- [ ] Step 5: Commit the model

~~~powershell
git add schedule-model.js tests/schedule.test.mjs
git commit -m "feat: add weekly schedule model"
~~~

### Task 2: Add server persistence and schedule API

**Files:**
- Create: server/schedule-store.js
- Create: server/schedule-api.js
- Create: tests/schedule-store.test.mjs
- Modify: server/app.js
- Modify: tests/helpers/admin-fixture.mjs
- Modify: tests/admin-api.test.mjs

- [ ] Step 1: Write failing store and API tests

Add store tests for missing-file defaults, valid JSON round-trip, corrupted JSON rejection, fixed data-directory path, and atomic save behavior. Add API tests with createAdminFixture() for:

~~~javascript
test('public schedule API returns an empty default schedule', async () => {
  const fixture = await createAdminFixture();
  const response = await request(fixture.app).get('/api/schedule').expect(200);
  assert.equal(response.body.schedule.courses.length, 0);
  assert.equal(response.body.schedule.version, 1);
});

test('schedule mutations require authentication and CSRF', async () => {
  const fixture = await createAdminFixture();
  await request(fixture.app).get('/api/admin/schedule').expect(401);
  const { agent } = await fixture.login();
  await agent.put('/api/admin/schedule').send({}).expect(403, { error: 'CSRF_TOKEN_INVALID' });
});

test('authenticated admin can save and read a schedule', async () => {
  const fixture = await createAdminFixture();
  const { agent, csrfToken } = await fixture.login();
  const schedule = {
    version: 1, termStart: '2026-09-07', totalWeeks: 20,
    courses: [{ id: 'course-1', name: '计算物理基础', teacher: '赵虎', room: '九 202',
      weekday: 3, startPeriod: 1, endPeriod: 2, weeks: [1, 2], color: 'mint' }],
  };
  await agent.put('/api/admin/schedule').set('x-csrf-token', csrfToken)
    .send(schedule).expect(200, { schedule });
  await request(fixture.app).get('/api/schedule').expect(200, { schedule });
});
~~~

- [ ] Step 2: Run the tests and verify the expected route failures

Run: node --test tests/schedule-store.test.mjs tests/admin-api.test.mjs

Expected: FAIL because the store, routes, and app mounting do not exist.

- [ ] Step 3: Implement server/schedule-store.js

Export createScheduleStore({ dataDir }) with read() and write(schedule). Resolve only dataDir/schedule.json; never accept a client-supplied path. read() returns DEFAULT_SCHEDULE when the file is absent, parses and normalizes valid JSON, and throws SCHEDULE_INVALID for malformed or invalid content. write() validates first, writes schedule.json.tmp-<safe random suffix>, renames it over the target, and returns the normalized schedule. Do not return dataDir or absolute paths in API errors.

- [ ] Step 4: Implement server/schedule-api.js and mount it

Export createPublicScheduleRouter({ scheduleStore }) and createAdminScheduleRouter({ scheduleStore, auth }). The public router handles GET /; the admin router handles GET / and PUT /, with PUT composed as auth.requireCsrf. Map SCHEDULE_VALIDATION to 400, SCHEDULE_CONFLICT to 409, SCHEDULE_INVALID to 500, and preserve existing auth/CSRF responses.

In server/app.js:

- create or accept options.scheduleStore using config.dataDir;
- mount the public router at /api/schedule;
- mount the admin router at /api/admin/schedule inside the existing authenticated admin setup;
- pass the injected store through installAdmin without creating a second store.

Update tests/helpers/admin-fixture.mjs to allow an injected scheduleStore and otherwise use the real store against its isolated temporary data directory.

- [ ] Step 5: Run server tests and syntax checks

Run: node --test tests/schedule.test.mjs tests/schedule-store.test.mjs tests/admin-api.test.mjs && node --check server/schedule-store.js && node --check server/schedule-api.js && node --check server/app.js

Expected: all schedule and existing admin API tests pass.

- [ ] Step 6: Commit server persistence and API

~~~powershell
git add schedule-model.js server/schedule-store.js server/schedule-api.js server/app.js tests/schedule-store.test.mjs tests/admin-api.test.mjs tests/helpers/admin-fixture.mjs
git commit -m "feat: persist weekly schedule on the server"
~~~

### Task 3: Build the public full-week schedule page

**Files:**
- Create: schedule.html
- Create: schedule.js
- Modify: server/app.js
- Modify: styles.css
- Modify: tests/site-smoke.mjs

- [ ] Step 1: Add failing public page smoke assertions

Extend tests/site-smoke.mjs to require schedule.html, schedule-model.js, schedule.js, and these hooks: data-schedule, data-schedule-grid, data-schedule-week, data-schedule-prev, data-schedule-current, data-schedule-next, data-schedule-settings-link, data-schedule-status. Assert that styles.css contains schedule-page, schedule-grid, schedule-course, the twelve period labels, overflow, and prefers-reduced-motion. Assert that PUBLIC_ROOT_FILES includes schedule.html, schedule-model.js, and schedule.js.

- [ ] Step 2: Run the smoke test and verify it fails because the page is missing

Run: node --test tests/site-smoke.mjs

Expected: FAIL because schedule.html and the new integration hooks do not exist.

- [ ] Step 3: Create the semantic read-only page

Create schedule.html with the shared header, Beijing clock, music player, transition hooks, and a main section containing:

~~~html
<main class="schedule-page" data-schedule aria-labelledby="schedule-title">
  <section class="page-hero container">
    <span class="section-label">WEEKLY ORBIT / PUBLIC VIEW</span>
    <h1 id="schedule-title">我的每周课表</h1>
    <p data-schedule-status>正在读取课表…</p>
  </section>
  <section class="schedule-shell container" aria-live="polite">
    <header class="schedule-toolbar">
      <div><span class="section-label">CURRENT WEEK</span><h2 data-schedule-week>第 1 周</h2><p data-schedule-range></p></div>
      <nav class="schedule-nav" aria-label="周次导航">
        <button type="button" data-schedule-prev aria-label="上一周">←</button>
        <button type="button" data-schedule-current>本周</button>
        <button type="button" data-schedule-next aria-label="下一周">→</button>
      </nav>
    </header>
    <div class="schedule-grid" data-schedule-grid role="grid" aria-label="每周课表"></div>
    <a class="text-link" data-schedule-settings-link href="/admin/schedule">进入管理</a>
  </section>
</main>
~~~

Load schedule-model.js before schedule.js; render user content with textContent.

- [ ] Step 4: Implement schedule.js public controller

Activate only when data-schedule or data-schedule-summary exists. Fetch /api/schedule, store the normalized schedule in memory, initialize the current week using the Beijing date, and render the week title, date range, fixed period column, seven weekday columns, and course blocks positioned by grid-row/grid-column. Each block displays course name, teacher, and room without HTML interpolation. Implement previous/current/next controls plus before, active, after, unconfigured, empty, and fetch-error states.

Use a setTimeout scheduled for the next Beijing Monday boundary and a visibilitychange listener to re-evaluate the current week. Manual week navigation is not overwritten until the user selects 本周.

- [ ] Step 5: Add public visual styling

Add schedule-page, schedule-shell, schedule-toolbar, schedule-grid, schedule-period, schedule-day, schedule-course, schedule-course--mint/pink/blue/orange, schedule-empty, and responsive rules to styles.css. Use a horizontally scrollable board on narrow screens, keep the period column identifiable, preserve the deep-space background and glass borders, and add visible focus states. Course text must remain visible without hover. Add schedule selectors to the existing reduced-motion rule.

- [ ] Step 6: Mount the public page and run checks

Add schedule.html to the root public file allowlist, add schedule-model.js and schedule.js to the allowlist, and ensure /schedule.html is served by the existing safe public server.

Run: node --test tests/schedule.test.mjs tests/site-smoke.mjs && node --check schedule.js && node --check schedule-model.js && git diff --check

Expected: all tests pass and the public controller parses.

- [ ] Step 7: Commit the public page

~~~powershell
git add schedule.html schedule.js schedule-model.js styles.css server/app.js tests/site-smoke.mjs
git commit -m "feat: add public weekly schedule view"
~~~

### Task 4: Add the homepage compact schedule and move the station card upward

**Files:**
- Modify: index.html
- Modify: schedule.js
- Modify: styles.css
- Modify: tests/site-smoke.mjs

- [ ] Step 1: Add failing homepage integration assertions

Add a smoke test requiring index.html to contain data-schedule-summary, data-schedule-summary-link="schedule.html", data-schedule-summary-week, data-schedule-summary-list, and data-schedule-summary-empty. Assert that the hero visual uses a stack wrapper and CSS aligns the station card to the top and places the schedule summary below it.

- [ ] Step 2: Run the smoke test and verify the homepage hooks are absent

Run: node --test tests/site-smoke.mjs

Expected: FAIL because the homepage has no schedule summary hooks or station stack.

- [ ] Step 3: Add the compact summary markup

In index.html, wrap the existing station panel in hero-visual__stack, keep it first, and add immediately below:

~~~html
<section class="home-schedule liquid-glass" data-schedule-summary aria-labelledby="home-schedule-title">
  <header class="home-schedule__header">
    <div><span class="section-label">WEEKLY ORBIT</span><h2 id="home-schedule-title" data-schedule-summary-week>本周课表</h2></div>
    <a class="text-link" data-schedule-summary-link href="schedule.html">完整课表 ↗</a>
  </header>
  <p class="home-schedule__range" data-schedule-summary-range></p>
  <ol class="home-schedule__list" data-schedule-summary-list></ol>
  <p class="home-schedule__empty" data-schedule-summary-empty hidden>本周暂无课程</p>
</section>
~~~

Load schedule-model.js and schedule.js on the homepage without changing existing calendar behavior.

- [ ] Step 4: Render the B-style summary

Extend schedule.js with a summary controller that shows current-day courses first, then remaining courses in the current week, limits the visible list to five items, and labels each item with weekday, period range, course name, teacher, and room. Clicking the summary card or its link navigates to schedule.html; there are no edit controls on the public homepage.

- [ ] Step 5: Adjust the right-side layout and responsive states

Add hero-visual__stack with align-items: stretch and align-self: start so the station card moves upward. Style home-schedule below it with the same transparent glass surface, a compact list, course color markers, and an error/empty state. On mobile, let the station and schedule cards flow vertically without covering the fixed music player.

- [ ] Step 6: Run checks and commit the homepage integration

Run: node --test tests/schedule.test.mjs tests/site-smoke.mjs && node --check schedule.js && git diff --check

Expected: all tests pass, the homepage exposes the compact summary, and no whitespace errors are reported.

~~~powershell
git add index.html schedule.js styles.css tests/site-smoke.mjs
git commit -m "feat: add compact schedule to homepage"
~~~

### Task 5: Implement the protected admin schedule editor

**Files:**
- Create: admin/schedule.html
- Create: admin/schedule.js
- Modify: server/app.js
- Modify: admin/admin.css
- Modify: tests/admin-api.test.mjs
- Modify: tests/site-smoke.mjs

- [ ] Step 1: Add failing admin page and behavior tests

Add smoke assertions for /admin/schedule route registration, admin/schedule.html, admin/schedule.js, and the hooks data-admin-schedule, data-schedule-settings-form, data-course-list, data-course-form, data-course-weeks, data-course-save, and data-schedule-save-state. Add API tests for invalid course fields, overlapping weeks/periods returning 409, valid updates returning normalized data, and deletion through a subsequent full-document save.

- [ ] Step 2: Run the focused tests and verify the missing page/hooks

Run: node --test tests/admin-api.test.mjs tests/site-smoke.mjs

Expected: FAIL because /admin/schedule and its editor assets do not exist.

- [ ] Step 3: Register the protected admin page and assets

In server/app.js, add schedule.js to the admin asset route list under /admin/schedule.js, add schedule.html to the page route guarded by requireAdminPage, and do not expose the admin HTML through PUBLIC_ROOT_FILES.

- [ ] Step 4: Create the B-style admin page

Use the existing admin shell and styles. The main area contains:

- a 学期设置 form for Monday termStart and totalWeeks;
- a course list showing name, weekday, sections, room, and weeks;
- a 新增课程 button;
- an edit panel with name, teacher, room, weekday, start/end section, color, and 1–60 week checkboxes;
- full-select, clear, odd-week, even-week week controls;
- save, cancel, and delete actions;
- a save state and a visible error region.

All labels and controls must be keyboard reachable, and course/user text must be assigned with textContent rather than HTML interpolation.

- [ ] Step 5: Implement admin/schedule.js with the existing AdminApi

On load, request /api/admin/schedule; redirect to /admin/login for 401. Maintain an in-memory schedule and selected course ID. Add/edit operations update the local list, validate required fields before sending, and issue one PUT /api/admin/schedule with the complete document. Delete removes the selected course after window.confirm. Show server validation/conflict messages without clearing the current form. On successful save, refresh the list and show 已保存.

- [ ] Step 6: Style the editor and verify the admin flow

Add admin schedule styles for the two-column desktop layout, narrow-screen stacked layout, translucent course rows, week checkbox grid, color swatches, conflict/error states, and focus indicators.

Run:

~~~powershell
node --test tests/schedule.test.mjs tests/schedule-store.test.mjs tests/admin-api.test.mjs tests/site-smoke.mjs
node --check admin/schedule.js
node --check server/app.js
git diff --check
~~~

Expected: all schedule, API, and smoke tests pass.

- [ ] Step 7: Commit the protected editor

~~~powershell
git add admin/schedule.html admin/schedule.js admin/admin.css server/app.js tests/admin-api.test.mjs tests/site-smoke.mjs
git commit -m "feat: add protected schedule editor"
~~~

### Task 6: Final integration, browser QA, and delivery

**Files:**
- Modify only the specific source file and matching test file if a verification issue is found.

- [ ] Step 1: Run the complete automated suite

Run: npm test

Expected: all existing and new tests pass with zero failures.

- [ ] Step 2: Verify public and admin route behavior

Against the configured local server:

1. Open / and confirm the station card is higher with the compact schedule underneath.
2. Open /schedule.html and confirm the 7-day × 12-period board, date range, course blocks, and week navigation.
3. Open /admin/schedule while logged out and confirm redirect to /admin/login.
4. Log in, set a Monday semester start and total weeks, add a course with teacher, room, sections, color, and selected weeks, then save.
5. Reload the admin page and confirm the course persists.
6. Open the public homepage and full schedule page and confirm the course is visible only in its selected weeks.
7. Attempt an overlapping course and confirm the editor shows a conflict without losing the current form.
8. Delete the course, save, reload, and confirm it is absent from all public views.

- [ ] Step 3: Verify mobile, week boundary, and accessibility behavior

At a 390px-wide viewport confirm the schedule board can scroll horizontally, the period column remains identifiable, the summary stays within the viewport, and the music player does not cover form actions. Test keyboard focus through navigation and all editor fields. Set a date fixture around Sunday/Monday and confirm the calculated week changes at the Beijing Monday boundary. Enable reduced motion and confirm no essential content depends on animation.

- [ ] Step 4: Inspect final diff and repository state

Run:

~~~powershell
git diff --check
git status --short
git log -8 --oneline
~~~

Expected: no whitespace errors; only the intentionally untracked Screenshot_20260906_151754_com_suda_yzune_wakeups.jpg and f3c000b265e5463c8f4aa6c7266181c8.jpg remain untracked; all feature changes are committed; no remote push is performed unless separately requested.
