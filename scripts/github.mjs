// Token lookup and the tiny GitHub REST helper the release scripts share.
//
// The credential helper is not always in `git config`: on this machine it is a
// path that the git process can run but that `git config --get` reports as
// empty, so a plain `git credential fill` fails with "could not read Username".
// The fallback below finds the executable on disk instead.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const API = 'https://api.github.com'

export const REPO = (() => {
  // picks owner from `GITHUB_REPOSITORY` when CI passes it
  return process.env.GITHUB_REPOSITORY || ''
})()

export function gitToken(cwd) {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim()

  const attempts = []
  const configured = (() => {
    try {
      return execFileSync('git', ['config', '--get', 'credential.helper'], { cwd, encoding: 'utf8' }).trim()
    } catch {
      return ''
    }
  })()
  if (configured !== '') attempts.push(['-c', 'credential.helper=' + configured])

  for (const candidate of [
    'D:/software/Git/Git/mingw64/bin/git-credential-manager.exe',
    'C:/Program Files/Git/mingw64/bin/git-credential-manager.exe',
    'C:/Program Files (x86)/Git/mingw64/bin/git-credential-manager.exe',
  ]) {
    if (existsSync(candidate)) attempts.push(['-c', 'credential.helper=' + candidate])
  }
  if (attempts.length === 0) attempts.push([])

  for (const prefix of attempts) {
    try {
      const out = execFileSync('git', [...prefix, 'credential', 'fill'], {
        cwd,
        encoding: 'utf8',
        input: 'protocol=https\nhost=github.com\n\n',
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      const line = out.split(/\r?\n/).find(item => item.startsWith('password='))
      if (line) return line.slice('password='.length)
    } catch {
      // try the next helper
    }
  }
  return ''
}

export async function call(method, path, body, auth) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(auth ? { authorization: 'Bearer ' + auth } : {}),
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: res.status, json, text }
}
