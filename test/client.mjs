// The Client half's decisions, without a DOM.
//
// The parts under src/client/ are plain ESM, so the logic that used to hide
// inside JSX — which badge a row gets, which state the update page is in — can
// be called directly. Only the rendering itself stays untested; everything that
// decides what to render is covered here.
//
// Run: node test/client.mjs
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT, fill, translator, pickLocale } from '../src/client/i18n.js'
import {
  failureOutcome,
  sameEnabledMap,
  partitionTargets,
  mergeUpdateReport,
  renderUpdateReport,
  badgeOf,
  updatePageState,
  updatableTotal,
  jobPhaseKey,
} from '../src/client/view.js'
import { CSS } from '../src/client/style.js'

let failures = 0
let checks = 0

/**
 * @param {boolean} condition
 * @param {string} label
 */
function check(condition, label) {
  checks += 1
  if (!condition) {
    failures += 1
    console.error('FAIL ' + label)
  }
}

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} label
 */
function eq(actual, expected, label) {
  check(actual === expected, label + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected))
}

// ── i18n ──────────────────────────────────────────────────────────────────────
const enKeys = Object.keys(DICT.en).sort()
const zhKeys = Object.keys(DICT.zh).sort()
check(enKeys.length > 50, 'the dictionary carries a real panel worth of strings')
eq(enKeys.join(','), zhKeys.join(','), 'both languages define the same keys')
check(enKeys.every((key) => typeof DICT.en[key] === 'string'), 'every English entry is a string')
check(zhKeys.every((key) => typeof DICT.zh[key] === 'string'), 'every Chinese entry is a string')
eq(fill('hello {name}', { name: 'x' }), 'hello x', 'fill substitutes a placeholder')
eq(fill('no placeholders', {}), 'no placeholders', 'fill leaves text alone')
eq(fill('{a} and {b}', { a: 1, b: 2 }), '1 and 2', 'fill substitutes every placeholder')
check(translator('en')('updateNone') === DICT.en.updateNone, 'translator("en") reads the English table')
check(translator('zh')('updateNone') === DICT.zh.updateNone, 'translator("zh") reads the Chinese table')
check(typeof pickLocale === 'function', 'pickLocale is exported')

// ── failure classification ───────────────────────────────────────────────────
const plain = failureOutcome('boom', null, null)
eq(plain.kind, 'err', 'a plain failure is an error')
eq(failureOutcome('timeout', null, null).kind, 'warn', 'a timeout is only a warning')
eq(failureOutcome('timeout', { rows: [] }, { rows: [] }).kind, null, 'a healed timeout says nothing')
eq(failureOutcome('boom', { rows: [] }, { rows: [] }).kind, null, 'a healed failure says nothing')

// ── enabled map comparison ───────────────────────────────────────────────────
const rowsOn = { rows: [{ entryId: 'a', enabled: true }] }
check(sameEnabledMap(rowsOn, { rows: [{ entryId: 'a', enabled: true }] }), 'identical maps are equal')
check(
  !sameEnabledMap(rowsOn, { rows: [{ entryId: 'a', enabled: false }] }),
  'a flipped switch is a change',
)
check(!sameEnabledMap(null, rowsOn), 'a missing map is a change')
check(!sameEnabledMap(rowsOn, undefined), 'a missing map is a change the other way')

// ── update planning ──────────────────────────────────────────────────────────
const planned = partitionTargets(
  ['a', 'b', 'c', 'd'],
  [
    { name: 'b', kind: 'github' },
    { name: 'c', kind: 'tarball' },
    { name: 'd', kind: 'link' },
  ],
)
eq(planned.npm.join(','), 'a', 'npm rows are batched')
eq(planned.extras.length, 2, 'extras are carried separately')
eq(planned.extras[0].action, 'repull', 'a github row is re-pulled')
eq(planned.extras[1].action, 'pin', 'a tarball row is re-pinned')
const report = mergeUpdateReport(
  [
    { ok: true, name: 'a' },
    { ok: false, name: 'b', message: 'nope' },
  ],
  () => 'fallback',
)
eq(report.ok, false, 'any failed channel makes the batch not-ok')
eq(report.failed.length, 1, 'the failed channel is reported')
eq(report.failed[0].name, 'b', 'the failure keeps its name')
const lines = renderUpdateReport(report, {})
check(Array.isArray(lines.failed), 'the report renders failed lines as a list')
eq(lines.failed.length, 1, 'the failed channel has one line')

// ── the row badge ────────────────────────────────────────────────────────────
eq(badgeOf(undefined, undefined).kind, 'none', 'a plain npm row gets no badge')
eq(badgeOf(undefined, 'npm').kind, 'none', 'an npm-sourced row gets no badge')
eq(badgeOf(undefined, 'github').kind, 'src', 'another install source is named')
eq(badgeOf(undefined, 'file').label, 'file', 'the source is the label')
eq(badgeOf({ label: 'v2.0.0', source: 'npm' }, 'npm').kind, 'update', 'an in-range release offers a button')
eq(badgeOf({ label: 'v2.0.0', source: 'npm' }, 'npm').label, 'v2.0.0', 'the button names the release')
const oob = badgeOf({ label: 'v3.0.0', outOfRange: true, spec: '^1.0.0' }, 'npm')
eq(oob.kind, 'outOfRange', 'an out-of-range release is not a button')
eq(oob.spec, '^1.0.0', 'the warning keeps the spec the user wrote')

// ── the update page state ────────────────────────────────────────────────────
eq(updatePageState(null, false).kind, 'idle', 'before any check the page is idle')
eq(updatePageState(null, true).kind, 'checking', 'while checking the page says so')
eq(updatePageState({ ok: false, message: 'nope' }, false).identifier, undefined, 'an error state carries no id')
eq(updatePageState({ ok: false, message: 'nope' }, false).message, 'nope', 'an error keeps its message')
eq(updatePageState({ ok: true, rows: [] }, false).kind, 'none', 'no rows means nothing to do')
eq(
  updatePageState({ ok: true, rows: [{ hasUpdate: false, outOfRange: false }] }, false).kind,
  'none',
  'rows without updates mean nothing to do',
)
const oobOnly = updatePageState({ ok: true, rows: [{ hasUpdate: false, outOfRange: true }] }, false)
eq(oobOnly.kind, 'list', 'out-of-range releases alone still render a list')
eq(oobOnly.outOfRange.length, 1, 'the out-of-range row is kept')
eq(oobOnly.updatable.length, 0, 'no row claims to be updatable')
const mixed = updatePageState(
  { ok: true, rows: [{ hasUpdate: true }, { hasUpdate: false, outOfRange: true }] },
  false,
)
eq(mixed.updatable.length, 1, 'an updatable row is separated')
eq(mixed.outOfRange.length, 1, 'an out-of-range row is separated')

// ── styles ───────────────────────────────────────────────────────────────────
check(CSS.includes('.pd-row-failed'), 'the failed-row style exists')
check(CSS.includes('.pd-dot-status'), 'the status dot style exists')
check(CSS.includes('.pd-row-uninstall'), 'the uninstall control style exists')
check(CSS.includes('.pd-src-warn'), 'the out-of-range tag style exists')
check(CSS.includes('.pd-update-row-busy'), 'a row the host is updating has its own style')
check(CSS.includes('.pd-update-busy'), 'the per-row spinner is styled')
check(CSS.includes('.pd-spin-live'), 'the row actually being installed has its own spinner colour')
check(CSS.includes('.pd-skel-row'), 'the first load shows a skeleton, not three dots')
check(CSS.includes('.pd-skel-bar'), 'the skeleton rows carry placeholder bars')
{
  const panel = readFileSync(join('src','client','panel.js'), 'utf8')
  check(panel.includes('pd-skel'), 'the loading branch renders the skeleton')
  check(!panel.includes("className: 'pd-empty' }, '...'"), 'the bare ellipsis is gone')
}
{
  const panel = readFileSync(join('src','client','panel.js'), 'utf8')
  check(panel.includes('job.installing'), 'the update badge follows the current round')
}
check(CSS.includes('.pd-tag-warn'), 'the switched-off tag reuses the warn tag style')
{
  for (const [locale, dict] of Object.entries(DICT)) {
    for (const key of ['offlineTag', 'offlineHint']) {
      check(typeof dict[key] === 'string' && dict[key].length > 0, locale + ' names ' + key)
    }
  }
  const panel = readFileSync(join('src', 'client', 'panel.js'), 'utf8')
  check(panel.includes("row.composed === false"), 'the panel renders uncomposed bundles as ordinary rows')
}

// ── the update badge counts both channels ────────────────────────────────────
{
  const npm = { rows: [{ name: 'a', hasUpdate: true }, { name: 'b', hasUpdate: false }, { name: 'c', hasUpdate: true }] }
  const extras = { rows: [{ name: 'd', hasUpdate: true }, { name: 'e', hasUpdate: false }] }
  eq(updatableTotal(npm, extras), 3, 'the badge adds npm and github/tarball updates together')
  eq(updatableTotal(npm, null), 2, 'a failed extras request still counts the npm rows')
  eq(updatableTotal(null, extras), 1, 'extras alone still produce a count')
  eq(updatableTotal(null, null), 0, 'nothing loaded counts nothing')
  eq(updatableTotal({ rows: [] }, { rows: [] }), 0, 'empty answers count nothing')
  const panel = readFileSync(join('src', 'client', 'panel.js'), 'utf8')
  check(panel.includes('updatableTotal(updates, extras)'), 'the badge uses the merged count, not updates.updates')
}

// ── the banner names the phase the host is in ───────────────────────────────
{
  eq(jobPhaseKey('start'), 'jobPhaseWait', 'waiting for idle sessions is named')
  eq(jobPhaseKey('download'), 'jobPhaseDownload', 'downloading is named')
  eq(jobPhaseKey('install'), 'jobPhaseInstall', 'installing is named')
  eq(jobPhaseKey('rollback'), 'jobRollingBack', 'a rollback keeps its warning wording')
  eq(jobPhaseKey(null), null, 'a settled job has no phase')
  eq(jobPhaseKey(undefined), null, 'an unknown phase adds nothing')
  for (const [locale, dict] of Object.entries(DICT)) {
    for (const key of ['jobPhaseWait', 'jobPhaseDownload', 'jobPhaseInstall', 'rowUpdating']) {
      check(typeof dict[key] === 'string' && dict[key].length > 0, locale + ' names ' + key)
    }
  }
}

// ── the generated file is in sync with its parts ─────────────────────────────
const build = spawnSync(process.execPath, ['scripts/build-client.mjs', '--check'], { encoding: 'utf8' })
eq(build.status, 0, 'client.js matches src/client/*.js (run node scripts/build-client.mjs)')

if (failures > 0) {
  console.error('CLIENT_FAIL ' + failures + '/' + checks)
  process.exit(1)
}
console.log('CLIENT_OK ' + checks)
