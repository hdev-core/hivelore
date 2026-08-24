import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parsePublicApiUrl } from './env';

describe('web public environment', () => {
  test('normalizes the API base URL to an origin', () => {
    assert.equal(parsePublicApiUrl('http://localhost:3001/api'), 'http://localhost:3001');
  });

  test('rejects non-http API URLs', () => {
    assert.throws(() => parsePublicApiUrl('file:///tmp/hivelore'), /http or https/);
  });
});
