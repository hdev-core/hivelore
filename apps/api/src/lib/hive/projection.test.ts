import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildHiveLoreCommentOperation } from './operations.js';
import { normalizeHafOperation, projectHiveOperation } from './projection.js';

describe('HAF projection helpers', () => {
  test('normalizes HAF rows into the API projection shape', () => {
    const operation = buildHiveLoreCommentOperation({
      author: 'emberquill.dev',
      permlink: 'canon-lore',
      title: 'Canon Lore',
      body: 'A verified entry.',
      kind: 'canon_lore',
      entityType: 'LORE_ENTRY',
      entityId: 'lore-1',
    });

    const normalized = normalizeHafOperation({
      block_num: '123',
      transaction_id: 'abc123',
      operation_id: '2',
      timestamp: '2026-07-25T18:00:00',
      operation,
    });

    assert.equal(normalized.blockNumber, 123n);
    assert.equal(normalized.transactionId, 'abc123');
    assert.equal(normalized.operationIndex, 2);
    assert.equal(normalized.operationType, 'comment');
  });

  test('normalizes the live HAFBE operation wrapper shape', () => {
    const operation = buildHiveLoreCommentOperation({
      author: 'emberquill.dev',
      permlink: 'canon-lore',
      title: 'Canon Lore',
      body: 'A verified entry.',
      kind: 'canon_lore',
      entityType: 'LORE_ENTRY',
      entityId: 'lore-1',
    });

    const normalized = normalizeHafOperation({
      block: 123,
      trx_id: 'abc123',
      op_pos: 2,
      timestamp: '2026-07-25T18:00:00',
      op: {
        type: 'comment_operation',
        value: operation.comment_operation,
      },
    });

    assert.equal(normalized.blockNumber, 123n);
    assert.equal(normalized.transactionId, 'abc123');
    assert.equal(normalized.operationIndex, 2);
    assert.deepEqual(normalized.operation, operation);
  });

  test('upserts projected Hive events by transaction and operation index', async () => {
    const calls: unknown[] = [];
    const operation = buildHiveLoreCommentOperation({
      author: 'emberquill.dev',
      permlink: 'story',
      title: 'Story',
      body: 'Chapter one.',
      kind: 'story_chapter',
      entityType: 'STORY_CHAPTER',
      entityId: 'story-1',
    });

    await projectHiveOperation(
      {
        hiveEvent: {
          async upsert(args) {
            calls.push(args);
          },
        },
      },
      {
        blockNumber: 456n,
        transactionId: 'def456',
        operationIndex: 0,
        blockchainTimestamp: new Date('2026-07-25T18:30:00.000Z'),
        operationType: 'comment',
        operation,
      },
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      where: {
        transactionId_operationIndex: {
          transactionId: 'def456',
          operationIndex: 0,
        },
      },
      create: {
        blockNumber: 456n,
        transactionId: 'def456',
        operationIndex: 0,
        eventType: 'COMMENT',
        blockchainTimestamp: new Date('2026-07-25T18:30:00.000Z'),
        payload: operation,
      },
      update: {
        blockNumber: 456n,
        eventType: 'COMMENT',
        blockchainTimestamp: new Date('2026-07-25T18:30:00.000Z'),
        payload: operation,
      },
    });
  });
});
