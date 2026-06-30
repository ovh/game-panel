import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'no-control-regex': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // Surfaced as a warning (advisory) so dependency-array bugs are visible without
      // failing the build on the existing backlog. Ratchet to 'error' once burned down.
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
      // tsc (noUnusedLocals/noUnusedParameters) is the source of truth for unused code,
      // so we disable the lint rule to avoid double-reporting.
      '@typescript-eslint/no-unused-vars': 'off',
      // ~170 pre-existing `any` usages — kept visible as warnings to burn down over time,
      // then ratchet this to 'error' (and remove --report fallbacks) once cleared.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Pre-existing style debt (empty extension interfaces, side-effecting ternaries).
      // Visible as warnings; ratchet to 'error' once cleaned.
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
    },
  }
);
