// A started update must survive the panel that started it going away.
//
// This drives the real host half over http, on a throwaway DSH_HOME, with a
// stub pluginManager: it opens POST /updates, kills the socket on purpose (that
// is what closing the panel does to the fetch), and then checks that
//   - GET /job reports the run as still running right afterwards,
//   - the run reaches a terminal state on its own,
//   - job.json on disk carries that result for the next panel visit.
//
// Run with: node test/job-background.mjs
import { createServer } from 'node:http'
import { request as request_http } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'rack-job-'))
process.env.DSH_HOME = home

const profile = join(home, 'profiles', 'test')
mkdirSync(profile, { recursive: true })
// One exact-pinned dependency: the only kind an update is allowed to touch.
writeFileSync(
  join(profile, 'package.json'),
  JSON.stringify({ name: 'profile', dependencies: { 'rack-job-probe': '0.0.1' } }, null, 2),
)

const pluginManager = {
  async registries() {
    // Point at a closed local port: the registry lookup fails fast and the run
    // terminates without ever touching pnpm or a real registry.
    return { resolved: 'http://127.0.0.1:9/', registry: 'http://127.0.0.1:9/' }
  },
  async listBundles() {
    return []
  },
  list() {
    return []
  },
}

const registered = []
const ctx = {
  pluginManager,
  get(name) {
    if (name === 'profileContext') return { dir: profile }
    return undefined
  },
  effect(fn) {
    fn()
  },
  webServer: {
    register(route) {
      registered.push(route)
    },
  },
}

const mod = await import(new URL('../index.js', import.meta.url).href)
mod.apply(ctx)

const route = registered[0]
const server = createServer((req, res) => {
  route.handler(req, res).catch(() => {
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('{}')
    }
  })
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port
const base = `http://127.0.0.1:${port}/api/dsh-plugin-rack`

function fail(message) {
  console.error('FAIL ' + message)
  server.close()
  process.exitCode = 1
}

async function getJob() {
  const response = await fetch(base + '/job')
  const body = await response.json()
  return body.job
}

// 1. Nothing has run yet.
const first = await getJob()
if (first !== null) fail('GET /job should be null before any update')
else console.log('ok   /job is empty before the first update')

// 2. Start an update and drop the connection the way a closed panel does.
await new Promise((resolve, reject) => {
  const body = JSON.stringify({ names: ['rack-job-probe'] })
  const call = request_http(
    base + '/updates',
    { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
    (response) => {
      // A panel that is closed never reads this; drain and still destroy.
      response.resume()
    },
  )
  call.on('error', () => {})
  call.write(body)
  setTimeout(() => {
    call.destroy()
    resolve()
  }, 120)
  setTimeout(() => reject(new Error('the update call never returned')), 30000).unref()
})

// 3. The run is registered and reported as running.
let seenRunning = false
const deadline = Date.now() + 15000
let job = null
while (Date.now() < deadline) {
  job = await getJob()
  if (job !== null && job.running === true) {
    seenRunning = true
    break
  }
  await new Promise((done) => setTimeout(done, 100))
}
if (!seenRunning) fail('GET /job never reported the started update as running')
else console.log('ok   /job reports the run while it is still going')

// 4. It reaches a terminal state without anyone reading the original response.
while (Date.now() < deadline) {
  job = await getJob()
  if (job !== null && job.finishedAt !== null) break
  await new Promise((done) => setTimeout(done, 200))
}
if (job === null || job.finishedAt === null) fail('the update never settled after the client went away')
else console.log('ok   the run finished with nobody listening')

if (job.ok !== false) fail('this probe must fail (its registry is a closed port), got ok=' + String(job.ok))
else console.log('ok   the failure is reported, not swallowed')

// 5. The result is on disk for the next panel visit.
const jobFile = join(home, 'plugin-rack', 'job.json')
if (!existsSync(jobFile)) fail('job.json was not written')
else {
  const onDisk = JSON.parse(readFileSync(jobFile, 'utf8'))
  if (onDisk.id !== job.id || onDisk.finishedAt === null) fail('job.json does not match the reported run')
  else console.log('ok   job.json carries the finished run')
}

// 6. Cancelling is only offered while a run exists, and only for `cancel`.
async function postJob(payload) {
  const response = await fetch(base + '/job', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return response.status
}
const idleCancel = await postJob({ action: 'cancel' })
if (idleCancel !== 409) fail('cancelling with no run must answer 409, got ' + idleCancel)
else console.log('ok   cancelling an idle host answers 409')
const badCancel = await postJob({ action: 'boom' })
if (badCancel !== 400) fail('an unknown job action must answer 400, got ' + badCancel)
else console.log('ok   an unknown job action answers 400')

server.close()
if (process.exitCode === 1) console.error('\nJOB_BACKGROUND_FAILED')
else console.log('\nJOB_BACKGROUND_OK')
