import { describe, expect, it } from 'vitest';

import { normalizeEmail, parseEmailList } from '../src/auth/access.js';

describe('sign-in email access', () => {
  it('normalizes a comma-separated env list and drops blanks and duplicates', () => {
    const configured = parseEmailList(' KIM@Example.com, sam@example.com, kim@example.com, ,');

    expect([...configured]).toEqual(['kim@example.com', 'sam@example.com']);
    expect(normalizeEmail('  Owner@Example.com ')).toBe('owner@example.com');
  });
});
