import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  addEvent,
  buildMonthDays,
  expandDateRange,
  eventsForDate,
  getSchoolCalendarEvents,
  getUpcomingEvents,
  loadEvents,
  removeEvent,
  saveEvents,
  schoolEventsForDate,
  updateEvent,
} = require('../calendar.js');

test('buildMonthDays creates a Monday-first six-week grid', () => {
  const days = buildMonthDays(2026, 8);
  assert.equal(days.length, 42);
  assert.equal(days[0].dateKey, '2026-08-31');
  assert.equal(days[1].dateKey, '2026-09-01');
  assert.equal(days[41].dateKey, '2026-10-11');
  assert.equal(days[0].inCurrentMonth, false);
  assert.equal(days[1].inCurrentMonth, true);
});

test('event CRUD keeps multiple events on one date', () => {
  const options = {
    createId: (() => {
      let id = 0;
      return () => `event-${++id}`;
    })(),
    now: () => '2026-09-05T12:00:00.000Z',
  };

  let events = addEvent([], { date: '2026-09-05', title: '发布网站', note: '' }, options);
  events = addEvent(events, { date: '2026-09-05', title: '整理说明', note: '补充文档' }, options);
  assert.equal(eventsForDate(events, '2026-09-05').length, 2);

  events = updateEvent(events, 'event-2', { title: '整理项目说明', note: '完成 README' });
  assert.equal(events[1].title, '整理项目说明');
  assert.equal(events[1].note, '完成 README');

  events = removeEvent(events, 'event-1');
  assert.deepEqual(events.map((event) => event.id), ['event-2']);
});

test('event titles are required after trimming', () => {
  assert.throws(
    () => addEvent([], { date: '2026-09-05', title: '   ', note: '' }),
    /事件标题不能为空/,
  );
});

test('loadEvents filters malformed records and handles invalid JSON', () => {
  const valid = {
    id: 'event-1',
    date: '2026-09-05',
    title: '发布网站',
    note: '',
    createdAt: '2026-09-05T12:00:00.000Z',
  };

  assert.deepEqual(
    loadEvents({ getItem: () => JSON.stringify([valid, { title: '' }]) }),
    [valid],
  );
  assert.deepEqual(loadEvents({ getItem: () => '{broken' }), []);
  assert.deepEqual(loadEvents({ getItem: () => { throw new Error('denied'); } }), []);
});

test('saveEvents reports whether persistence succeeded', () => {
  let savedKey = '';
  let savedValue = '';
  const storage = {
    setItem: (key, value) => {
      savedKey = key;
      savedValue = value;
    },
  };

  assert.equal(saveEvents(storage, []), true);
  assert.equal(savedKey, 'wanderer.calendar.events.v1');
  assert.equal(savedValue, '[]');
  assert.equal(saveEvents({ setItem: () => { throw new Error('full'); } }, []), false);
});

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
  assert.deepEqual(upcoming.map((event) => [event.title, event.start, event.end]), [
    ['整理网站', '2026-09-18', '2026-09-18'],
    ['中秋节放假', '2026-09-25', '2026-09-27'],
    ['国庆节放假', '2026-10-01', '2026-10-07'],
  ]);
});
