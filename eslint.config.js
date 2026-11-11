import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

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
            {
              name: '@moondreamsdev/dreamer-ui/components',
              importNames: ['Drawer'],
              message:
                "Use '@/components/Drawer': it closes with a swipe down anywhere on the sheet, the same way its close control does.",
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='type'][value.value='date']",
          message:
            "Use '@/components/DateInput': an empty native date input draws as a blank box on phones, and DateInput shows the format or a placeholder.",
        },
        {
          selector:
            "CallExpression[callee.property.name='replaceState'] > ObjectExpression > Property > Literal[value=true]",
          message:
            "Mark a Back step with markHistoryStep/isHistoryStep ('@/hooks/useBackHistory'): history.state outlives a reload, so a `true` mark from an earlier load pops onto the old page and loads the app again.",
        },
      ],
    },
  },
  {
    files: ['src/components/DateInput.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/components/Drawer.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['scripts/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]);
