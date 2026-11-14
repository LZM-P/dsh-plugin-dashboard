#!/usr/bin/env node
// Behavioural checks for the pieces that are easy to break silently.
//
// Run it before publishing:  node test/behaviour.mjs
//
// These are not integration tests — they exercise the pure decision functions
// that the bug-prone paths depend on (package naming, cancellation truth, idle
// gate reporting). A regression in any of them turns into a wrong UI state
// rather than a crash, so nothing else would catch it.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const source = readFileSync(join(root, 'index.js'), 'utf8')

const failures = []
const check = (label, ok, detail) => {
  if (ok) {
    console.log('  ok   ' + label)
  } else {
    console.log('  FAIL ' + label + (detail === undefined ? '' : ' — ' + detail))
    failures.push(label)
  }
}

/** Pull a top-level `function name(...) { ... }` out of the source and eval it. */
function extract(name) {
  const start = source.indexOf('function ' + name + '(')
  if (start === -1) throw new Error('function ' + name + ' not found in index.js')
  let depth = 0
  let index = source.indexOf('{', start)
  const bodyStart = index
  for (; index < source.length; index += 1) {
    const ch = source[index]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  return source.slice(start, index + 1).replace(/^function\s+\w+/, 'function')
}

function load(name) {
  // eslint-disable-next-line no-new-func
  return new Function('return (' + extract(name) + ')')()
}

console.log('displayName')
{
  const displayName = load('displayName')
  check('scoped package keeps both segments', displayName('@scope/pkg') === '@scope/pkg')
  check('bare name passes through', displayName('dsh-whale-widget') === 'dsh-whale-widget')
  check(
    'file:// resolves the package after node_modules',
    displayName('file:///C:/x/node_modules/cc-safety-net/dist/deepseek-harness/index.js') === 'cc-safety-net',
  )
  check(
    'file:// resolves a scoped package',
    displayName('file:///C:/x/node_modules/@scope/pkg/dist/index.js') === '@scope/pkg',
  )
  check(
    'nested node_modules resolves to the nearest package',
    displayName('file:///C:/x/node_modules/a/node_modules/b/index.js') === 'b',
  )
  check(
    'a plain path falls back to the file name',
    displayName('file:///C:/x/packages/my-plugin/index.js') === 'index.js',
  )
}

console.log('cancellation truth')
{
  // The rule: a cancelled job stays cancelled even after the global abort
  // controller has been cleared, because endJob() nulls it and the running
  // applyUpdates would otherwise sail past every check.
  const jobCancelled = load('jobCancelled')
  check('a cancelled job reports cancelled', jobCancelled({ cancelled: true }) === true)
  check('a live job reports not cancelled', jobCancelled({ cancelled: false }) === false)
  check('a missing job reports not cancelled', jobCancelled(null) === false)
  check('an undefined job reports not cancelled', jobCancelled(undefined) === false)
}

console.log('idle gate reporting')
{
  // holdAgents returns a release function carrying `.gated`. The whole point is
  // that "no agents service" must not be mistaken for "waited and everyone was
  // idle", so the flag has to be set on every return path.
  const body = extract('holdAgents')
  check('ungated path sets gated = false', body.includes('releaseUngated.gated = false'))
  check('gated path sets gated = true', body.includes('releaseAll.gated = true'))
  check('ungated path returns early', /if \(!available\)[^]*?return releaseUngated/.test(body))
}

console.log('write gate')
{
  // A POST that carries no browser provenance must be refused unless the caller
  // opts in explicitly. This is the only thing standing between "any local
  // script" and "uninstall every plugin".
  check(
    'explicit opt-in header is honoured',
    source.includes("String(req.headers['x-dsh-plugin-rack'] ?? '') === '1'"),
  )
  check('same-site fetch is honoured', source.includes("secFetchSite === 'same-origin'"))
  check('a bare curl without provenance is refused', source.includes('write requests need an Origin header'))
  const client = readFileSync(join(root, 'client.js'), 'utf8')
  check('the panel sends the opt-in header itself', client.includes("'x-dsh-plugin-rack': '1'"))
}

console.log('profile migration')
{
  const body = extract('adoptProfile')
  for (const file of ['state.json', 'job.json', 'queue.json', 'config.json']) {
    check('carries ' + file, source.includes("'" + file + "'"))
  }
  check('carries both update logs', source.includes("'last-update.log'") && source.includes("'update-log.jsonl'"))
  check('never overwrites an existing target', body.includes('if (existsSync(target)) continue'))
}

console.log('rollback is not cancellable')
{
  const body = extract('cancelJob')
  check('cancelJob refuses during rollback', body.includes("job.stage === 'rollback'"))
  check('jobStatus publishes cancelable', source.includes('cancelable = running && job.stage'))
  const client = readFileSync(join(root, 'client.js'), 'utf8')
  check('the client honours cancelable rather than guessing', client.includes('job.cancelable === false'))
}

if (failures.length > 0) {
  console.log('')
  console.log('BEHAVIOUR_CHECK_FAILED: ' + failures.length + ' problem(s)')
  process.exit(1)
}
console.log('')
console.log('BEHAVIOUR_CHECK_OK')
