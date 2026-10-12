import assert from 'node:assert/strict';
import test from 'node:test';
import { handleServerError } from '../server/app.js';

test('disconnected requests never trigger a second response or error log', t => {
  const log = t.mock.method(console, 'error', () => {});
  for (const [req, res] of [[{ aborted: true }, {}], [{}, { destroyed: true }], [{}, { writableEnded: true }]]) {
    handleServerError(new Error('Request aborted'), req, {
      ...res,
      status() { assert.fail('cannot write to a closed response'); },
    }, () => assert.fail('closed connections are already finished'));
  }
  assert.equal(log.mock.callCount(), 0);
  handleServerError(Object.assign(new Error('Request aborted'), { code: 'ECONNABORTED' }), {}, {
    status() { assert.fail('aborted file transfer must not send JSON'); },
  }, () => assert.fail('expected cancellations should not reach Express logging'));
  assert.equal(log.mock.callCount(), 0);
});

test('errors after headers delegate to Express without trying to send JSON', () => {
  const error = new Error('stream failed');
  let delegated;
  handleServerError(error, {}, {
    headersSent: true,
    status() { assert.fail('headers already sent'); },
  }, value => { delegated = value; });
  assert.equal(delegated, error);
});

test('unexpected errors retain the generic 500 response without leaking details', t => {
  const error = new Error('internal details');
  const log = t.mock.method(console, 'error', () => {});
  let status;
  let body;
  const response = {
    status(value) { status = value; return this; },
    json(value) { body = value; },
  };
  handleServerError(error, {}, response, () => assert.fail('should respond'));
  assert.equal(status, 500);
  assert.deepEqual(body, { error: 'INTERNAL_ERROR' });
  assert.equal(log.mock.calls[0].arguments[0], error);
});
