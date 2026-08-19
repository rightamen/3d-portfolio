import { defineConfig } from 'vitest/config'

// Deliberately not vite.config.js: that file carries the production chunking
// and a closeBundle hook that empties dist/uploads, none of which should run
// because someone typed `npm run test:unit`.
//
// `include` is pinned to tests/unit for the same reason in reverse -- the
// default glob would sweep up tests/e2e/*.spec.js, which are Playwright specs
// and cannot run here.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.spec.js'],
    restoreMocks: true,
  },
})
