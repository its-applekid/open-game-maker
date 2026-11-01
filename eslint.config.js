import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read env through @ogm/config',
        },
      ],
    },
  },
  {
    files: ['packages/config/src/**/*.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'prototypes/**',
      'third_party/**',
      'docs/**',
      'assets-local/**',
      '.claude/**',
      '.aiur/**',
      'scripts/**',
    ],
  },
];
