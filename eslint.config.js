// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/web-build/**',
      '**/ios/**',
      '**/android/**',
      '**/*.tsbuildinfo',
      'packages/content/packs/**',
      'packages/content/.cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Metro config is loaded by Metro's own CJS runtime, not Node ESM.
    files: ['**/metro.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Playwright e2e scripts: plain Node ESM (not type-checked, so no-undef
    // stays active unlike .ts files) that also pass closures into
    // `page.evaluate(...)` — those run inside the browser page, not Node,
    // so both sets of globals are needed in the same file.
    files: ['apps/client/e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        indexedDB: 'readonly',
        document: 'readonly',
        NodeFilter: 'readonly',
        getComputedStyle: 'readonly',
      },
    },
  },
);
