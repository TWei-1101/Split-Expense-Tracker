import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', caughtErrorsIgnorePattern: '^_' }],
      // React Compiler 1.0 (2025-10) 的 lint rule。55 個 useMemo/useCallback 一次
      // 湧入（既有 manual memoization 在 Compiler-aware lint 下不支援 preserve）。
      // 降成 warn 不擋 CI、保留當技術債清單：未來拆 App.real.jsx 碰到再順手處理。
      // 規則可能揭露真 dependency 問題、不要逐處 eslint-disable 蓋掉。
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
])
