import { describe, expect, test } from 'vitest';

import { parsePublicApiUrl } from './env';

describe('web public environment', () => {
  test('normalizes the API base URL to an origin', () => {
    expect(parsePublicApiUrl('http://localhost:3001/api')).toBe('http://localhost:3001');
  });

  test('rejects non-http API URLs', () => {
    expect(() => parsePublicApiUrl('file:///tmp/hivelore')).toThrow(/http or https/);
  });
});
