import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @ogm/db generate --name <name>` writes the next timestamped migration.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/index.ts',
  out: './migrations',
  migrations: { prefix: 'timestamp' },
});
