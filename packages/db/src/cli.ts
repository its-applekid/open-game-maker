import { join } from 'node:path';

import { loadEnv } from '@ogm/config';

import { migrate } from './migrate.js';
import { openDb } from './open.js';

// Operator CLI: run with the API stopped, since the API is the database's only writer.
const env = loadEnv('db', { OGM_DATA_DIR: { kind: 'path' } });
const { sqlite } = openDb(join(env.OGM_DATA_DIR, 'ogm.sqlite3'));
try {
  console.log(JSON.stringify(migrate({ sqlite })));
} finally {
  sqlite.close();
}
