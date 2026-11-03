// ESLint 10 (flat config). Thay cho .eslintrc.js cu, giu nguyen bo luat.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-process-exit': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
