# Editable Home Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home hero title and description with an editable month calendar that stores multiple events per date in the current browser.

**Architecture:** Add a focused `calendar.js` module containing pure month/event functions, defensive `localStorage` access, and a DOM controller that activates only when `[data-calendar]` exists. Keep page transitions and music behavior in `script.js`; add semantic calendar markup to `index.html` and visual styling to `styles.css`.

**Tech Stack:** Static HTML5, CSS, browser JavaScript, `localStorage`, Node.js built-in test runner.

---

## File map

- Create `calendar.js`: calendar date generation, event CRUD, persistence, and home-page controller.
- Create `tests/calendar.test.mjs`: unit coverage for month generation, event CRUD, and storage failures.
- Modify `index.html`: replace the approved hero copy with semantic calendar markup and load `calendar.js`.
- Modify `styles.css`: add the A-layout deep-space calendar, responsive behavior, focus states, and form states.
- Modify `tests/site-smoke.mjs`: verify the old copy is gone and all calendar integration hooks are present.

### Task 1: Calendar grid and event model

**Files:**
- Create: `tests/calendar.test.mjs`
- Create: `calendar.js`

- [ ] **Step 1: Write failing tests for month cells and multiple events**

```javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  addEvent,
  buildMonthDays,
  eventsForDate,
  removeEvent,
  updateEvent,
} = require('../calendar.js');

test('buildMonthDays creates a Monday-first six-week grid', () => {
  const days = buildMonthDays(2026, 8);
  assert.equal(days.length, 42);
  assert.equal(days[0].dateKey, '2026-08-31');
  assert.equal(days[1].dateKey, '2026-09-01');
  assert.equal(days[41].dateKey, '2026-10-11');
});

test('event CRUD keeps multiple events on one date', () => {
  const options = {
    createId: (() => { let id = 0; return () => `event-${++id}`; })(),
    now: () => '2026-09-05T12:00:00.000Z',
  };
  let events = addEvent([], { date: '2026-09-05', title: '发布网站', note: '' }, options);
  events = addEvent(events, { date: '2026-09-05', title: '整理说明', note: '补充文档' }, options);
  assert.equal(eventsForDate(events, '2026-09-05').length, 2);

  events = updateEvent(events, 'event-2', { title: '整理项目说明', note: '完成 README' });
  assert.equal(events[1].title, '整理项目说明');

  events = removeEvent(events, 'event-1');
  assert.deepEqual(events.map((event) => event.id), ['event-2']);
});

test('event titles are required after trimming', () => {
  assert.throws(
    () => addEvent([], { date: '2026-09-05', title: '   ', note: '' }),
    /事件标题不能为空/,
  );
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run: `node --test tests/calendar.test.mjs`

Expected: FAIL because `../calendar.js` does not exist.

- [ ] **Step 3: Implement the pure calendar and event functions**

Create `calendar.js` with these public functions and CommonJS export support:

```javascript
(function initCalendarModule(globalScope) {
  const pad = (value) => String(value).padStart(2, '0');
  const formatDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  const buildMonthDays = (year, monthIndex) => {
    const firstDay = new Date(year, monthIndex, 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, monthIndex, 1 - mondayOffset + index);
      return {
        dateKey: formatDateKey(date),
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === monthIndex,
      };
    });
  };

  const validateInput = (input) => {
    const title = String(input.title ?? '').trim();
    if (!title) throw new Error('事件标题不能为空');
    return {
      date: String(input.date),
      title,
      note: String(input.note ?? '').trim(),
    };
  };

  const addEvent = (events, input, options = {}) => {
    const value = validateInput(input);
    const createId = options.createId ?? (() => globalScope.crypto?.randomUUID?.() ?? `event-${Date.now()}`);
    const now = options.now ?? (() => new Date().toISOString());
    return [...events, { id: createId(), ...value, createdAt: now() }];
  };

  const updateEvent = (events, id, input) => {
    const value = validateInput({ ...input, date: events.find((event) => event.id === id)?.date });
    return events.map((event) => event.id === id ? { ...event, ...value } : event);
  };

  const removeEvent = (events, id) => events.filter((event) => event.id !== id);
  const eventsForDate = (events, dateKey) => events.filter((event) => event.date === dateKey);

  const api = { addEvent, buildMonthDays, eventsForDate, formatDateKey, removeEvent, updateEvent };
  globalScope.WandererCalendar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the focused and existing tests**

Run: `node --test tests/calendar.test.mjs tests/site-smoke.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the model**

```powershell
git add calendar.js tests/calendar.test.mjs
git commit -m "feat: add calendar event model"
```

### Task 2: Defensive browser persistence

**Files:**
- Modify: `tests/calendar.test.mjs`
- Modify: `calendar.js`

- [ ] **Step 1: Add failing tests for loading, saving, and corrupted data**

```javascript
test('loadEvents filters malformed records and handles invalid JSON', () => {
  const valid = {
    id: 'event-1',
    date: '2026-09-05',
    title: '发布网站',
    note: '',
    createdAt: '2026-09-05T12:00:00.000Z',
  };
  assert.deepEqual(loadEvents({ getItem: () => JSON.stringify([valid, { title: '' }]) }), [valid]);
  assert.deepEqual(loadEvents({ getItem: () => '{broken' }), []);
  assert.deepEqual(loadEvents({ getItem: () => { throw new Error('denied'); } }), []);
});

test('saveEvents reports whether persistence succeeded', () => {
  let saved = '';
  assert.equal(saveEvents({ setItem: (_key, value) => { saved = value; } }, []), true);
  assert.equal(saved, '[]');
  assert.equal(saveEvents({ setItem: () => { throw new Error('full'); } }, []), false);
});
```

Add `loadEvents` and `saveEvents` to the destructured imports.

- [ ] **Step 2: Run the focused test and verify missing exports**

Run: `node --test tests/calendar.test.mjs`

Expected: FAIL because `loadEvents` and `saveEvents` are not functions.

- [ ] **Step 3: Implement versioned persistence**

Add to `calendar.js` and include both functions in `api`:

```javascript
const STORAGE_KEY = 'wanderer.calendar.events.v1';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const isStoredEvent = (event) => Boolean(
  event &&
  typeof event.id === 'string' &&
  datePattern.test(event.date) &&
  typeof event.title === 'string' &&
  event.title.trim() &&
  typeof event.note === 'string' &&
  typeof event.createdAt === 'string'
);

const loadEvents = (storage) => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isStoredEvent) : [];
  } catch {
    return [];
  }
};

const saveEvents = (storage, events) => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(events));
    return true;
  } catch {
    return false;
  }
};
```

- [ ] **Step 4: Run all tests**

Run: `node --test tests/calendar.test.mjs tests/site-smoke.mjs`

Expected: PASS.

- [ ] **Step 5: Commit persistence**

```powershell
git add calendar.js tests/calendar.test.mjs
git commit -m "feat: persist calendar events locally"
```

### Task 3: Home calendar structure and deep-space styling

**Files:**
- Modify: `tests/site-smoke.mjs`
- Modify: `index.html`
- Modify: `styles.css`

- [ ] **Step 1: Add a failing integration smoke test**

```javascript
test('home hero exposes the editable calendar interface', async () => {
  const html = await read('index.html');
  const css = await read('styles.css');
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
  ]) assert.match(html, new RegExp(hook));
  assert.match(css, /\.home-calendar\s*\{/);
  assert.match(css, /\.calendar-grid\s*\{/);
});
```

- [ ] **Step 2: Run the smoke test and verify it fails on the old hero**

Run: `node --test tests/site-smoke.mjs`

Expected: FAIL because the old title remains and calendar hooks do not exist.

- [ ] **Step 3: Replace the hero copy with semantic calendar markup**

Load `<script src="calendar.js" defer></script>` before `script.js`. Keep the eyebrow, buttons, metadata, and right-side station. Replace only the title and description with:

```html
<section class="home-calendar" data-calendar aria-labelledby="calendar-title">
  <header class="calendar-header">
    <div>
      <span class="calendar-kicker">Mission calendar</span>
      <h1 id="calendar-title" data-calendar-month>载入日历…</h1>
    </div>
    <div class="calendar-nav" aria-label="月份导航">
      <button type="button" data-calendar-prev aria-label="上个月">←</button>
      <button type="button" data-calendar-today>今天</button>
      <button type="button" data-calendar-next aria-label="下个月">→</button>
    </div>
  </header>
  <div class="calendar-weekdays" aria-hidden="true">
    <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
  </div>
  <div class="calendar-grid" data-calendar-grid role="grid" aria-label="月历"></div>
  <section class="calendar-events" aria-labelledby="calendar-events-title">
    <header class="calendar-events__header">
      <div>
        <span class="calendar-kicker">Selected date</span>
        <h2 id="calendar-events-title" data-calendar-selected-date></h2>
      </div>
      <button type="button" class="calendar-add" data-calendar-add>+ 添加事件</button>
    </header>
    <p class="calendar-warning" data-calendar-storage-warning role="status" hidden>本次修改可能无法保留。</p>
    <div class="calendar-event-list" data-calendar-event-list></div>
    <form class="calendar-form" data-calendar-form hidden novalidate>
      <input type="hidden" data-calendar-event-id>
      <label>事件标题<input type="text" data-calendar-title maxlength="80" required></label>
      <label>补充说明<textarea data-calendar-note maxlength="280" rows="3"></textarea></label>
      <p class="calendar-form__error" data-calendar-error role="alert" hidden></p>
      <div class="calendar-form__actions">
        <button type="button" data-calendar-cancel>取消</button>
        <button type="submit">保存事件</button>
      </div>
    </form>
  </section>
</section>
```

Change the hero `aria-labelledby` target from `hero-title` to `calendar-title`.

- [ ] **Step 4: Add complete visual states to `styles.css`**

Append this complete calendar block, using the existing design variables:

```css
.home-calendar {
  margin-top: 22px;
  padding: clamp(16px, 2.5vw, 24px);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, rgba(18, 37, 78, 0.74), rgba(7, 12, 31, 0.88));
  box-shadow: var(--shadow-card), inset 0 1px rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(18px);
}

.calendar-header,
.calendar-events__header,
.calendar-event,
.calendar-form__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.calendar-kicker {
  color: var(--cyan);
  font: 700 9px/1.2 var(--mono);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.calendar-header h1,
.calendar-events h2 {
  margin: 5px 0 0;
  color: var(--ink-strong);
  font-family: var(--display);
}

.calendar-header h1 {
  font-size: clamp(1.35rem, 2.4vw, 2rem);
  letter-spacing: -0.04em;
}

.calendar-events h2 {
  font-size: 1rem;
}

.calendar-nav {
  display: flex;
  align-items: center;
  gap: 5px;
}

.calendar-nav button,
.calendar-add,
.calendar-event__actions button,
.calendar-form__actions button {
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0 10px;
  color: var(--muted-strong);
  background: rgba(8, 18, 42, 0.72);
  font: 700 10px var(--mono);
  cursor: pointer;
  transition: border-color 180ms ease, color 180ms ease, background 180ms ease;
}

.calendar-nav button:hover,
.calendar-add:hover,
.calendar-event__actions button:hover,
.calendar-form__actions button:hover {
  color: var(--cyan-soft);
  border-color: var(--cyan);
  background: rgba(119, 230, 255, 0.1);
}

.calendar-grid,
.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.calendar-weekdays {
  margin: 18px 0 7px;
  color: var(--muted);
  font: 9px var(--mono);
  text-align: center;
}

.calendar-day {
  position: relative;
  min-height: 48px;
  border: 1px solid rgba(119, 230, 255, 0.1);
  border-radius: 9px;
  color: var(--muted-strong);
  background: rgba(5, 10, 25, 0.45);
  font: 600 11px var(--mono);
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease, background 160ms ease;
}

.calendar-day:hover {
  color: var(--ink-strong);
  border-color: var(--line-strong);
}

.calendar-day.is-outside {
  color: rgba(139, 155, 190, 0.42);
  background: rgba(5, 10, 25, 0.2);
}

.calendar-day.is-today::before {
  position: absolute;
  top: 5px;
  left: 5px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
  content: '';
}

.calendar-day.is-selected {
  color: var(--ink-strong);
  border-color: var(--cyan);
  background: rgba(119, 230, 255, 0.13);
  box-shadow: inset 0 0 18px rgba(119, 230, 255, 0.08);
}

.calendar-day__count {
  position: absolute;
  right: 5px;
  bottom: 5px;
  min-width: 15px;
  color: var(--bg);
  border-radius: 999px;
  background: var(--lime);
  font: 700 9px var(--mono);
  line-height: 15px;
  text-align: center;
  box-shadow: 0 0 8px rgba(183, 244, 123, 0.5);
}

.calendar-events {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid rgba(119, 230, 255, 0.12);
  border-radius: 13px;
  background: rgba(4, 10, 25, 0.56);
}

.calendar-add {
  color: var(--cyan);
}

.calendar-event-list {
  display: grid;
  gap: 7px;
  margin-top: 12px;
}

.calendar-empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.calendar-event {
  padding: 10px 11px;
  border-left: 2px solid var(--cyan);
  border-radius: 0 9px 9px 0;
  background: rgba(18, 36, 70, 0.55);
}

.calendar-event strong {
  color: var(--ink-strong);
  font-size: 0.85rem;
}

.calendar-event p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.5;
}

.calendar-event__actions {
  display: flex;
  gap: 5px;
}

.calendar-event__actions button {
  min-height: 28px;
  padding-inline: 8px;
}

.calendar-form {
  display: grid;
  gap: 11px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(119, 230, 255, 0.12);
}

.calendar-form[hidden] {
  display: none;
}

.calendar-form label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font: 700 9px var(--mono);
  letter-spacing: 0.08em;
}

.calendar-form input,
.calendar-form textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 9px 10px;
  color: var(--ink-strong);
  background: rgba(4, 9, 23, 0.82);
  font: 0.85rem/1.5 var(--body);
  resize: vertical;
}

.calendar-warning,
.calendar-form__error {
  margin: 10px 0 0;
  color: var(--rose);
  font-size: 0.76rem;
}

.calendar-form__actions {
  justify-content: flex-end;
}

.calendar-form__actions button[type='submit'] {
  color: var(--bg);
  border-color: var(--cyan);
  background: var(--cyan);
}

.calendar-nav button:focus-visible,
.calendar-add:focus-visible,
.calendar-day:focus-visible,
.calendar-event__actions button:focus-visible,
.calendar-form__actions button:focus-visible,
.calendar-form input:focus-visible,
.calendar-form textarea:focus-visible {
  outline: 2px solid var(--cyan-soft);
  outline-offset: 3px;
}

@media (max-width: 680px) {
  .home-calendar { padding: 13px; }
  .calendar-grid, .calendar-weekdays { gap: 3px; }
  .calendar-day { min-height: 40px; border-radius: 7px; }
  .calendar-events__header { align-items: flex-start; flex-direction: column; }
  .calendar-event { align-items: flex-start; flex-direction: column; }
}
```

Add the calendar transition selectors to the existing reduced-motion media query so decorative transitions are disabled with the rest of the site.

- [ ] **Step 5: Run checks and commit the structure**

Run: `node --test tests/site-smoke.mjs && node --check calendar.js && git diff --check`

Expected: PASS with no syntax or whitespace errors.

```powershell
git add index.html styles.css tests/site-smoke.mjs
git commit -m "feat: add home calendar interface"
```

### Task 4: Calendar DOM controller

**Files:**
- Modify: `tests/site-smoke.mjs`
- Modify: `calendar.js`

- [ ] **Step 1: Add failing static integration assertions**

Extend the home calendar smoke test:

```javascript
const calendarJs = await read('calendar.js');
assert.match(calendarJs, /wanderer\.calendar\.events\.v1/);
assert.match(calendarJs, /data-calendar-date/);
assert.match(calendarJs, /data-calendar-form/);
assert.match(calendarJs, /saveEvents/);
assert.match(calendarJs, /window\.confirm/);
```

- [ ] **Step 2: Run the smoke test and verify missing controller hooks**

Run: `node --test tests/site-smoke.mjs`

Expected: FAIL on at least `data-calendar-date` and `window.confirm`.

- [ ] **Step 3: Implement the controller in `calendar.js`**

After defining the public API, add a browser-only initializer that:

```javascript
const calendarRoot = globalScope.document?.querySelector('[data-calendar]');
if (!calendarRoot) return;

let storage;
try {
  storage = globalScope.localStorage;
} catch {
  storage = {
    getItem: () => null,
    setItem: () => { throw new Error('storage unavailable'); },
  };
}

const today = new Date();
const state = {
  viewYear: today.getFullYear(),
  viewMonth: today.getMonth(),
  selectedDate: formatDateKey(today),
  events: loadEvents(storage),
};
```

Add the following DOM references, render functions, and listeners after the state declaration. This uses DOM methods and `textContent` for all user-entered values:

```javascript
const elements = {
  month: calendarRoot.querySelector('[data-calendar-month]'),
  grid: calendarRoot.querySelector('[data-calendar-grid]'),
  selectedDate: calendarRoot.querySelector('[data-calendar-selected-date]'),
  list: calendarRoot.querySelector('[data-calendar-event-list]'),
  form: calendarRoot.querySelector('[data-calendar-form]'),
  eventId: calendarRoot.querySelector('[data-calendar-event-id]'),
  title: calendarRoot.querySelector('[data-calendar-title]'),
  note: calendarRoot.querySelector('[data-calendar-note]'),
  error: calendarRoot.querySelector('[data-calendar-error]'),
  warning: calendarRoot.querySelector('[data-calendar-storage-warning]'),
  previous: calendarRoot.querySelector('[data-calendar-prev]'),
  next: calendarRoot.querySelector('[data-calendar-next]'),
  today: calendarRoot.querySelector('[data-calendar-today]'),
  add: calendarRoot.querySelector('[data-calendar-add]'),
  cancel: calendarRoot.querySelector('[data-calendar-cancel]'),
};

const humanDate = (dateKey) => new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date(dateKey + 'T00:00:00'));

const renderMonth = () => {
  elements.month.textContent = state.viewYear + ' 年 ' + (state.viewMonth + 1) + ' 月';
  const todayKey = formatDateKey(new Date());
  const buttons = buildMonthDays(state.viewYear, state.viewMonth).map((cell) => {
    const button = document.createElement('button');
    const count = eventsForDate(state.events, cell.dateKey).length;
    button.type = 'button';
    button.className = 'calendar-day';
    button.dataset.calendarDate = cell.dateKey;
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-label', humanDate(cell.dateKey) + (count ? '，' + count + ' 个事件' : ''));
    button.classList.toggle('is-outside', !cell.inCurrentMonth);
    button.classList.toggle('is-today', cell.dateKey === todayKey);
    button.classList.toggle('is-selected', cell.dateKey === state.selectedDate);
    button.append(String(cell.day));
    if (count) {
      const badge = document.createElement('span');
      badge.className = 'calendar-day__count';
      badge.textContent = String(count);
      button.append(badge);
    }
    return button;
  });
  elements.grid.replaceChildren(...buttons);
};

const actionButton = (label, action, id) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.calendarAction = action;
  button.dataset.eventId = id;
  return button;
};

const renderEvents = () => {
  elements.selectedDate.textContent = humanDate(state.selectedDate);
  const dayEvents = eventsForDate(state.events, state.selectedDate);
  if (!dayEvents.length) {
    const empty = document.createElement('p');
    empty.className = 'calendar-empty';
    empty.textContent = '这一天还没有事件。';
    elements.list.replaceChildren(empty);
    return;
  }

  const rows = dayEvents.map((item) => {
    const row = document.createElement('article');
    row.className = 'calendar-event';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title;
    copy.append(title);
    if (item.note) {
      const note = document.createElement('p');
      note.textContent = item.note;
      copy.append(note);
    }
    const actions = document.createElement('div');
    actions.className = 'calendar-event__actions';
    actions.append(actionButton('编辑', 'edit', item.id), actionButton('删除', 'delete', item.id));
    row.append(copy, actions);
    return row;
  });
  elements.list.replaceChildren(...rows);
};

const closeForm = () => {
  elements.form.hidden = true;
  elements.form.reset();
  elements.eventId.value = '';
  elements.error.hidden = true;
  elements.error.textContent = '';
};

const openForm = (item = null) => {
  elements.form.hidden = false;
  elements.eventId.value = item?.id ?? '';
  elements.title.value = item?.title ?? '';
  elements.note.value = item?.note ?? '';
  elements.error.hidden = true;
  elements.title.focus();
};

const persistAndRender = () => {
  elements.warning.hidden = saveEvents(storage, state.events);
  renderMonth();
  renderEvents();
};

const setViewedMonth = (date) => {
  state.viewYear = date.getFullYear();
  state.viewMonth = date.getMonth();
  renderMonth();
};

elements.previous.addEventListener('click', () => {
  setViewedMonth(new Date(state.viewYear, state.viewMonth - 1, 1));
});

elements.next.addEventListener('click', () => {
  setViewedMonth(new Date(state.viewYear, state.viewMonth + 1, 1));
});

elements.today.addEventListener('click', () => {
  const current = new Date();
  state.selectedDate = formatDateKey(current);
  setViewedMonth(current);
  renderEvents();
});

elements.grid.addEventListener('click', (domEvent) => {
  const target = domEvent.target.closest('[data-calendar-date]');
  if (!target) return;
  state.selectedDate = target.dataset.calendarDate;
  const selected = new Date(state.selectedDate + 'T00:00:00');
  state.viewYear = selected.getFullYear();
  state.viewMonth = selected.getMonth();
  closeForm();
  renderMonth();
  renderEvents();
});

elements.add.addEventListener('click', () => openForm());
elements.cancel.addEventListener('click', closeForm);

elements.form.addEventListener('submit', (domEvent) => {
  domEvent.preventDefault();
  const input = { date: state.selectedDate, title: elements.title.value, note: elements.note.value };
  try {
    state.events = elements.eventId.value
      ? updateEvent(state.events, elements.eventId.value, input)
      : addEvent(state.events, input);
    closeForm();
    persistAndRender();
  } catch (error) {
    elements.error.textContent = error.message;
    elements.error.hidden = false;
  }
});

elements.list.addEventListener('click', (domEvent) => {
  const target = domEvent.target.closest('[data-calendar-action]');
  if (!target) return;
  const item = state.events.find((event) => event.id === target.dataset.eventId);
  if (!item) return;
  if (target.dataset.calendarAction === 'edit') {
    openForm(item);
    return;
  }
  if (target.dataset.calendarAction === 'delete' && window.confirm('删除这个事件？')) {
    state.events = removeEvent(state.events, item.id);
    persistAndRender();
  }
});

renderMonth();
renderEvents();
```

- [ ] **Step 4: Run unit, smoke, and syntax tests**

Run: `node --test tests/calendar.test.mjs tests/site-smoke.mjs && node --check calendar.js && node --check script.js && git diff --check`

Expected: PASS.

- [ ] **Step 5: Commit the working interaction**

```powershell
git add calendar.js tests/site-smoke.mjs
git commit -m "feat: enable editable calendar events"
```

### Task 5: Browser verification and delivery

**Files:**
- Modify only if verification exposes an issue: `index.html`, `styles.css`, `calendar.js`, and the matching test file.

- [ ] **Step 1: Start a local static server**

Run: `py -m http.server 4173 --bind 127.0.0.1`

Expected: local preview available at `http://localhost:4173`.

- [ ] **Step 2: Verify desktop behavior**

At a 1440×1000 viewport:

1. Confirm the old title and description are absent.
2. Confirm today is selected and the current month is shown.
3. Add two events to one date and verify both appear with a count of `2`.
4. Edit the second event and verify only that row changes.
5. Reload and verify both events remain.
6. Delete one event, accept confirmation, reload, and verify only one remains.
7. Navigate previous, today, and next; verify headings and day grids update.
8. Verify no console errors.

- [ ] **Step 3: Verify mobile and accessibility behavior**

At a 390×844 viewport:

1. Confirm all seven columns fit without horizontal scrolling.
2. Confirm the event form and buttons remain fully visible above the fixed music player.
3. Tab through month controls, dates, event actions, and form fields.
4. Confirm every focused control has a visible focus indicator.
5. Enable reduced motion and confirm no essential state depends on animation.

- [ ] **Step 4: Run the final verification suite**

Run: `node --test tests/calendar.test.mjs tests/site-smoke.mjs && node --check calendar.js && node --check script.js && git diff --check && git status --short`

Expected: all tests pass, both scripts parse, no whitespace errors, and the worktree is clean after the final commit.

- [ ] **Step 5: Push completed commits**

Run: `git push`

Expected: `master` and `origin/master` point to the same final commit.
