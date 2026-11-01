import type { Presence } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { zeroPrivatePresence } from '../src/presence.js';

const presence: Presence = {
  cursor: { x: 0.1, y: 0.2 },
  selection: ['e1'],
  focusControlId: 'prompt.input',
  camera: { pos: [0, 1, 2], target: [0, 0, 0], zoom: 1 },
  privateMode: true,
  building: { jobId: 'job_1', label: 'building…', pct: 10 },
};

describe('zeroPrivatePresence', () => {
  it('clears cursor, selection, focus and camera but keeps building in private mode', () => {
    expect(zeroPrivatePresence(presence)).toEqual({ selection: [], privateMode: true, building: presence.building });
  });

  it('passes public presence through', () => {
    const open = { ...presence, privateMode: false };
    expect(zeroPrivatePresence(open)).toEqual(open);
  });
});
