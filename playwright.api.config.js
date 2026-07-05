import { defineConfig } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  testDir: './tests/api',
  // The DB-backed suite has its own config (playwright.api.db.config.js) and
  // is excluded here so `npm run test:api` stays the DB-free baseline.
  testIgnore: '**/contract.db.spec.js',
  timeout: 30_000,
})
