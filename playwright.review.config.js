import { defineConfig, devices } from '@playwright/test'

// Local built frontend only. API responses are controlled by each test so
// network failures, slow responses and account changes are reproducible.
export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  testDir: './tests/review',
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4197',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server/index.js',
    url: 'http://127.0.0.1:4197/api/health',
    reuseExistingServer: false,
    env: { DATABASE_URL: '', ADMIN_TOKEN: '', PORT: '4197', NODE_ENV: 'test' },
  },
})
