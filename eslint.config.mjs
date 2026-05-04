import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.tsbuildinfo',
      'packages/*/migrations/**',
      'packages/*/playwright-report/**',
      'packages/*/test-results/**',
      'packages/*/public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Node built-ins (used in api + shared + config files)
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        queueMicrotask: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        NodeJS: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        // Shared Web Platform (both browser + Node 20+)
        fetch: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        ReadableStream: 'readonly',
        RequestInit: 'readonly',
        BodyInit: 'readonly',
        EventTarget: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // TypeScript allows a const + a type alias to share the same name
      // (common Zod pattern: `export const Foo = z.object({...}); export type Foo = z.infer<typeof Foo>;`).
      // Both the base JS rule and @typescript-eslint version flag this — we
      // silence them because tsc already verifies namespace coherence.
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // eslint-plugin-security (REC-02). Lightweight SAST on the API + shared
  // surfaces — these are the paths that touch fs, child_process, regex on
  // user input, etc. Most rules are `error`; `detect-object-injection` is
  // off (high FP rate on TS-typed code), and a couple are `warn` because
  // they overlap with patterns we already audit by hand.
  {
    files: [
      'packages/api/src/**/*.{ts,tsx}',
      'packages/shared/src/**/*.{ts,tsx}',
      'packages/bible-mcp/src/**/*.{ts,tsx}',
    ],
    plugins: { security },
    rules: {
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-child-process': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-bidi-characters': 'error',
      // High false-positive rate on TS-typed object access. `assertSafePath`
      // is our actual guard; turning this on flags every legitimate dynamic
      // map lookup.
      'security/detect-object-injection': 'off',
    },
  },
  // Browser-specific globals for web + bible-ui packages
  {
    files: [
      'packages/web/**/*.ts',
      'packages/web/**/*.tsx',
      'packages/bible-ui/**/*.ts',
      'packages/bible-ui/**/*.tsx',
    ],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        KeyboardEvent: 'readonly',
        StorageEvent: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MouseEvent: 'readonly',
        FocusEvent: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        React: 'readonly',
      },
    },
  },
];
