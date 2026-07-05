import { expect, test } from '@playwright/test'

const visitorEmail = process.env.E2E_VISITOR_EMAIL
const visitorPassword = process.env.E2E_VISITOR_PASSWORD

const expectedApiStatuses = [
  ['/api/health', 200],
  ['/api/account/profile', 401],
  ['/api/account/downloads', 401],
  ['/api/account/comments', 401],
  ['/api/users/not-exist-test-handle', 404],
]

const pageCases = [
  {
    assertions: async (page) => {
      await expect(page.getByRole('heading', { name: /hi, i am right/i })).toBeVisible()
      await expect(page.getByRole('link', { name: 'mrright.blog' })).toBeVisible()
    },
    path: '/',
    title: /mrright\.blog/i,
  },
  {
    assertions: async (page) => {
      await expect(page.getByRole('heading', { name: /visitor assets and creative exchange/i })).toBeVisible()
      await expect(page.getByText(/sign in to post/i)).toBeVisible()
    },
    path: '/community',
    title: /mrright\.blog/i,
  },
  {
    assertions: async (page) => {
      await expect(page.getByRole('heading', { name: /sign in to your visitor account/i })).toBeVisible()
      await expect(page.locator('form').getByRole('button', { name: /^log in$/i })).toBeVisible()
    },
    path: '/login?mode=login',
    title: /mrright\.blog/i,
  },
  {
    assertions: async (page) => {
      await expect(page.getByRole('heading', { name: /sign in required/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /^log in$/i })).toBeVisible()
    },
    path: '/account',
    title: /mrright\.blog/i,
  },
  {
    assertions: async (page) => {
      await expect(page.getByRole('heading', { name: /profile not found/i })).toBeVisible()
      await expect(page.getByText(/user profile not found/i)).toBeVisible()
    },
    path: '/u/not-exist-test-handle',
    title: /mrright\.blog/i,
  },
]

test.describe('production smoke', () => {
  test.describe.configure({ mode: 'serial' })

  for (const pageCase of pageCases) {
    test(`renders ${pageCase.path}`, async ({ page }) => {
      const serverErrors = []
      const failedRequests = []

      page.on('response', (response) => {
        if (response.status() >= 500) {
          serverErrors.push(`${response.status()} ${response.url()}`)
        }
      })
      page.on('requestfailed', (request) => {
        failedRequests.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`)
      })

      const response = await page.goto(pageCase.path, { waitUntil: 'domcontentloaded' })

      expect(response?.status()).toBeLessThan(500)
      await expect(page).toHaveTitle(pageCase.title)
      await pageCase.assertions(page)
      await expect(page.locator('body')).not.toBeEmpty()
      expect(serverErrors).toEqual([])
      expect(failedRequests).toEqual([])
    })
  }

  test('returns expected read-only API statuses', async ({ request }) => {
    for (const [endpoint, expectedStatus] of expectedApiStatuses) {
      const response = await request.get(endpoint)

      expect(response.status(), endpoint).toBe(expectedStatus)
      expect(response.status(), endpoint).not.toBe(500)
    }
  })

  test('can sign in with optional visitor credentials', async ({ page }) => {
    test.skip(!visitorEmail || !visitorPassword, 'Set E2E_VISITOR_EMAIL and E2E_VISITOR_PASSWORD to run login smoke test.')

    await page.goto('/login?mode=login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(/email/i).fill(visitorEmail)
    await page.getByLabel(/password/i).fill(visitorPassword)
    await page.locator('form').getByRole('button', { name: /^log in$/i }).click()

    await expect(page).toHaveURL(/\/account/)
    await expect(page.getByRole('heading', { name: /account|profile|settings/i })).toBeVisible()
  })
})
