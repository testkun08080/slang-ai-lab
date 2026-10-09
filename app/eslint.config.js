const js = require('@eslint/js')
const nextCoreWebVitals = require('eslint-config-next/core-web-vitals')

module.exports = [
  js.configs.recommended,
  ...(Array.isArray(nextCoreWebVitals) ? nextCoreWebVitals : [nextCoreWebVitals]),
  {
    ignores: ['**/.next/**', '**/node_modules/**', '**/out/**', '**/build/**', 'public/**'],
  },
  // This codebase contains many UI components generated/ported with TypeScript-only references.
  // Keep ESLint usable for now by avoiding hard failures on those patterns.
  {
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // New React Compiler-oriented rules shipped with eslint-config-next 16.
      // They flag pre-existing patterns (setState in effects, Date.now in render);
      // keep them visible as warnings until the components are refactored.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]

