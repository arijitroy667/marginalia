import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SUPABASE_ONLY_IN_CORE = {
  name: '@supabase/supabase-js',
  message: 'Only src/core/{sync,auth,supabase} may import Supabase (CLAUDE.md rule 2).',
};

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', 'spikes', 'public/pdfjs', 'fixtures'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'No raw HTML outside the reviewed sanitiser wrapper (NFR-SEC-05).',
        },
      ],
    },
  },
  { files: ['src/**/*.{ts,tsx}'], ...reactHooks.configs.flat['recommended-latest'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/sync/**', 'src/core/auth/**', 'src/core/supabase/**'],
    rules: { 'no-restricted-imports': ['error', { paths: [SUPABASE_ONLY_IN_CORE] }] },
  },
  {
    // pure TypeScript core (CLAUDE.md rule 1); tsconfig.core.json also removes DOM types
    files: ['src/core/line-engine/**', 'src/core/anchors/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [SUPABASE_ONLY_IN_CORE],
          patterns: [
            { group: ['react', 'react-*', 'react/*'], message: 'core is pure TS (rule 1)' },
            { group: ['pdfjs-dist', 'pdfjs-dist/*', 'dexie', 'dexie-*'], message: 'core is pure TS (rule 1)' },
            { group: ['**/features/**', '**/app/**', '**/core/db/**', '**/core/sync/**'], message: 'core is pure TS (rule 1)' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.config.{ts,js}', 'scripts/**', 'e2e/**', 'supabase/tests/**', '**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
  { files: ['**/*.{js,mjs}'], ...tseslint.configs.disableTypeChecked },
);
