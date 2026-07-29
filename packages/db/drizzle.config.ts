import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  // Never hardcoded. Absent in CI generation, supplied only when applying.
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
});
