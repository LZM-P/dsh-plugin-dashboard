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

  // 真跑这两个纯函数。上一版这 10 项全是 client.includes(...)，其中
  // 「a partial failure is surfaced」只检查有没有 updatePartial 这个词——
  // 而那个分支当时永远走不到，断言照样绿。
  function loadClientFn(name) {
    const start = client.indexOf('    function ' + name + '(')
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

  const partitionTargets = new Function('return (' + loadClientFn('partitionTargets') + ')')()
  // mergeUpdateReport 依赖 collectFailures（失败详情归一化），注入进去。
  const collectFailures = new Function('return (' + loadClientFn('collectFailures') + ')')()
  const mergeUpdateReport = new Function(
    'collectFailures',
    'return (' + loadClientFn('mergeUpdateReport') + ')',
  )(collectFailures)
  const messageFor = (n, total) => n + ' of ' + total + ' failed'

  // ---- 分区 ----
  const extrasRows = [
    { name: 'gh-pkg', kind: 'github', hasUpdate: true },
    { name: 'file-pkg', kind: 'file', hasUpdate: true },
    { name: 'tar-pkg', kind: 'tarball', hasUpdate: false },
    { name: 'link-pkg', kind: 'link' },
  ]
  const split = partitionTargets(['npm-a', 'npm-b', 'gh-pkg', 'file-pkg', 'tar-pkg', 'link-pkg'], extrasRows)
  check('npm names go to the batch endpoint', JSON.stringify(split.npm) === JSON.stringify(['npm-a', 'npm-b']))
  check(
    'file packages reach file-upgrade',
    split.extras.some((one) => one.name === 'file-pkg' && one.action === 'file-upgrade'),
  )
  check(
    'github packages reach repull',
    split.extras.some((one) => one.name === 'gh-pkg' && one.action === 'repull'),
  )
  check(
    'tarball packages reach pin',
    split.extras.some((one) => one.name === 'tar-pkg' && one.action === 'pin'),
  )
  check('link packages are skipped entirely', !split.extras.some((one) => one.name === 'link-pkg'))
  check('an unknown name defaults to the npm channel', partitionTargets(['mystery'], []).npm.length === 1)
  // kind: 'other' 的行读不出来源，不该被猜成 pin。
  const other = partitionTargets(['other-pkg'], [{ name: 'other-pkg', kind: 'other' }])
  check('an unreadable kind is not guessed into a pin', other.extras.length === 0 && other.npm.length === 0)

  // ---- 合并：一个渠道失败不能吞掉其它渠道 ----
  const mixed = mergeUpdateReport(
    [
      { ok: true, updated: [{ name: 'npm-a', from: '1.0.0', to: '1.0.1' }] },
      { ok: false, name: 'file-pkg', message: 'checksum mismatch' },
    ],
    messageFor,
  )
  check('a mixed run is not reported as success', mixed.ok === false)
  check('the failure is listed with its reason', mixed.failed.length === 1 && mixed.failed[0].name === 'file-pkg')
  check('the partial message is actually produced', mixed.message === '1 of 2 failed')
  check('the successful channel is still reported', mixed.updated.length === 1)
  check('a reason string survives into failed[].output', mixed.failed[0].output === 'checksum mismatch')

  // 单个渠道时原样透传，面板要靠 log / hotSwap / restart 显示详情。
  const single = mergeUpdateReport([{ ok: true, log: '/tmp/x.log', hotSwap: { ok: true }, restart: false }], messageFor)
  check('a single channel passes through unchanged', single.log === '/tmp/x.log' && single.restart === false)

  // 全成功时不能编出失败信息。
  const allGood = mergeUpdateReport(
    [
      { ok: true, updated: [{ name: 'a', from: '1', to: '2' }] },
      { ok: true, name: 'b', to: '3.0.0' },
    ],
    messageFor,
  )
  check('an all-success run is ok', allGood.ok === true)
  check('an all-success run has no message', allGood.message === undefined)
  check('both channels contribute to updated', allGood.updated.length === 2)

  // restart 必须从任何一个渠道冒上来，否则混合更新的用户不知道要重启。
  const needsRestart = mergeUpdateReport(
    [
      { ok: true, restart: false },
      { ok: true, name: 'x', to: '2.0.0', restart: true },
    ],
    messageFor,
  )
  check('restart propagates from any channel', needsRestart.restart === true)

  // 空输入不能炸：没有渠道要跑时调用方不该收到任何报告对象。
  const empty = mergeUpdateReport([], messageFor)
  check('an empty result returns nothing rather than throwing', empty === undefined)

  // 单渠道失败必须也能渲染出「哪个渠道挂了」。之前单通道原样返回
  // {ok:false,name,message}，没有 failed 字段，面板只剩一句裸错误。
  const singleFail = mergeUpdateReport([{ ok: false, name: 'pkg-a', message: 'unreachable' }], messageFor)
  check('a single-channel failure still gets a failed entry', Array.isArray(singleFail.failed) && singleFail.failed.length === 1)
  check('the single-channel failure keeps its name', singleFail.failed[0].name === 'pkg-a')
  check('the single-channel failure keeps its reason', singleFail.failed[0].output === 'unreachable')

  // 单渠道成功仍然原样返回，面板要靠 log / hotSwap 显示详情。
  const singleOk = mergeUpdateReport([{ ok: true, log: '/tmp/x', hotSwap: { ok: true } }], messageFor)
  check('a single success passes through untouched', singleOk.log === '/tmp/x' && singleOk.hotSwap.ok === true)

  // 混合更新里一个渠道换了、另一个没换：不能报"已热替换"。
  // 各渠道管不同的包，npm 换进去了不代表 extras 那个也生效。
  // 界面只看 hotSwap.ok，所以它必须是合取，而不是挑成功的那条。
  const mixedSwap = mergeUpdateReport(
    [
      { ok: true, hotSwap: { ok: true }, restart: false },
      { ok: true, name: 'x', to: '2.0.0', hotSwap: { ok: false, reason: 'busy' }, restart: true },
    ],
    messageFor,
  )
  check('a partial swap does not claim success', mixedSwap.hotSwap.ok !== true)
  check('a partial swap is flagged', mixedSwap.partialSwap === true)
  check('a partial swap asks for a restart', mixedSwap.restart === true)
  check(
    'the reported swap reason is the failed one',
    mixedSwap.hotSwap.reason === 'busy',
  )

  const allSwapped = mergeUpdateReport(
    [
      { ok: true, hotSwap: { ok: true }, restart: false },
      { ok: true, name: 'x', to: '2.0.0', hotSwap: { ok: true }, restart: false },
    ],
    messageFor,
  )
  check('every channel swapping means no restart', allSwapped.restart === false)
  check('every channel swapping is not partial', allSwapped.partialSwap === false)

  check(
    'no channel swapping keeps the restart advice',
    mergeUpdateReport(
      [
        { ok: true, hotSwap: { ok: false, reason: 'busy' }, restart: true },
        { ok: true, name: 'x', to: '2.0.0', restart: true },
      ],
      messageFor,
    ).restart === true,
  )

  // 单渠道失败时，服务端带回来的 failed 对象（含 pnpm 输出）不能丢。
  const withDetail = mergeUpdateReport(
    [{ ok: false, failed: { name: '3 packages', output: 'PNPM_STDOUT_DETAIL' }, message: 'rolled back' }],
    messageFor,
  )
  check('a single-channel failed object is not dropped', Array.isArray(withDetail.failed))
  check(
    'the server detail survives the single-channel merge',
    withDetail.failed.some((one) => String(one.output || '').includes('PNPM_STDOUT_DETAIL')),
  )

  // 多通道也必须带上同一份详情。上一版的 bug 就在这里：多通道分支只看顶层
  // message，把 one.failed.output 吞了 —— 而「混了 github / file / tarball 的
  // 全选」正是统一更新按钮的主场景。
  const multiDetail = mergeUpdateReport(
    [
      { ok: false, failed: { name: '3 packages', output: 'PNPM_STDOUT_DETAIL' }, message: 'rolled back' },
      { ok: true, name: 'file-pkg', to: '2.0.0' },
    ],
    messageFor,
  )
  check(
    'the server detail survives the multi-channel merge',
    multiDetail.failed.some((one) => String(one.output || '').includes('PNPM_STDOUT_DETAIL')),
  )
  check('both shapes report the same detail rows', multiDetail.failed.length === withDetail.failed.length)

  // collectFailures 本身：两种形态、去重、空值不产假行。
  check('an empty failure produces no rows', collectFailures({}).length === 0)
  check('a null failure produces no rows', collectFailures(null).length === 0)
  check(
    'a failed array is flattened',
    collectFailures({ failed: [{ name: 'a', output: 'x' }, { name: 'b', output: 'y' }] }).length === 2,
  )
  check(
    'a failed object is accepted too',
    collectFailures({ failed: { name: 'a', output: 'x' } }).length === 1,
  )
  check(
    'the same message is not repeated twice',
    collectFailures({ failed: { name: 'a', output: 'same' }, message: 'same' }).length === 1,
  )

  // ---- 结构约束 ----
  check(
    'every extras channel is wrapped in its own try/catch',
    /for \(const item of plan\.extras\)[\s\S]{0,400}?catch \(error\)/.test(client),
  )
  check(
    'the npm channel is wrapped too',
    /try \{\s*\n\s*\/\/ A registry download[\s\S]{0,300}?catch \(error\)/.test(client),
  )
  check('a thrown channel is collected, not rethrown', client.includes('results.push(failureEntry(error'))
  check('the panel keeps the report when a channel failed', client.includes('if (merged.ok === true) {'))
}

console.log('the panel renders the report it was given')
{
  const client = readFileSync(join(root, 'client.js'), 'utf8')

  function loadClientFn(name) {
    const start = client.indexOf('    function ' + name + '(')
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

  const renderUpdateReport = new Function('return (' + loadClientFn('renderUpdateReport') + ')')()
  const opts = { unknown: 'unknown' }

  // 上一版的 bug：failed 在单通道时是对象、合并后是数组，渲染端一律按对象读，
  // 多通道失败时详情行变成 "undefined: "，把「哪个渠道挂了」整个丢掉。
  const merged = {
    ok: false,
    updated: [{ name: 'npm-a', from: '1.0.0', to: '1.0.1' }],
    failed: [{ name: 'file-pkg', output: 'checksum mismatch' }],
    message: '1 of 2 failed',
  }
  const out = renderUpdateReport(merged, opts)
  check('an array of failures renders every entry', out.failed.length === 1)
  check('the failure line names the channel', out.failed[0] === 'file-pkg: checksum mismatch')
  check('no literal "undefined" leaks into the failure line', !out.failed[0].includes('undefined'))
  check('the success line keeps both versions', out.updated[0] === 'npm-a  1.0.0 → 1.0.1')

  // /updates 原样返回时 failed 是单个对象，两种形状都要吃。
  const single = { ok: false, failed: { name: 'x', output: 'boom' } }
  check('a single failed object renders too', renderUpdateReport(single, opts).failed[0] === 'x: boom')

  // extras 的结果只有 name + to，没有 from。写死 item.from 会渲染成 "b undefined → 3.0.0"。
  const noFrom = { ok: true, updated: [{ name: 'b', to: '3.0.0' }] }
  const noFromLine = renderUpdateReport(noFrom, opts).updated[0]
  check('a missing from does not print undefined', !noFromLine.includes('undefined'))
  check('a missing from omits the arrow', noFromLine === 'b  → 3.0.0')

  // 名都没有的条目也不能变成 "undefined: "。
  check(
    'a nameless failure still renders readably',
    renderUpdateReport({ ok: false, failed: [{ output: 'x' }] }, opts).failed[0] === 'unknown: x',
  )
  check('an empty report renders nothing', renderUpdateReport(null, opts).failed.length === 0)
  check('garbage entries are skipped', renderUpdateReport({ updated: [null, 5] }, opts).updated.length === 0)

  // 渲染端必须真的用这个函数，而不是又退回手写模板。
  check('the panel renders through renderUpdateReport', /renderUpdateReport\(updateLog/.test(client))
  check('the old single-object assumption is gone', !client.includes('String(updateLog.failed.name)'))
}

console.log('github pin resolution')
{
  // installedCommit 读不出 commit 时，github 行只能保守地判「无更新」——
  // 于是那一行永远不进更新列表，repull 一次都跑不到。pnpm 写 lockfile 的
  // 形状不止一种，解析器必须都认。这里用临时目录跑真实文件。
  //
  // 注意：不能复用上面那个花括号配平的 extract()——这个函数体内有正则字面量，
  // 里面的 {7,40} 会把配平算错，切出一个 66KB 的怪物。
  const { mkdtempSync, writeFileSync, rmSync, readFileSync: readFile } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'rack-lock-'))
  const indexSource = readFile(join(root, 'index.js'), 'utf8').replace(/\r\n/g, '\n')
  const begin = indexSource.indexOf('function installedCommit(')
  const finish = indexSource.indexOf('\n}\n', indexSource.indexOf('const patterns = [', begin))
  const installedCommit = new Function(
    'readFileSync',
    'join',
    indexSource.slice(begin, finish + 2) + '\nreturn installedCommit',
  )((p, enc) => readFile(p, enc), join)
  const SHA = '0123456789abcdef0123456789abcdef01234567'

  const cases = [
    [
      'codeload tarball form',
      'dsh-our-free-model',
      `  dsh-our-free-model@https://codeload.github.com/Ebony-Vinyl/dsh-our-free-model/tar.gz/${SHA}:\n    resolution: {tarball: https://codeload.github.com/x/y/tar.gz/${SHA}}\n`,
    ],
    [
      'github: spec with #',
      'pkg-a',
      `  'pkg-a@github:owner/repo#${SHA}':\n    resolution: {tarball: https://codeload.github.com/owner/repo/tar.gz/${SHA}}\n`,
    ],
    [
      'resolved block with commit',
      'pkg-a',
      `  pkg-a@github:owner/repo:\n    resolution: {commit: ${SHA}, repo: owner/repo, type: git}\n`,
    ],
  ]

  for (const [label, pkg, text] of cases) {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), text, 'utf8')
    check('reads the pin from ' + label, installedCommit(dir, pkg) === SHA, String(installedCommit(dir, pkg)))
  }

  // 不能把别的包的 commit 当成这个包的。
  writeFileSync(
    join(dir, 'pnpm-lock.yaml'),
    `  other-pkg@github:someone/else:\n    resolution: {commit: ${SHA}, type: git}\n`,
    'utf8',
  )
  check(
    'does not borrow another package commit',
    installedCommit(dir, 'pkg-a') === null,
    String(installedCommit(dir, 'pkg-a')),
  )

  // 没有 lockfile 时返回 null，不抛。
  rmSync(join(dir, 'pnpm-lock.yaml'))
  check('a missing lockfile returns null', installedCommit(dir, 'pkg-a') === null)
  rmSync(dir, { recursive: true, force: true })
}

console.log('write gate')
{
  // A POST that carries no browser provenance must be refused unless the caller
  // opts in explicitly. This is the only thing standing between "any local
  // script" and "uninstall every plugin".
  check(
    'explicit opt-in header is honoured',
    source.includes("String(req.headers['x-dsh-plugin-dashboard'] ?? '') === '1'"),
  )
  check('same-site fetch is honoured', source.includes("secFetchSite === 'same-origin'"))
  check('a bare curl without provenance is refused', source.includes('write requests need an Origin header'))
  const client = readFileSync(join(root, 'client.js'), 'utf8')
  check('the panel sends the opt-in header itself', client.includes("'x-dsh-plugin-dashboard': '1'"))
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
