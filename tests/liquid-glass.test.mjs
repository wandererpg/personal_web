import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { calculatePointerEffects, shouldTrackPointer } = require('../liquid-glass.js');

const rect = { left: 100, top: 50, width: 200, height: 100 };

test('center pointer produces centered light without tilt', () => {
  assert.deepEqual(calculatePointerEffects(200, 100, rect), {
    xPercent: 50,
    yPercent: 50,
    rotateX: 0,
    rotateY: 0,
  });
});

test('pointer effects clamp to the card and two-degree tilt', () => {
  assert.deepEqual(calculatePointerEffects(500, -100, rect), {
    xPercent: 100,
    yPercent: 0,
    rotateX: 2,
    rotateY: 2,
  });
});

test('continuous tracking is desktop-only and respects reduced motion', () => {
  assert.equal(shouldTrackPointer('mouse', false), true);
  assert.equal(shouldTrackPointer('touch', false), false);
  assert.equal(shouldTrackPointer('mouse', true), false);
});
