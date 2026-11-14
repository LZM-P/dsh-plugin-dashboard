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
  // Every entry point that takes the maintenance gate must report the flag, not
  // just the batch updater -- otherwise the same machine says "I waited" for a
  // bulk update and says nothing for a single install.
  check('applyUpdates reports unguarded', source.includes('unguarded: true'))
  const guardedPnpm = extract('guardedPnpm')
  check('guardedPnpm computes the flag', guardedPnpm.includes('release.gated === false'))
  check('guardedPnpm marks its result', guardedPnpm.includes('markUnguarded('))
  const fileUpgrade = extract('applyFileUpgrade')
  check('applyFileUpgrade computes the flag', fileUpgrade.includes('release.gated === false'))
  check('applyFileUpgrade marks its result', fileUpgrade.includes('markUnguarded('))
}

console.log('connection reset is not reported as failure')
{
  const client = readFileSync(join(root, 'client.js'), 'utf8')

  // 真跑这两个纯函数，不再 grep 源码。上一轮这 5 项全是 includes()，
  // 所以「load() 返回 undefined → sameEnabledMap 里读 undefined.rows 炸掉」
  // 这个 P0 在 33 项全绿的情况下活了下来。
  function loadClientFn(name) {
    const start = client.indexOf('function ' + name + '(')
    if (start === -1) throw new Error('function ' + name + ' not found in client.js')
    let depth = 0
    let index = client.indexOf('{', start)
    for (; index < client.length; index += 1) {
      const ch = client[index]
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    return client.slice(start, index + 1).replace(/^function\s+\w+/, 'function')
  }

  const sameEnabledMap = new Function(
    'return (' + loadClientFn('sameEnabledMap') + ')',
  )()
  const failureOutcome = new Function(
    'sameEnabledMap',
    'return (' + loadClientFn('failureOutcome') + ')',
  )(sameEnabledMap)

  const snap = (pairs) => ({ rows: pairs.map(([entryId, enabled]) => ({ entryId, enabled })) })

  check('identical snapshots agree', sameEnabledMap(snap([['a', true]]), snap([['a', true]])) === true)
  check('a changed row is detected', sameEnabledMap(snap([['a', true]]), snap([['a', false]])) === false)
  check('rows added by the reload are ignored', sameEnabledMap(snap([['a', true]]), snap([['a', true], ['b', false]])) === true)
  check('a vanished row is ignored', sameEnabledMap(snap([['a', true], ['b', false]]), snap([['a', true]])) === true)

  // 这正是 P0：load() 曾返回 undefined，而判空只写了 !== null。
  check('undefined healed snapshot does not throw', (() => {
    try {
      return sameEnabledMap(snap([['a', true]]), undefined) === false
    } catch {
      return false
    }
  })())
  check('null healed snapshot does not throw', (() => {
    try {
      return sameEnabledMap(snap([['a', true]]), null) === false
    } catch {
      return false
    }
  })())

  // failureOutcome 是 catch 里那段分支的纯形式。
  check('settled change stays silent', failureOutcome('unreachable', snap([['a', true]]), snap([['a', true]])).kind === null)
  check('lost connection downgrades to a warning', failureOutcome('unreachable', snap([['a', true]]), snap([['a', false]])).kind === 'warn')
  check('the warning names connLost', failureOutcome('timeout', null, null).reason === 'connLost')
  check('a real error stays an error', failureOutcome('boom', null, null).kind === 'err')
  check('no expectation means no silence', failureOutcome('unreachable', null, snap([['a', true]])).kind === 'warn')
  // 旧 bug 的完整形状：healed 是 undefined 时代码不该崩，也不该误判成"已生效"。
  check('an undefined healed snapshot never claims success', (() => {
    try {
      return failureOutcome('unreachable', snap([['a', true]]), undefined).kind === 'warn'
    } catch {
      return false
    }
  })())
}

console.log('one update button covers both channels')
{
  const client = readFileSync(join(root, 'client.js'), 'utf8')
  // 「其他安装方式」那一栏已经去掉。勾选的包现在按通道分流：
  // 精确版本锁定的走 POST /updates，github / 本地压缩包 / 压缩包地址走 POST /extras。
  // 之前这里一律发 /updates，file 包被 eligibleDeps 过滤掉，勾了也静默不装。
  check('the batch splits selected names into two channels', client.includes('const npmNames = []'))
  check('file packages are routed to file-upgrade', client.includes("extra.kind === 'file'") && client.includes("action: 'file-upgrade'"))
  check('github packages are routed to repull', client.includes("action: 'repull'"))
  check('tarball packages are routed to pin', client.includes("action: 'pin'"))
  check('the npm channel still uses one /updates call', client.includes("request('/updates', { names: npmNames }"))
  // extras 的结果不能直接塞进 updateLog 当整份快照用，必须被合并成一条。
  check('mixed results are merged into one report', client.includes('const merged ='))
  check('a partial failure is surfaced, not hidden', client.includes('updatePartial'))
  // 勾选现在同时来自两个接口。
  check('selections come from both endpoints', client.includes("extrasNext = await request('/extras')"))
  // 那一栏本身必须真的没了。
  check('the extras panel is gone', !client.includes('extrasPanel'))
  check('the per-row extras renderer is gone', !client.includes('extraRowNode'))
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
