import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildHiveLoreCommentOperation,
  buildHiveLoreCustomJsonOperation,
  parseHiveLoreCommentMetadata,
  parseHiveLoreCustomJsonPayload,
} from './operations.js';
import { verifyHiveLoreOperation } from './verification.js';

describe('HiveLore Hive operations', () => {
  test('builds a WAX comment operation with normalized HiveLore metadata', () => {
    const operation = buildHiveLoreCommentOperation({
      author: 'EmberQuill.Dev',
      permlink: 'world-seed',
      title: 'World Seed',
      body: 'The world begins here.',
      kind: 'world_seed',
      entityType: 'WORLD_SEED',
      entityId: 'world-1',
      worldId: 'world-1',
    });

    assert.equal(operation.comment_operation?.author, 'emberquill.dev');
    assert.equal(operation.comment_operation?.parent_author, '');
    assert.equal(operation.comment_operation?.parent_permlink, 'hivelore');

    const metadata = parseHiveLoreCommentMetadata(operation);

    assert.equal(metadata?.app, 'hivelore/0.1.0');
    assert.equal(metadata?.hivelore.kind, 'world_seed');
    assert.equal(metadata?.hivelore.entityType, 'WORLD_SEED');
  });

  test('builds a posting custom_json operation for canon approvals', () => {
    const operation = buildHiveLoreCustomJsonOperation({
      signer: 'EmberQuill.Dev',
      action: 'canon_approval',
      entityType: 'CANON_DECISION',
      entityId: 'proposal-1',
      worldId: 'world-1',
      proposalId: 'proposal-1',
      payload: {
        approvedAt: '2026-07-25T18:00:00.000Z',
      },
    });

    assert.deepEqual(operation.custom_json_operation?.required_auths, []);
    assert.deepEqual(operation.custom_json_operation?.required_posting_auths, ['emberquill.dev']);
    assert.equal(operation.custom_json_operation?.id, 'hivelore');

    const payload = parseHiveLoreCustomJsonPayload(operation);

    assert.equal(payload?.action, 'canon_approval');
    assert.equal(payload?.signer, 'emberquill.dev');
  });

  test('rejects invalid Hive account names and permlinks', () => {
    assert.throws(
      () =>
        buildHiveLoreCommentOperation({
          author: 'bad_name',
          permlink: 'world-seed',
          title: 'World Seed',
          body: 'The world begins here.',
          kind: 'world_seed',
          entityType: 'WORLD_SEED',
          entityId: 'world-1',
        }),
      /Invalid Hive account name/,
    );

    assert.throws(
      () =>
        buildHiveLoreCommentOperation({
          author: 'emberquill.dev',
          permlink: 'Bad Permlink',
          title: 'World Seed',
          body: 'The world begins here.',
          kind: 'world_seed',
          entityType: 'WORLD_SEED',
          entityId: 'world-1',
        }),
      /Invalid string/,
    );
  });

  test('verifies signer and HiveLore payload before projection', () => {
    const operation = buildHiveLoreCustomJsonOperation({
      signer: 'emberquill.dev',
      action: 'revision_history',
      entityType: 'METADATA',
      entityId: 'revision-1',
      payload: {
        previous: 'draft',
      },
    });

    assert.deepEqual(verifyHiveLoreOperation({ operation, expectedSigner: 'other-user' }), {
      ok: false,
      reason: 'Signer does not match expected Hive account.',
    });

    const decision = verifyHiveLoreOperation({ operation, expectedSigner: 'emberquill.dev' });

    assert.equal(decision.ok, true);
    assert.equal(decision.signer, 'emberquill.dev');
    assert.equal(decision.entityType, 'METADATA');
  });
});
