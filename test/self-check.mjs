#!/usr/bin/env node
// Self-check for the plugin source. Run it before publishing:
//
//   node test/self-check.mjs
//
// It verifies the things that silently break the panel: a translation key that
// exists in one language only, a route that the header comment does not list,
// a hook placed after an early return (that crashes the whole panel), and
// leftover debugging output.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (name) => readFileSync(join(root, name), 'utf8')

const failures = []
const check = (label, ok, detail) => {
  if (ok) {
    console.log('  ok   ' + label)
  } else {
    console.log('  FAIL ' + label + (detail === undefined ? '' : ' — ' + detail))
    failures.push(label)
  }
}

const client = read('client.js')
const index = read('index.js')

console.log('i18n')
{
  const start = client.indexOf('const DICT = {')
  if (start < 0) {
    check('DICT found', false)
  } else {
    const open = client.indexOf('{', start)
    // The table ends at the line that closes the DICT assignment.
    const end = client.indexOf('\n    };', open)
    const literal = client.slice(open, end + 6)
    let table = null
    try {
      table = eval('(' + literal + ')')
    } catch (error) {
      table = null
      check('DICT parses', false, error instanceof Error ? error.message : String(error))
    }
    if (table !== null) {
      const en = Object.keys(table.en ?? {})
      const zh = Object.keys(table.zh ?? {})
      const onlyEn = en.filter((key) => !(key in (table.zh ?? {})))
      const onlyZh = zh.filter((key) => !(key in (table.en ?? {})))
      check('en/zh have the same key set', onlyEn.length === 0 && onlyZh.length === 0, 'en-only: ' + onlyEn.join(',') + ' zh-only: ' + onlyZh.join(','))
      const used = new Set()
      for (const match of client.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) used.add(match[1])
      const missing = [...used].filter((key) => !(key in (table.en ?? {})))
      check('every t(\'…\') key exists in the dictionary', missing.length === 0, missing.join(','))
      console.log('  (' + en.length + ' keys per language, ' + used.size + ' referenced)')
    }
  }
}

console.log('routes')
{
  const table = index.match(/const ROUTES = \{([\s\S]*?)\n\s*\}/)
  const routes = new Set()
  if (table !== null) {
    for (const match of table[1].matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)) {
      for (const verb of match[2].split(',').map((item) => item.trim().replace(/'/g, ''))) {
        routes.add(verb + ' ' + match[1])
      }
    }
  }
  check('ROUTES table parsed', routes.size > 0, String(routes.size))
  // The header comment lists the routes as "GET  /api/dsh-plugin-dashboard/<path>".
  const header = index.slice(0, index.indexOf('*/'))
  const documented = new Set()
  for (const match of header.matchAll(/\b(GET|POST)\s+\/api\/dsh-plugin-dashboard\/([a-z]*)/g)) {
    documented.add(match[1].toUpperCase() + ' /' + match[2])
  }
  const missing = [...routes].filter((route) => !documented.has(route))
  check('header comment lists every route', missing.length === 0, missing.join(', '))
  console.log('  (' + routes.size + ' routes, ' + documented.size + ' documented)')
}

console.log('react hook order')
{
  // The panel returns early while data is still loading. A hook below that
  // return makes the hook count differ between renders and React tears the
  // whole panel down, so nothing may be declared after the early returns.
  const lines = client.split(/\r?\n/)
  let earlyReturn = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/if \((error|data) === null\) \{/.test(lines[i]) || /if \(error !== null\) \{/.test(lines[i])) {
      earlyReturn = i
      break
    }
  }
  check('early return located', earlyReturn >= 0)
  const offenders = []
  for (let i = earlyReturn + 1; i < lines.length; i += 1) {
    if (/React\.use[A-Za-z]+\(/.test(lines[i])) offenders.push(i + 1 + ': ' + lines[i].trim())
  }
  check('no hook after the early return', offenders.length === 0, offenders.join(' | '))
}

console.log('leftovers')
{
  for (const [name, source] of [['client.js', client], ['index.js', index]]) {
    const debug = source.match(/\bconsole\.(log|debug|trace)\(|\bdebugger\b|\bTODO\b|\bFIXME\b/)
    check(name + ' has no debugging leftovers', debug === null, debug === null ? undefined : debug[0])
  }
  check('client does not use a native confirm dialog', !/window\.confirm/.test(client))
  check('the panel does not offer a route that the Host removed', !/['"]\/probe['"]/.test(client))
}

console.log()
if (failures.length === 0) {
  console.log('SELF_CHECK_OK')
} else {
  console.log('SELF_CHECK_FAILED: ' + failures.length + ' problem(s)')
  process.exitCode = 1
}
