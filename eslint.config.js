// @ts-check
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', '.jest-dist.next/**', '.jest-dist.prev/**', 'node_modules/**', 'coverage/**'],
  },
  // Root-level tooling config files: plain CommonJS Node scripts, not part of the TS project.
  {
    files: ['*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
  // Release tooling (task-060, spec-015 §3): plain CommonJS Node scripts run from a bare checkout.
  {
    files: ['scripts/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  // TypeScript sources and tests (plus the release scripts' hand-written declarations).
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.d.cts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // Determinism directive: no `any` without justification.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  }
);
