import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  PERIODS,
  calculateWeek,
  coursesForDate,
  coursesForWeek,
  getWeekDates,
  validateSchedule,
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
  assert.deepEqual(calculateWeek('2027-01-18', term), { week: 20, state: 'active' });
  assert.deepEqual(calculateWeek('2027-02-01', term), { week: 20, state: 'after' });
  assert.deepEqual(calculateWeek('2026-09-07', { termStart: '', totalWeeks: 20 }), {
    week: 1,
    state: 'unconfigured',
  });
});

test('getWeekDates returns a Monday-first date range', () => {
  assert.deepEqual(getWeekDates('2026-09-07', 2), [
    '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
    '2026-09-18', '2026-09-19', '2026-09-20',
  ]);
});

test('coursesForWeek and coursesForDate filter without mutating input', () => {
  const courses = [
    { id: 'a', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 3] },
    { id: 'b', weekday: 2, startPeriod: 3, endPeriod: 4, weeks: [2] },
  ];
  assert.deepEqual(coursesForWeek(courses, 1).map(course => course.id), ['a']);
  assert.deepEqual(coursesForWeek(courses, 2).map(course => course.id), ['b']);
  assert.deepEqual(coursesForDate(courses, '2026-09-07', 1).map(course => course.id), ['a']);
  assert.deepEqual(coursesForDate(courses, '2026-09-08', 1), []);
  assert.deepEqual(courses, [
    { id: 'a', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 3] },
    { id: 'b', weekday: 2, startPeriod: 3, endPeriod: 4, weeks: [2] },
  ]);
});

test('validateSchedule normalizes valid input and rejects invalid fields or overlaps', () => {
  const base = {
    version: 1,
    termStart: '2026-09-07',
    totalWeeks: 20,
    courses: [{
      id: 'a', name: ' A ', teacher: ' T ', room: ' R ', weekday: 1,
      startPeriod: 1, endPeriod: 2, weeks: [3, 1, 3], color: 'mint',
    }],
  };
  const normalized = validateSchedule(base);
  assert.deepEqual(normalized.courses[0], {
    id: 'a', name: 'A', teacher: 'T', room: 'R', weekday: 1,
    startPeriod: 1, endPeriod: 2, weeks: [1, 3], color: 'mint',
  });
  assert.throws(() => validateSchedule({ ...base, termStart: '2026-09-08' }), /周一/);
  assert.throws(() => validateSchedule({ ...base, totalWeeks: 0 }), /总周数/);
  assert.throws(() => validateSchedule({ ...base, courses: [{ ...base.courses[0], weeks: [21] }] }), /周次/);
  assert.throws(() => validateSchedule({ ...base, courses: [{ ...base.courses[0], startPeriod: 4, endPeriod: 3 }] }), /节次/);
  assert.throws(() => validateSchedule({ ...base, courses: [
    ...base.courses,
    { ...base.courses[0], id: 'b', name: 'B', startPeriod: 2 },
  ] }), /冲突/);
});
