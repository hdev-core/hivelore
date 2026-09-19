import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { InvalidHiveUsernameError, normalizeHiveUsername } from './hive-username.js';

describe('Hive username normalization', () => {
  test('trims and lowercases a valid account name', () => {
    assert.equal(normalizeHiveUsername('  Alice-01.dev  '), 'alice-01.dev');
  });

  test('rejects invalid account names before challenge creation', () => {
    assert.throws(() => normalizeHiveUsername('ab'), InvalidHiveUsernameError);
    assert.throws(() => normalizeHiveUsername('-alice'), InvalidHiveUsernameError);
    assert.throws(() => normalizeHiveUsername('alice..dev'), InvalidHiveUsernameError);
    assert.throws(() => normalizeHiveUsername('alice_01'), InvalidHiveUsernameError);
  });
});
