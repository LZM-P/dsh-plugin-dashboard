// A renamed plugin must not look like a fresh install.
//
// The state directory is keyed by the plugin name, so a build that was renamed
// boots into an empty panel: no auto roster, no remembered job, no proxy, no
// history. adoptProfile() copies the previous directory forward. This drives it
// for real on a throwaway DSH_HOME, including a state file that no list would
// have named, because "the whole directory" is the property being promised.
//
// Run with: node test/migration.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(ok, label) {
  if (ok) console.log('ok   ' + label)
  else {
    failures += 1
    console.error('FAIL ' + label)
  }
}

const home = mkdtempSync(join(tmpdir(), 'rack-migrate-'))
process.env.DSH_HOME = home

// The previous build's single, un-keyed state directory.
const legacy = join(home, 'plugin-rack')
mkdirSync(legacy, { recursive: true })
writeFileSync(join(legacy, 'state.json'), JSON.stringify({ auto: ['dsh-kept'] }))
writeFileSync(join(legacy, 'job.json'), JSON.stringify({ id: 'old-run', finishedAt: '2026-01-01T00:00:00.000Z' }))
writeFileSync(join(legacy, 'last-update.log'), 'OK 3 package(s)\n')
// No list ever named this one: it must still travel.
writeFileSync(join(legacy, 'settings-v2.json'), JSON.stringify({ proxy: 'http://127.0.0.1:7897' }))
// A directory in the state root is not state; it must not be copied as a file.
mkdirSync(join(legacy, 'profiles'), { recursive: true })

const profile = join(home, 'profiles', 'desktop')
mkdirSync(profile, { recursive: true })
writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'profile', dependencies: {} }, null, 2))

const ctx = {
  pluginManager: {
    async registries() {
      return { resolved: 'http://127.0.0.1:9/', registry: 'http://127.0.0.1:9/' }
    },
    async listBundles() {
      return []
    },
    list() {
      return []
    },
  },
  get(name) {
    if (name === 'profileContext') return { dir: profile }
    return undefined
  },
  effect(fn) {
    fn()
  },
  webServer: {
    register() {},
  },
}

const mod = await import(new URL('../index.js', import.meta.url).href)
mod.apply(ctx)

const state = join(home, 'plugin-rack', 'profiles', 'desktop')
const carried = path => join(state, path)

check(existsSync(carried('state.json')), 'the auto roster is carried over')
check(existsSync(carried('job.json')), 'the remembered job is carried over')
check(existsSync(carried('last-update.log')), 'the update log is carried over')
check(
  existsSync(carried('settings-v2.json')),
  'a state file no list names is carried over too (the whole directory moves)',
)

const roster = JSON.parse(readFileSync(carried('state.json'), 'utf8'))
check(Array.isArray(roster.auto) && roster.auto.includes('dsh-kept'), 'the carried roster keeps its contents')

check(existsSync(join(legacy, 'state.json')), 'the old copy is left in place, not moved')
check(!existsSync(carried('profiles')), 'a directory in the state root is not copied as a file')

// Existence wins: a file the new build already wrote must not be overwritten.
const second = join(home, 'profiles', 'second')
mkdirSync(second, { recursive: true })
writeFileSync(join(second, 'package.json'), JSON.stringify({ name: 'profile2', dependencies: {} }, null, 2))
const first = join(home, 'plugin-rack', 'profiles', 'first')
mkdirSync(first, { recursive: true })
writeFileSync(join(first, 'state.json'), JSON.stringify({ auto: ['already-mine'] }))
mod.apply({
  ...ctx,
  get(name) {
    if (name === 'profileContext') return { dir: second }
    return undefined
  },
})

check(
  JSON.parse(readFileSync(join(first, 'state.json'), 'utf8')).auto.includes('already-mine'),
  'an existing profile file is never overwritten by the migration',
)

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('\nMIGRATION_OK')
// apply() arms timers, and a passing test must not wait for them.
process.exit(0)
