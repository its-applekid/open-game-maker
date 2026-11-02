import type { BoundaryReason, BoundaryRule } from '../types.js';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const PHONE = /(?:\+\d{1,3}[\s.-])?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{4}\b/u;
const STREET = /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,3}\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|court|ct)\b/iu;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export const piiRule: BoundaryRule = (input) => {
  const reasons: BoundaryReason[] = [];
  const profilePatterns = input.profileNames
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .map((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'iu'));

  for (const file of input.files) {
    if (file.status === 'removed' || file.content === undefined || file.binary) continue;
    file.content.split(/\r?\n/u).forEach((line, index) => {
      const classes = [
        ...(profilePatterns.some((pattern) => pattern.test(line)) ? ['profile term'] : []),
        ...(EMAIL.test(line) ? ['email address'] : []),
        ...(PHONE.test(line) ? ['phone number'] : []),
        ...(STREET.test(line) ? ['street address'] : []),
      ];
      for (const classification of classes) {
        reasons.push({
          code: 'pii',
          path: file.path,
          detail: `personal information (${classification}) at line ${index + 1}`,
        });
      }
    });
  }
  return reasons;
};
