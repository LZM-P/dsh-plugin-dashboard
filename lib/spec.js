/**
 * Version specs, parsed and compared — the whole of what this plugin needs to
 * understand about semver.
 *
 * These functions are pure and have no imports, so they can be unit-tested
 * directly and type-checked without pulling the host into scope. Everything
 * that decides "is there an update" goes through here, which is why they are
 * the only part of the plugin covered by `tsc --checkJs`.
 *
 * The supported spec shapes are deliberately few. This panel edits
 * `package.json` through `pnpm add`, so it only needs to know whether a
 * registry version is inside the range the user already wrote, and whether the
 * range is one it is allowed to touch at all. Anything else — `link:`,
 * `file:`, `github:`, a tarball URL, an unusual comparator set — is reported as
 * `unsupported`, which is the signal to route it through the "其他安装方式"
 * path instead of the version updater.
 */

/** A registry version: 1.2.3, optionally with a prerelease suffix. */
export const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * @typedef {'exact' | 'caret' | 'tilde' | 'gte' | 'any' | 'unsupported'} SpecKind
 *
 * @typedef {object} ParsedSpec
 * @property {SpecKind} kind   how the range is written
 * @property {string | null} floor  the lowest version the spec allows, zeros filled in
 * @property {number} parts  how many components the user actually wrote (1, 2 or 3)
 *
 * @typedef {object} VersionParts
 * @property {number[]} numbers  always three entries
 * @property {string[] | null} pre  prerelease identifiers, or null for a release
 */

/**
 * Split a version into its numeric core and prerelease identifiers.
 *
 * @param {string} value
 * @returns {VersionParts | null}
 */
export function versionParts(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^v/, '')
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(trimmed)
  if (match === null) return null
  const pre = match[4] === undefined ? null : match[4].split('.')
  return { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], pre }
}

/**
 * Semver ordering, prerelease rules included: 1.0.0-rc.1 < 1.0.0, and a
 * numeric prerelease identifier sorts below an alphanumeric one.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} -1, 0 or 1
 */
export function compareVersions(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  if (a === null || b === null) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1
  }
  if (a.pre === null && b.pre === null) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  const length = Math.max(a.pre.length, b.pre.length)
  for (let index = 0; index < length; index += 1) {
    const x = a.pre[index]
    const y = b.pre[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
      continue
    }
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/**
 * Expand a partially written version to three components.
 *
 * @param {string} value  `1`, `1.2` or `1.2.3`
 * @returns {{floor: string | null, parts: number}}
 */
function expand(value) {
  const trimmed = value.trim().replace(/^v/, '')
  const core = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(-[0-9A-Za-z.-]+)?$/.exec(trimmed)
  if (core === null) return { floor: null, parts: 0 }
  const parts = core[3] !== undefined ? 3 : core[2] !== undefined ? 2 : 1
  const floor = `${Number(core[1])}.${core[2] === undefined ? 0 : Number(core[2])}.${core[3] === undefined ? 0 : Number(core[3])}${core[4] === undefined ? '' : core[4]}`
  return { floor, parts }
}

/**
 * Classify a dependency spec.
 *
 * @param {string} spec  the raw value from package.json
 * @returns {ParsedSpec}
 */
export function parseSpec(spec) {
  const raw = typeof spec === 'string' ? spec.trim() : ''
  if (raw === '' || raw === '*' || raw === 'x' || raw === 'X' || raw === 'latest') {
    return { kind: 'any', floor: null, parts: 0 }
  }
  if (EXACT_VERSION.test(raw)) return { kind: 'exact', floor: raw, parts: 3 }
  if (raw.startsWith('^')) {
    const expanded = expand(raw.slice(1))
    return expanded.floor === null
      ? { kind: 'unsupported', floor: null, parts: 0 }
      : { kind: 'caret', floor: expanded.floor, parts: expanded.parts }
  }
  if (raw.startsWith('~')) {
    const expanded = expand(raw.slice(1))
    return expanded.floor === null
      ? { kind: 'unsupported', floor: null, parts: 0 }
      : { kind: 'tilde', floor: expanded.floor, parts: expanded.parts }
  }
  if (raw.startsWith('>=')) {
    const expanded = expand(raw.slice(2))
    return expanded.floor === null
      ? { kind: 'unsupported', floor: null, parts: 0 }
      : { kind: 'gte', floor: expanded.floor, parts: expanded.parts }
  }
  return { kind: 'unsupported', floor: null, parts: 0 }
}

/**
 * The first version outside a caret or tilde range.
 *
 * @param {ParsedSpec} parsed
 * @returns {number[] | null}
 */
function ceilingOf(parsed) {
  if (parsed.floor === null) return null
  const parts = versionParts(parsed.floor)
  if (parts === null) return null
  const [major, minor, patch] = parts.numbers
  if (parsed.kind === 'caret') {
    // ^0.2.3 means "0.2.x and up", not "0.x" — the zero-major rule.
    if (major > 0) return [major + 1, 0, 0]
    if (minor > 0) return [0, minor + 1, 0]
    return [0, 0, patch + 1]
  }
  if (parsed.kind === 'tilde') {
    // ~1.2.3 and ~1.2 both stay inside 1.2; only a bare ~1 widens to 2.0.0.
    if (parsed.parts === 1) return [major + 1, 0, 0]
    return [major, minor + 1, 0]
  }
  return null
}

/**
 * Is `version` allowed by `spec`?
 *
 * Prereleases are only allowed when the spec itself asks for one. npm's
 * `latest` dist-tag is a release, so this mostly keeps `^1.2.3` from quietly
 * accepting `2.0.0-rc.1` just because it sorts above the floor.
 *
 * @param {string} version
 * @param {string} spec  the raw spec, parsed here
 * @returns {boolean}
 */
export function satisfiesSpec(version, spec) {
  const parsed = parseSpec(spec)
  if (parsed.kind === 'any') return true
  if (parsed.kind === 'unsupported' || parsed.floor === null) return false
  if (compareVersions(version, parsed.floor) < 0) return false
  const target = versionParts(version)
  const floor = versionParts(parsed.floor)
  if (target === null || floor === null) return false
  if (target.pre !== null && floor.pre === null) return false
  // An exact pin is a single version, not a floor: 1.2.4 does not satisfy 1.2.3.
  if (parsed.kind === 'exact') return compareVersions(version, parsed.floor) === 0
  if (parsed.kind === 'gte') return true
  const ceiling = ceilingOf(parsed)
  if (ceiling === null) return false
  for (let index = 0; index < 3; index += 1) {
    if (target.numbers[index] !== ceiling[index]) return target.numbers[index] < ceiling[index]
  }
  // Reaching the ceiling exactly means the prerelease of the next range.
  return false
}

/**
 * A spec this plugin's version updater may rewrite.
 *
 * @param {string} spec
 * @returns {boolean}
 */
export function isVersionSpec(spec) {
  return parseSpec(spec).kind !== 'unsupported'
}
