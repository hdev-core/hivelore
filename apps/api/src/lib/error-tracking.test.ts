import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { reportUnhandledError, serializeError } from './error-tracking.js';

describe('error tracking', () => {
  test('serializes errors without request secrets', () => {
    const serialized = serializeError(new Error('boom'));

    assert.equal(serialized.name, 'Error');
    assert.equal(serialized.message, 'boom');
    assert.equal('headers' in serialized, false);
  });

  test('logs unhandled errors and skips webhook delivery when disabled', async () => {
    const logs: unknown[] = [];

    await reportUnhandledError(
      {
        error: new Error('boom'),
        method: 'GET',
        requestId: 'request-1',
        url: '/explode',
      },
      {
        enabled: false,
        logger: {
          error(payload: unknown) {
            logs.push(payload);
          },
        } as never,
        webhookUrl: 'https://example.com/errors',
      },
    );

    assert.equal(logs.length, 1);
    assert.equal((logs[0] as { requestId?: string }).requestId, 'request-1');
  });
});
