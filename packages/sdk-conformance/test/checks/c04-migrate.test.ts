import { describe, expect, it } from 'vitest';

import { c04Migrate } from '../../src/checks/c04-migrate.js';
import { fakeContext } from '../fake-session.js';

const older = { saveSchemaVersion: 0, data: { legacy: true } };

describe('C4 previous-save-migrates', () => {
  it('passes when the previous release save migrates', async () => {
    const result = await c04Migrate.run(fakeContext({}, { saveFixture: older }));
    expect(result).toMatchObject({ status: 'pass', detail: 'save v0 migrated to v1' });
  });

  it('fails when migrate throws', async () => {
    const result = await c04Migrate.run(fakeContext({ migrateThrows: true }, { saveFixture: older }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('save_unsupported') });
  });

  it('fails when the migrated save disagrees with the restored game', async () => {
    const result = await c04Migrate.run(fakeContext({ migrationDiverges: true }, { saveFixture: older }));
    expect(result).toMatchObject({ status: 'fail', detail: 'save v0 migrated to v1 but /score differs from the game' });
  });

  it('does not take a save written at boot for a migration', async () => {
    const result = await c04Migrate.run(fakeContext({ bootSave: true, migrateIgnored: true }, { saveFixture: older }));
    expect(result).toMatchObject({ status: 'fail', detail: expect.stringContaining('previous save v0 restored with') });
  });

  it('is unchecked without a previous save', async () => {
    expect((await c04Migrate.run(fakeContext())).status).toBe('unchecked');
  });
});
