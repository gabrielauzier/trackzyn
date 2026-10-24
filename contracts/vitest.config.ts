import { defineConfig } from 'vitest/config'
import { loadLocalEnv } from './tests/support/local-env.ts'

loadLocalEnv()

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/support/global-setup.ts'],
    // One server, one database: files run one after another, in name order.
    fileParallelism: false,
    sequence: { shuffle: false },
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
