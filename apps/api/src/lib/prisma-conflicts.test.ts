import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { mapDuplicateVoteConflict, mapWorldSlugConflict } from './prisma-conflicts.js';

describe('Prisma conflict mapping', () => {
  test('maps duplicate proposal vote unique constraint to 409', () => {
    const conflict = mapDuplicateVoteConflict({
      code: 'P2002',
      meta: {
        target: ['proposalId', 'voterId'],
      },
    });

    assert.deepEqual(conflict, {
      statusCode: 409,
      error: 'User has already voted on this proposal.',
    });
  });

  test('does not map unrelated unique constraints', () => {
    const conflict = mapDuplicateVoteConflict({
      code: 'P2002',
      meta: {
        target: ['slug'],
      },
    });

    assert.equal(conflict, null);
  });

  test('maps only world slug unique conflicts to 409', () => {
    assert.deepEqual(
      mapWorldSlugConflict({
        code: 'P2002',
        meta: {
          target: ['slug'],
        },
      }),
      {
        statusCode: 409,
        error: 'World slug is already in use.',
      },
    );

    assert.equal(
      mapWorldSlugConflict({
        code: 'P2002',
        meta: {
          target: ['proposalId', 'voterId'],
        },
      }),
      null,
    );
  });

  test('does not map non-unique Prisma errors', () => {
    const conflict = mapDuplicateVoteConflict({
      code: 'P2025',
      meta: {
        target: ['proposalId', 'voterId'],
      },
    });

    assert.equal(conflict, null);
  });
});
