import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettierConfig from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const browserFiles = ['apps/web/**/*.{ts,tsx}'];
const nodeFiles = [
  'apps/api/**/*.ts',
  'packages/**/*.ts',
  '*.config.{js,mjs,ts}',
  'eslint.config.mjs',
  'prettier.config.mjs',
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'apps/**/.next/**',
      '**/dist/**',
      'coverage/**',
      '.vercel/**',
      '**/*.tsbuildinfo',
      'apps/web/next-env.d.ts',
      'apps/api/src/generated/prisma/**',
      'app/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: browserFiles,
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      next: {
        rootDir: 'apps/web/',
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: nodeFiles,
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
  },
  prettierConfig,
);
