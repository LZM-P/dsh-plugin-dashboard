/**
 * Version specs, parsed and compared — the whole of what this plugin needs to
 * understand about semver.
 *
 * These functions are pure and have no imports, so they can be unit-tested
 * directly and type-checked without pulling the host into scope. Everything
 * that decides "is there an update" goes through here, which is why they are
 * the only part of the plugin covered by `tsc --checkJs`.
 *
 * The supported shapes are the ones a `package.json` in the wild actually uses:
 * an exact pin, `^`, `~`, `>=`, `>`, `<`, `<=`, a bare or wildcard prefix
 * (`1`, `1.x`, `1.2`, `1.2.x`), a hyphen range (`1.2.3 - 2.0.0`), and unions of
 * those with `||`. Anything else — `link:`, `file:`, `github:`, a tarball URL,
 * an npm alias — is `unsupported`, which is the signal to route it through the
 * "其他安装方式" path instead of the version updater.
 */

/** A registry version: 1.2.3, optionally with a prerelease suffix. */
export const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * @typedef {'exact' | 'caret' | 'tilde' | 'xrange' | 'hyphen' | 'gt' | 'gte' | 'lt' | 'lte' | 'any' | 'union' | 'unsupported'} SpecKind
 *
 * @typedef {object} ParsedSpec
 * @property {SpecKind} kind   how the range is written
 * @property {string | null} floor  the lowest version the spec allows, zeros filled in
 * @property {number} parts  how many components the user actually wrote (1, 2 or 3)
 * @property {string | null} [ceiling]  inclusive or exclusive upper version (hyphen, lt, lte)
 * @property {ParsedSpec[]} [ranges]  the alternatives of a union
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
 * `1` counts as one component, `1.2` as two — the count is what tells a caret
 * or tilde range how wide it may go.
 *
 * @param {string} value  `1`, `1.2` or `1.2.3`, with an optional prerelease
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

const UNSUPPORTED = /** @type {const} */ ({ kind: 'unsupported', floor: null, parts: 0 })

/**
 * Classify a dependency spec.
 *
 * @param {string} spec  the raw value from package.json
 * @returns {ParsedSpec}
 */
export function parseSpec(spec) {
  const raw = typeof spec === 'string' ? spec.trim() : ''
  if (raw === '') return { kind: 'any', floor: null, parts: 0 }

  // A union is only a union at the top level: `^1 || ^2` is two full specs.
  if (raw.includes('||')) {
    const ranges = raw
      .split('||')
      .map((part) => parseSpec(part))
      .filter((part) => part.kind !== 'unsupported' && part.kind !== 'any')
    if (ranges.length === 0) return { kind: 'any', floor: null, parts: 0 }
    if (ranges.length === 1) return ranges[0]
    return { kind: 'union', floor: null, parts: 0, ranges }
  }

  // `1.2.3 - 2.0.0`: hyphen ranges need the spaces, otherwise the dash is a
  // prerelease separator (`1.2.3-rc.1`).
  const hyphen = /^(\d[\w.-]*)\s+-\s+(\d[\w.-]*)$/.exec(raw)
  if (hyphen !== null) {
    const from = expand(hyphen[1])
    const to = expand(hyphen[2])
    if (from.floor === null || to.floor === null) return UNSUPPORTED
    return { kind: 'hyphen', floor: from.floor, parts: from.parts, ceiling: to.floor }
  }

  if (raw === '*' || raw === 'x' || raw === 'X' || raw === 'latest') {
    return { kind: 'any', floor: null, parts: 0 }
  }
  if (EXACT_VERSION.test(raw)) return { kind: 'exact', floor: raw, parts: 3 }

  const operators = [
    ['^', 'caret'],
    ['~', 'tilde'],
    ['>=', 'gte'],
    ['>', 'gt'],
    ['<=', 'lte'],
    ['<', 'lt'],
  ]
  for (const [prefix, kind] of operators) {
    if (!raw.startsWith(prefix)) continue
    const expanded = expand(raw.slice(prefix.length))
    if (expanded.floor === null) return UNSUPPORTED
    if (kind === 'lt' || kind === 'lte') {
      // `<=1.2.3` and `<1.2.3` have no floor; the version itself is the bound.
      return { kind: /** @type {SpecKind} */ (kind), floor: null, parts: expanded.parts, ceiling: expanded.floor }
    }
    return { kind: /** @type {SpecKind} */ (kind), floor: expanded.floor, parts: expanded.parts }
  }

  // A bare or wildcard prefix: `1`, `1.x`, `1.2`, `1.2.x`, `1.2.*`.
  const wildcard = /^(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(raw)
  if (wildcard !== null) {
    const major = Number(wildcard[1])
    const minorToken = wildcard[2]
    const patchToken = wildcard[3]
    const minor = minorToken === undefined || !/^\d+$/.test(minorToken) ? null : Number(minorToken)
    const patch = patchToken === undefined || !/^\d+$/.test(patchToken) ? null : Number(patchToken)
    const parts = patch !== null ? 3 : minor !== null ? 2 : 1
    const floor = `${major}.${minor === null ? 0 : minor}.${patch === null ? 0 : patch}`
    return { kind: 'xrange', floor, parts }
  }

  return UNSUPPORTED
}

/**
 * The first version outside a caret, tilde or wildcard range.
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
  if (parsed.kind === 'tilde' || parsed.kind === 'xrange') {
    // ~1.2.3 and ~1.2 both stay inside 1.2; only a bare ~1 (or `1.x`) widens
    // to 2.0.0. `1.2` behaves like `~1.2`, which is what npm does.
    if (parsed.parts === 1) return [major + 1, 0, 0]
    if (parsed.parts === 2) return [major, minor + 1, 0]
    return [major, minor + 1, 0]
  }
  return null
}

/**
 * Is `version` below `ceiling` (exclusive)?
 *
 * @param {VersionParts} target
 * @param {number[]} ceiling
 * @returns {boolean}
 */
function below(target, ceiling) {
  for (let index = 0; index < 3; index += 1) {
    if (target.numbers[index] !== ceiling[index]) return target.numbers[index] < ceiling[index]
  }
  return false
}

/**
 * The shared decision, on an already-parsed spec.
 *
 * @param {string} version
 * @param {ParsedSpec} parsed
 * @returns {boolean}
 */
function satisfiesParsed(version, parsed) {
  if (parsed.kind === 'any') return true
  if (parsed.kind === 'unsupported') return false
  if (parsed.kind === 'union') {
    return (parsed.ranges ?? []).some((one) => satisfiesParsed(version, one))
  }
  if (parsed.kind === 'exact') return parsed.floor !== null && compareVersions(version, parsed.floor) === 0

  const target = versionParts(version)
  if (target === null) return false

  // A prerelease only passes when the spec itself asked for one. Without this,
  // `^1.2.3` would quietly accept `2.0.0-rc.1` just because it sorts above the
  // floor of a different range.
  const floorParts = parsed.floor === null ? null : versionParts(parsed.floor)
  const ceilingParts = parsed.ceiling === undefined || parsed.ceiling === null ? null : versionParts(parsed.ceiling)
  const specHasPrerelease = (floorParts !== null && floorParts.pre !== null) || (ceilingParts !== null && ceilingParts.pre !== null)
  if (target.pre !== null && !specHasPrerelease) return false

  if (parsed.kind === 'lt' || parsed.kind === 'lte') {
    if (ceilingParts === null) return false
    const order = compareVersions(version, parsed.ceiling ?? '')
    return parsed.kind === 'lte' ? order <= 0 : order < 0
  }

  if (parsed.kind === 'hyphen') {
    if (floorParts === null || ceilingParts === null) return false
    return compareVersions(version, parsed.floor ?? '') >= 0 && compareVersions(version, parsed.ceiling ?? '') <= 0
  }

  if (floorParts === null) return false
  const order = compareVersions(version, parsed.floor ?? '')
  if (parsed.kind === 'gte') return order >= 0
  if (parsed.kind === 'gt') return order > 0
  if (order < 0) return false
  const ceiling = ceilingOf(parsed)
  if (ceiling === null) return false
  return below(target, ceiling)
}

/**
 * Is `version` allowed by `spec`?
 *
 * @param {string} version
 * @param {string} spec  the raw spec, parsed here
 * @returns {boolean}
 */
export function satisfiesSpec(version, spec) {
  return satisfiesParsed(version, parseSpec(spec))
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
