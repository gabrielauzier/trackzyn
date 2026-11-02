import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The concurrency tests need a real PostgreSQL: PGlite has a single connection.
    exclude: process.env.TEST_POSTGRES_URL ? [] : ['test/postgres/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/worker.ts', 'src/scheduler.ts', 'src/cli.ts', 'src/migrate.ts'],
      thresholds: { lines: 60 },
    },
  },
})
