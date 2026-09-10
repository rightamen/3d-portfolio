import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'data']),
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['server/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        sourceType: 'module',
      },
    },
  },
  // scripts/ and tests/ previously matched no config block with rules, so
  // `eslint .` walked them and reported nothing but parse errors — including
  // deploy-vps.mjs, which runs as root on the VPS.
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        sourceType: 'module',
      },
    },
  },
  {
    // Named one by one rather than by a scripts/*browser* pattern: everything
    // else under scripts/ is Node-only, and widening the whole directory to
    // browser globals would hide a real `document` typo in the twenty scripts
    // that have no browser at all.
    files: ['scripts/verify-notification-journey.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { sourceType: 'module' },
    },
  },
  {
    // Playwright specs run in Node, but page.evaluate callbacks are serialized
    // into the browser, so both global sets are legitimately in scope.
    files: ['tests/**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        sourceType: 'module',
      },
    },
  },
])
