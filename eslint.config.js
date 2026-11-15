import js from '@eslint/js'

// Two halves, two environments: index.js is the host half (node built-ins),
// client.js is the panel half (browser globals injected by the layout). They
// live in the same folder, so the config has to say which is which instead of
// picking one set of globals for both.
export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        fetch: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        React: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Unused arguments are often the shape of a callback contract here
      // (`(_event) => …`), so only warn, and never for underscore names.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
]
