// Publish without ever putting a token in a file.
//
// `npm publish` reads the auth token from the npm config, which means the usual
// advice is "put it in .npmrc" — and then a token ends up in a working copy that
// someone eventually commits. This script takes NPM_TOKEN from the environment,
// hands it to npm through a child-process-only config var, and refuses to run if
// the version is already on the registry.
//
//   NPM_TOKEN=npm_xxx node scripts/publish.mjs [--dry-run]
//
// A granular token with "Bypass 2FA" is required for a non-interactive publish.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const REGISTRY = 'https://registry.npmjs.org'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const dryRun = process.argv.includes('--dry-run')

const token = (process.env.NPM_TOKEN || '').trim()
if (token === '' && !dryRun) {
  console.error('NPM_TOKEN is not set. Create a granular token with "Read and write" + "Bypass 2FA".')
  process.exit(1)
}

async function publishedVersions() {
  const res = await fetch(REGISTRY + '/' + encodeURIComponent(pkg.name), {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error('registry answered ' + res.status)
  const body = await res.json()
  return Object.keys(body.versions || {})
}

const versions = await publishedVersions()
if (versions.includes(pkg.version)) {
  console.error(pkg.name + '@' + pkg.version + ' is already published — bump the version first.')
  process.exit(1)
}

console.log('publishing ' + pkg.name + '@' + pkg.version + (dryRun ? ' (dry run)' : ''))

// --ignore-scripts: a lifecycle script named 'publish' in package.json would
// otherwise run this very file again, one level deeper, per publish attempt.
const args = ['publish', '--registry', REGISTRY, '--access', 'public', '--ignore-scripts']
if (dryRun) args.push('--dry-run')

// npm reads `npm_config_<key>` from the environment; the key is the .npmrc key
// with its `//host/:_authToken` spelling intact.
const env = { ...process.env, 'npm_config_//registry.npmjs.org/:_authToken': token }

// npm on Windows is a .cmd shim. Spawning it directly trips a libuv assertion on
// recent Node releases (UV_HANDLE_CLOSING), so go through cmd.exe instead.
const command = process.platform === 'win32' ? 'cmd.exe' : 'npm'
const argv = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...args] : args
try {
  execFileSync(command, argv, { stdio: 'inherit', env })
} catch {
  console.error('npm publish failed; the registry message above says why.')
  process.exit(1)
}

console.log('')
console.log('published. Next:')
console.log('  git tag -a v' + pkg.version + ' -m "v' + pkg.version + '"')
console.log('  git push origin main refs/tags/v' + pkg.version)
