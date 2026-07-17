import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    // 린트 제외 대상 (빌드 산출물·외부 자산)
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'claudedocs/**',
      '.claude/**',
      'coverage/**',
      '.firebase/**',
    ],
  },
  {
    // src + tests 만 대상 (타입 미연동 — 게이트 속도 우선)
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      // v7 프리셋은 React Compiler 규칙까지 에러로 포함하므로
      // 고전 recommended 2종만 수동 등록 (게이트 범위 고정)
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      // 훅 규칙은 항상 에러 유지
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
      // 실용적 완화: any 는 경고, _ 접두사 인자/변수는 미사용 허용
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // 테스트 파일: Node 전역(process 등) 추가 허용
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  }
);
