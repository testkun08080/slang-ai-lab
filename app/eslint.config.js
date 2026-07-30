const { FlatCompat } = require('@eslint/eslintrc')
const js = require('@eslint/js')

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

module.exports = [
  js.configs.recommended,
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['**/.next/**', '**/node_modules/**', '**/out/**', '**/build/**', 'public/**'],
  },
  // This codebase contains many UI components generated/ported with TypeScript-only references.
  // Keep ESLint usable for now by avoiding hard failures on those patterns.
  {
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
]

