import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // Le code est volontairement compact (expressions courtes enchaînées).
      'no-unused-expressions': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-cond-assign': 'off',
      'no-sparse-arrays': 'off',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
];
