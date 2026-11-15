import js from '@eslint/js'

// The Client half is written as four ESM parts that are concatenated into one
// script at build time (see scripts/build-client.mjs). They share one scope, so
// linting a part in isolation reports its siblings' declarations as undefined.
// The checks that matter — no-undef, no-unused-vars — run on the assembled
// client.js, which is the file DSH actually loads.
const shared = {
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
}

const rules = {
  ...js.configs.recommended.rules,
  // Unused arguments are often the shape of a callback contract here
  // (`(_event) => …`), so only warn, and never for underscore names.
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
}

// Two halves, two environments: index.js is the host half (node built-ins),
// client.js is the panel half (browser globals injected by the layout). They
// live in the same folder, so the config has to say which is which instead of
// picking one set of globals for both.
export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: shared,
    rules,
  },
  {
    files: ['src/client/*.js'],
    rules: {
      'no-undef': 'off',
      // Same reason: PANEL_ID, NS and SidebarIcon are used by the shell that
      // wraps the parts, not by any single part.
      'no-unused-vars': 'off',
    },
  },
]
