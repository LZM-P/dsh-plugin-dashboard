// Assemble client.js from the parts under src/client/.
//
// The Client half is loaded by DSH's module loader as one plain script: there
// is no bundler in this package and no `import` at runtime. So the source lives
// in ESM parts (which the tests can import directly) and this script strips the
// `export` statements and wraps the result in the loader shell.
//
//   node scripts/build-client.mjs           # rewrite client.js
//   node scripts/build-client.mjs --check   # fail if client.js is stale
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PARTS = ['i18n.js', 'view.js', 'style.js', 'panel.js']

const HEAD = `/**
 * Client half of the plugin rack.
 *
 * GENERATED FILE — edit src/client/*.js and run \`node scripts/build-client.mjs\`.
 * The module loader takes one plain script, so the parts are concatenated here
 * instead of being imported at runtime.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-rack',
  factory(require) {
`

const TAIL = `    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        const Dashboard = makeDashboard(ctx);

        ctx.effect(() => ctx.locale.register(NS, 'en', DICT.en));
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICT.zh));

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 25,
              label: () => DICT[pickLocale(ctx)].title,
            },
            SidebarIcon,
          ),
        );

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID }, Dashboard),
        );
      },
    };
  },
});
`

/**
 * Strip the ESM export statements: the parts are concatenated into one scope.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripExports(source) {
  return source
    .split('\n')
    .filter((line) => !/^export\s*\{/.test(line))
    .map((line) => line.replace(/^export\s+(?=(const|let|var|function|async))/u, ''))
    .join('\n')
}

/**
 * @returns {string} the whole client.js
 */
export function assemble() {
  const body = PARTS.map((name) => {
    const file = readFileSync(join(ROOT, 'src', 'client', name), 'utf8')
    return stripExports(file).replace(/\s+$/, '') + '\n'
  }).join('\n')
  return HEAD + body + TAIL
}

const check = process.argv.includes('--check')
const built = assemble()
const target = join(ROOT, 'client.js')

if (check) {
  const current = readFileSync(target, 'utf8')
  if (current !== built) {
    console.error('client.js is stale: run `node scripts/build-client.mjs`')
    process.exit(1)
  }
  console.log('client.js is up to date')
} else {
  writeFileSync(target, built)
  console.log('wrote client.js (' + built.split('\n').length + ' lines)')
}
