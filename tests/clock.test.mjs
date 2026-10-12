import { formatBeijingDateTime } from '../clock.js';
import assert from 'node:assert/strict';
import test from 'node:test';



test('formatBeijingDateTime uses Beijing time across the UTC date boundary', () => {
  const result = formatBeijingDateTime(new Date('2026-09-04T16:05:06.000Z'));

  assert.equal(result.dateText, '2026.09.05 · 周六');
  assert.equal(result.timeText, '00:05:06');
  assert.equal(result.datetime, '2026-09-05T00:05:06+08:00');
});
