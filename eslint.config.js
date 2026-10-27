import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@moondreamsdev/dreamer-ui/components',
              importNames: ['Callout'],
              message:
                "Use '@/components/InlineNotice': Callout hard-codes dark-mode text colours that disappear on a light theme.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
