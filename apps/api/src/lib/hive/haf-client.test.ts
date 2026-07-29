import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { HafClient, parseBlockSearchPage } from './haf-client.js';

function createJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Server Error',
    async json() {
      return body;
    },
  } as Response;
}

describe('HAF client', () => {
  test('uses the live HAFBE last-synced-block path', async () => {
    const urls: string[] = [];
    const client = new HafClient({
      baseUrl: 'https://example.test/hafbe-api',
      async fetchImpl(url) {
        urls.push(url.toString());
        return createJsonResponse(108500881);
      },
    });

    assert.equal(await client.getLatestSyncedBlock(), 108500881);
    assert.deepEqual(urls, ['https://example.test/hafbe-api/last-synced-block']);
  });

  test('returns operations_result from the live HAFBE comment operations wrapper', async () => {
    const urls: string[] = [];
    const client = new HafClient({
      baseUrl: 'https://example.test/hafbe-api',
      async fetchImpl(url) {
        urls.push(url.toString());
        return createJsonResponse({
          total_operations: 1,
          total_pages: 1,
          operations_result: [
            {
              op: {
                type: 'comment_operation',
                value: {
                  author: 'alice',
                  permlink: 'hello',
                },
              },
              block: 123,
              trx_id: 'abc',
              op_pos: 0,
              timestamp: '2026-07-25T18:00:00',
            },
          ],
        });
      },
    });

    const operations = await client.getCommentOperations('alice', 'hello');

    assert.equal(operations.length, 1);
    assert.equal(operations[0]?.trx_id, 'abc');
    assert.deepEqual(urls, [
      'https://example.test/hafbe-api/accounts/alice/operations/comments/hello',
    ]);
  });

  test('parses block-search wrappers into operation pages', () => {
    assert.deepEqual(
      parseBlockSearchPage({
        page: '2',
        total_pages: '3',
        operations_result: [
          {
            block: 123,
          },
        ],
      }),
      {
        page: 2,
        totalPages: 3,
        operations: [
          {
            block: 123,
          },
        ],
      },
    );
  });
});
