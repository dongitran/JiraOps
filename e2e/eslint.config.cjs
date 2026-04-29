const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');

const strictTypeScriptRules = {
  curly: ['error', 'all'],
  eqeqeq: ['error', 'always'],
  'no-console': 'error',
  'no-eval': 'error',
  'no-implicit-coercion': 'error',
  'no-new-func': 'error',
  'no-restricted-syntax': [
    'error',
    {
      selector: 'TSEnumDeclaration',
      message: 'Use an as const object with a derived union type instead of a TypeScript enum.',
    },
  ],
  'no-var': 'error',
  'object-shorthand': ['error', 'always'],
  'prefer-const': 'error',
  'prefer-template': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'error',
    {
      prefer: 'type-imports',
      disallowTypeAnnotations: false,
    },
  ],
  '@typescript-eslint/explicit-function-return-type': [
    'error',
    {
      allowExpressions: true,
      allowHigherOrderFunctions: true,
      allowTypedFunctionExpressions: true,
    },
  ],
  '@typescript-eslint/no-confusing-void-expression': [
    'error',
    {
      ignoreArrowShorthand: true,
      ignoreVoidOperator: true,
    },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': [
    'error',
    {
      checksVoidReturn: {
        attributes: false,
      },
    },
  ],
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/strict-boolean-expressions': [
    'error',
    {
      allowNullableObject: false,
      allowNullableBoolean: false,
      allowNullableString: false,
      allowNullableNumber: false,
      allowString: false,
      allowNumber: false,
    },
  ],
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
};

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = tseslint.config(
  {
    ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: strictTypeScriptRules,
  }
);
