// A batch update must degrade, not die as a whole.
//
// `pnpm add a b c` is all-or-nothing: one bad package and every package in the
// batch keeps its old version, while the only thing the user sees is "8 packages
// failed". These tests drive the retry loop with an injected `install` function
// (no pnpm, no network) and pin down three promises:
//   - a blamed package is the only one reported as failed, the rest still go in,
//   - when the output blames nobody, each suspect is probed on its own,
//   - nothing is ever reported as both installed and failed, and a spent budget
//     stops the loop instead of looping forever.
//
// Run with: node test/batch-fallback.mjs
import { blamePackages, installWithFallback } from '../index.js'

let failures = 0
function check(ok, label) {
  if (ok) console.log('ok   ' + label)
  else {
    failures += 1
    console.error('FAIL ' + label)
  }
}

const item = (name, latest) => ({ name, current: '0.0.1', latest })

/* ------------------------------- blamePackages ------------------------------- */

const fetch404 = `
Progress: resolved 12, reused 0, downloaded 0
 ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/pkg-b: Not Found - 404

This error happened while installing the dependencies of pkg-b@2.0.0
`
check(blamePackages(fetch404, [item('pkg-a', '2'), item('pkg-b', '2')]).join() === 'pkg-b', 'a 404 line blames the package it names')
check(blamePackages(fetch404, [item('pkg-a', '2')]).length === 0, 'a package the error does not mention is not blamed')

const noMatch = ' ERR_PNPM_NO_MATCHING_VERSION  No matching version found for pkg-c@9.9.9'
check(blamePackages(noMatch, [item('pkg-c', '9.9.9')]).join() === 'pkg-c', 'a missing version blames its package')

const peer = `
 ERR_PNPM_PEER_DEP_ISSUES  Unmet peer dependencies
 pkg-d is not in the npm registry
`
check(blamePackages(peer, [item('pkg-d', '1')]).join() === 'pkg-d', 'a peer/registry complaint blames its package')

const progressOnly = 'Progress: resolved 30, reused 30, pkg-a already up to date'
check(blamePackages(progressOnly, [item('pkg-a', '1')]).length === 0, 'a progress line blames nobody')

const scoped = ' ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@scope%2fpkg: Not Found - 404'
check(blamePackages(scoped, [item('@scope/pkg', '1')]).join() === '@scope/pkg', 'a percent-encoded scoped name is recognised')

const decoy = `
Progress: resolved 40, downloaded pkg-e
Progress: resolved 41
Progress: resolved 42
Progress: resolved 43
 ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/other: Not Found - 404
`
check(blamePackages(decoy, [item('pkg-e', '1')]).length === 0, 'a name far from the error line is not blamed')

/* ----------------------------- installWithFallback ---------------------------- */

/** A fake pnpm: fails when the batch touches a name in `bad`, blaming it. */
function fakePnpm({ bad = [], blame = true, onCall = () => {} } = {}) {
  const calls = []
  const install = async (batch, timeoutMs) => {
    calls.push({ names: batch.map(one => one.name), timeoutMs })
    onCall(batch)
    const broken = batch.filter(one => bad.includes(one.name))
    if (broken.length === 0) return { code: 0, output: 'ok' }
    const names = broken.map(one => one.name).join(', ')
    return {
      code: 1,
      output: blame
        ? ` ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/${broken[0].name}: Not Found - 404 (${names})`
        : ' ERR_PNPM_UNEXPECTED_STORE  Unexpected store situation',
    }
  }
  return { install, calls }
}

// 1. One bad package out of three: peel it off, install the other two.
{
  const { install, calls } = fakePnpm({ bad: ['pkg-b'] })
  const result = await installWithFallback({
    items: [item('pkg-a', '2'), item('pkg-b', '2'), item('pkg-c', '2')],
    install,
  })
  check(result.installed.map(one => one.name).join() === 'pkg-a,pkg-c', 'the healthy packages still install')
  check(result.failed.map(one => one.name).join() === 'pkg-b', 'only the blamed package is reported failed')
  check(result.failed[0].output.includes('ERR_PNPM_FETCH_404'), 'the failure keeps pnpm output for the detail view')
  check(calls.length === 2, 'a blamed retry costs exactly one more pnpm run')
  check(calls[1].names.join() === 'pkg-a,pkg-c', 'the retry carries only the remaining packages')
  check(result.cancelled === false, 'a completed run is not marked cancelled')
}

// 2. Nothing blamed: probe each suspect alone.
{
  const { install, calls } = fakePnpm({ bad: ['pkg-y'], blame: false })
  const result = await installWithFallback({
    items: [item('pkg-x', '2'), item('pkg-y', '2'), item('pkg-z', '2')],
    install,
  })
  check(result.installed.map(one => one.name).join() === 'pkg-x,pkg-z', 'probing isolates the single bad package')
  check(result.failed.map(one => one.name).join() === 'pkg-y', 'probing blames exactly one package')
  check(calls.length === 4, 'probing is one batch run plus one run per suspect')
}

// 3. Everything fails.
{
  const { install } = fakePnpm({ bad: ['pkg-a', 'pkg-b'] })
  const result = await installWithFallback({ items: [item('pkg-a', '2'), item('pkg-b', '2')], install })
  check(result.installed.length === 0, 'nothing is reported installed when the batch never succeeds')
  check(result.failed.length === 2, 'every uninstalled package is reported')
}

// 4. A single package that fails.
{
  const { install, calls } = fakePnpm({ bad: ['pkg-a'] })
  const result = await installWithFallback({ items: [item('pkg-a', '2')], install })
  check(result.installed.length === 0 && result.failed.length === 1, 'a lone failure is reported as one failure')
  check(calls.length === 1, 'a lone failure does not re-run pnpm')
}

// 5. Cancel before anything starts.
{
  const { install, calls } = fakePnpm()
  const result = await installWithFallback({
    items: [item('pkg-a', '2')],
    install,
    cancelled: () => true,
  })
  check(result.cancelled === true, 'a cancelled loop reports cancelled')
  check(calls.length === 0, 'a cancelled loop never runs pnpm')
  check(result.installed.length === 0 && result.failed.length === 0, 'a cancelled loop invents no result')
}

// 6. Cancel after a retry has already installed something.
{
  // No blame line, so the loop falls through to probing; the cancel lands after
  // the first probe succeeded. What was installed must stay installed.
  const { install } = fakePnpm({ bad: ['pkg-b'], blame: false })
  let started = 0
  const result = await installWithFallback({
    items: [item('pkg-a', '2'), item('pkg-b', '2'), item('pkg-c', '2')],
    install,
    cancelled: () => {
      started += 1
      return started > 3
    },
  })
  check(result.cancelled === true, 'cancelling mid-flight is reported')
  check(result.installed.length === 1, 'what was already installed is kept, not discarded')
}

// 7. Too many suspects to probe: stop and report rather than storm pnpm.
{
  const { install, calls } = fakePnpm({ bad: ['pkg-1'], blame: false })
  const many = Array.from({ length: 10 }, (unused, index) => item(`pkg-${index + 1}`, '2'))
  const result = await installWithFallback({ items: many, install, probes: 3 })
  check(calls.length === 1, 'more suspects than the probe limit stops after one run')
  check(result.failed.length === many.length, 'every package left behind is reported')
}

// 8. The round cap holds even when every round blames someone.
{
  const { install, calls } = fakePnpm({ bad: ['pkg-a', 'pkg-b', 'pkg-c', 'pkg-d', 'pkg-e', 'pkg-f'] })
  const result = await installWithFallback({
    items: ['a', 'b', 'c', 'd', 'e', 'f'].map(name => item(`pkg-${name}`, '2')),
    install,
    rounds: 2,
  })
  check(calls.length <= 2, 'the round cap bounds the number of pnpm runs')
  check(result.installed.length + result.failed.length === 6, 'every package ends up on exactly one side')
}

// 9. No package is reported on both sides.
{
  const { install } = fakePnpm({ bad: ['pkg-b'] })
  const result = await installWithFallback({
    items: [item('pkg-a', '2'), item('pkg-b', '2')],
    install,
  })
  const names = new Set(result.installed.map(one => one.name))
  check(!result.failed.some(one => names.has(one.name)), 'installed and failed never overlap')
}

// 10. Each round announces the packages it is handing to pnpm.
{
  const { install } = fakePnpm({ bad: ['pkg-b'] });
  const rounds = [];
  await installWithFallback({
    items: [item('pkg-a', '2'), item('pkg-b', '2'), item('pkg-c', '2')],
    install,
    onRound: names => rounds.push(names.slice()),
  });
  check(rounds.length === 2, 'each pnpm run announces its batch'),
  check(rounds[0].join() === 'pkg-a,pkg-b,pkg-c', 'the first round names the whole batch'),
  check(rounds[1].join() === 'pkg-a,pkg-c', 'the retry names only what is left');
}

// 11. Every call carries a usable timeout.
{
  const { install, calls } = fakePnpm({ bad: ['pkg-b'] })
  await installWithFallback({
    items: [item('pkg-a', '2'), item('pkg-b', '2')],
    install,
    budgetMs: 60_000,
  })
  check(calls.every(call => Number.isFinite(call.timeoutMs) && call.timeoutMs > 0), 'pnpm is always given a positive timeout')
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('\nBATCH_FALLBACK_OK')
