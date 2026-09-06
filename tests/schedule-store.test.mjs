import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createScheduleStore } = require('../server/schedule-store.js');

const validSchedule = {
  version: 1,
  termStart: '2026-09-07',
  totalWeeks: 20,
  courses: [{
    id: 'course-1',
    name: '计算物理基础',
    teacher: '赵虎',
    room: '九 202',
    weekday: 3,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2],
    color: 'mint',
  }],
};

test('read returns the default empty schedule when the file is missing', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-schedule-store-'));
  const store = createScheduleStore({ dataDir });
  assert.deepEqual(await store.read(), {
    version: 1,
    termStart: '',
    totalWeeks: 20,
    courses: [],
  });
});

test('write persists a normalized schedule through an atomic target file', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-schedule-store-'));
  const store = createScheduleStore({ dataDir });
  const input = {
    ...validSchedule,
    courses: [{ ...validSchedule.courses[0], name: '  计算物理基础  ', weeks: [2, 1, 2] }],
  };

  const saved = await store.write(input);
  assert.deepEqual(saved, validSchedule);
  assert.deepEqual(await store.read(), validSchedule);
  assert.deepEqual(await readdir(dataDir), ['schedule.json']);
  assert.equal(await readFile(join(dataDir, 'schedule.json'), 'utf8'), `${JSON.stringify(validSchedule, null, 2)}\n`);
});

test('read rejects malformed schedule data without exposing the file path', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-schedule-store-'));
  await writeFile(join(dataDir, 'schedule.json'), '{broken');
  const store = createScheduleStore({ dataDir });

  await assert.rejects(store.read(), error => (
    error.code === 'SCHEDULE_INVALID'
    && !error.message.includes(dataDir)
  ));
});

test('write does not replace an existing schedule when validation fails', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'wanderer-schedule-store-'));
  const store = createScheduleStore({ dataDir });
  await store.write(validSchedule);

  await assert.rejects(
    store.write({ ...validSchedule, totalWeeks: 0 }),
    error => error.code === 'SCHEDULE_VALIDATION',
  );
  assert.equal(await access(join(dataDir, 'schedule.json')).then(() => true, () => false), true);
  assert.deepEqual(await store.read(), validSchedule);
});
