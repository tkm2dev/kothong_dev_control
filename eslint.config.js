import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/playwright-report/**', '**/test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // The plugin ships this as a warning. A missing dependency is a
      // stale-data bug that reads as correct code, and a warning in CI is a
      // finding nobody acts on, so it is an error here.
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    rules: {
      'no-console': 'error',
      // `x != null` is the one comparison worth keeping loose: it means "neither
      // null nor undefined", which is exactly what GitHub's nullable fields need.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          // Destructuring with a rest element is how a field is dropped from an
          // object; the named sibling is never meant to be read.
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
);
