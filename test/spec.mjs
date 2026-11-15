// The range arithmetic behind "is this update safe to apply".
//
// A range is not "anything at or above the floor": ^0.2.3 stops at 0.3.0,
// ~1.2.3 stops at 1.3.0, and an exact pin is one version rather than a floor.
// Getting that wrong silently upgrades a plugin past the range its author
// declared, which is exactly what the update button must not do.
//
// Run with: node test/spec.mjs
import { readFileSync } from 'node:fs'
import { EXACT_VERSION, compareVersions, isVersionSpec, parseSpec, satisfiesSpec } from '../lib/spec.js'

let failures = 0

function check(ok, label) {
  if (ok) console.log('ok   ' + label)
  else {
    failures += 1
    console.error('FAIL ' + label)
  }
}

function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  check(ok, ok ? label : label + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected))
}

// ---------------------------------------------------------------------------
// parseSpec: which kind of spec is this, and where does it start
// ---------------------------------------------------------------------------
eq(parseSpec('1.2.3').kind, 'exact', 'a bare version is an exact pin')
eq(parseSpec('1.2.3').floor, '1.2.3', 'the floor of an exact pin is that version')
eq(parseSpec('^1.2.3').kind, 'caret', '^ is a caret range')
eq(parseSpec('~1.2.3').kind, 'tilde', '~ is a tilde range')
eq(parseSpec('>=1.2.3').kind, 'gte', '>= is an open floor')
eq(parseSpec('1.2.3').parts, 3, 'a full version has three parts')
eq(parseSpec('~1.2').floor, '1.2.0', 'a two-part range is padded to a full version')
eq(parseSpec('*').kind, 'any', '* accepts anything')
eq(parseSpec('latest').kind, 'any', 'a dist-tag is treated as "any"')
eq(parseSpec('').kind, 'any', 'an empty spec is "any"')
eq(parseSpec('link:../local').kind, 'unsupported', 'a local link is not comparable')
eq(parseSpec('file:./x.tgz').kind, 'unsupported', 'a local tarball is not comparable')
eq(parseSpec('github:a/b').kind, 'unsupported', 'a github shorthand is not comparable')
eq(parseSpec('npm:other@^1.0.0').kind, 'unsupported', 'an npm: alias is not evaluated here')

// ---------------------------------------------------------------------------
// compareVersions: numeric, not lexical ("1.10.0" > "1.9.0")
// ---------------------------------------------------------------------------
eq(compareVersions('1.9.0', '1.10.0'), -1, '1.9.0 sorts before 1.10.0, not after')
eq(compareVersions('1.2.3', '1.2.3'), 0, 'equal versions compare equal')
eq(compareVersions('2.0.0', '1.99.99'), 1, 'a major bump wins')
eq(compareVersions('1.2.3-rc.1', '1.2.3'), -1, 'a prerelease sorts before its release')

// ---------------------------------------------------------------------------
// satisfiesSpec: the real decision the update button makes
// ---------------------------------------------------------------------------
const cases = [
  ['1.2.3', '1.2.3', true, 'an exact pin matches itself'],
  ['1.2.4', '1.2.3', false, 'an exact pin does not accept a newer patch'],
  ['1.9.0', '^1.2.3', true, '^1.2.3 accepts 1.9.0'],
  ['2.0.0', '^1.2.3', false, '^1.2.3 rejects a major bump'],
  ['0.2.9', '^0.2.3', true, '^0.2.3 accepts the last 0.2.x'],
  ['0.3.0', '^0.2.3', false, '^0.2.3 stops at 0.3.0 (0.x is minor-locked)'],
  ['1.2.9', '~1.2.3', true, '~1.2.3 accepts the last 1.2.x'],
  ['1.3.0', '~1.2.3', false, '~1.2.3 stops at 1.3.0'],
  ['1.2.9', '~1.2', true, '~1.2 behaves like ~1.2.0'],
  ['1.3.0', '~1.2', false, '~1.2 stops at 1.3.0'],
  ['2.0.0', '>=2.0.0', true, '>=2.0.0 accepts its floor'],
  ['1.9.9', '>=2.0.0', false, '>=2.0.0 rejects anything below the floor'],
  ['9.9.9', '*', true, '"any" accepts everything'],
  ['2.0.0', '2.0.1-rc.1', false, 'a prerelease floor is above the final release'],
  ['2.0.1-rc.1', '^2.0.0', false, 'a prerelease is not accepted by a plain range'],
  ['2.0.1-rc.2', '2.0.1-rc.1', false, 'exact prerelease pins stay exact'],
]
for (const [version, spec, want, label] of cases) {
  eq(satisfiesSpec(version, spec), want, label)
}

// ---------------------------------------------------------------------------
// isVersionSpec: the gate that decides what lands in the npm update list
// ---------------------------------------------------------------------------
check(isVersionSpec('1.2.3'), 'an exact pin is a version spec')
check(isVersionSpec('^1.2.3'), 'a caret range is a version spec')
check(!isVersionSpec('link:../local'), 'a link spec is not a version spec')
check(!isVersionSpec('github:a/b'), 'a github spec is not a version spec')
check(EXACT_VERSION.test('1.2.3'), 'EXACT_VERSION still matches a plain version')

// ---------------------------------------------------------------------------
// The module must stay a single source of truth: index.js imports it instead
// of keeping a second copy that can drift.
// ---------------------------------------------------------------------------
const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
check(source.includes("from './lib/spec.js'"), 'index.js imports the range helpers from lib/spec.js')
check(!/function compareVersions\s*\(/.test(source), 'index.js keeps no private compareVersions')
check(!/function versionParts\s*\(/.test(source), 'index.js keeps no private versionParts')
check(/VERSION = /.test(source) && !/VERSION = '0\./.test(source), 'VERSION is not hardcoded to one release')

console.log('')
if (failures === 0) {
  console.log('SPEC_OK')
  process.exit(0)
} else {
  console.error('SPEC_FAIL ' + failures)
  process.exit(1)
}
