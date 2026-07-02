import { defineConfig } from '@playwright/test'

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  testDir: './tests/api',
  timeout: 30_000,
})
