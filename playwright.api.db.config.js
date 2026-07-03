import { defineConfig } from '@playwright/test'

// DB-backed API contract suite (API_V1_FREEZE_PLAN.md §17). Run through
// `npm run test:api:db`, which provisions a disposable PostgreSQL cluster and
// exports API_TEST_DATABASE_URL before invoking Playwright with this config.
export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  testDir: './tests/api',
  testMatch: '**/contract.db.spec.js',
  // The suite is strictly sequential: one shared server + seeded fixtures.
  workers: 1,
  timeout: 60_000,
})
