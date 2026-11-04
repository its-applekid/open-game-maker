import { describe, expect, it } from 'vitest';

import { emailIsAllowed, mergeAllowedEmails, parseEmailList } from '../src/auth/access.js';

describe('sign-in email access', () => {
  it('normalizes comma-separated addresses and always includes maintainers', () => {
    const configured = parseEmailList(' KIM@Example.com, sam@example.com, kim@example.com, ,');
    const maintainers = parseEmailList(' Owner@Example.com ');
    const allowed = mergeAllowedEmails(configured, maintainers);

    expect([...configured]).toEqual(['kim@example.com', 'sam@example.com']);
    expect(emailIsAllowed('KIM@example.com', allowed)).toBe(true);
    expect(emailIsAllowed(' owner@example.com ', allowed)).toBe(true);
    expect(emailIsAllowed('stranger@example.com', allowed)).toBe(false);
  });
});
