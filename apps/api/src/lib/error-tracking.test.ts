import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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

  test('gives up on an unresponsive webhook instead of hanging the error path', async () => {
    // Regression guard. Fastify awaits the onError hook, so an unbounded fetch
    // to a stalled webhook would keep every failing request open until OS-level
    // TCP timeouts. Against the unbounded version this test never resolves.
    const stalled = createServer(() => {
      // accept the connection, never reply
    });
    await new Promise<void>((resolve) => stalled.listen(0, resolve));
    const address = stalled.address() as AddressInfo;

    const startedAt = Date.now();
    await reportUnhandledError(
      { error: new Error('boom'), method: 'GET', requestId: 'req-stall', url: '/x' },
      {
        enabled: true,
        timeoutMs: 150,
        webhookUrl: `http://127.0.0.1:${address.port}/hook`,
      },
    );
    const elapsed = Date.now() - startedAt;

    stalled.close();

    assert.ok(elapsed < 2_000, `expected the webhook to be abandoned quickly, took ${elapsed}ms`);
  });
});
