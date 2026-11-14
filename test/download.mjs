// The downloader must survive the networks people actually have: a link that
// drops mid-file, an HTTP proxy, a SOCKS5 proxy, a proxy that is configured but
// dead, and none of the above. Everything here runs against local servers, so
// the test never touches the internet.
//
// Run with: node test/download.mjs
import { createServer } from 'node:http'
import { createServer as createNetServer, connect as netConnect } from 'node:net'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'rack-dl-'))
process.env.DSH_HOME = home
mkdirSync(join(home, 'plugin-rack'), { recursive: true })

const mod = await import(new URL('../index.js', import.meta.url).href)
const { downloadFile, fetchAny } = mod

const SIZE = 2 * 1024 * 1024
const payload = Buffer.alloc(SIZE)
for (let i = 0; i < SIZE; i += 1) payload[i] = (i * 31 + 7) & 0xff
const digest = createHash('sha256').update(payload).digest('hex')

let failures = 0
function check(ok, label) {
  if (ok) console.log('ok   ' + label)
  else {
    failures += 1
    console.error('FAIL ' + label)
  }
}

function config(proxy) {
  writeFileSync(join(home, 'plugin-rack', 'config.json'), JSON.stringify({ download: { proxy } }))
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

// A server that drops the socket once, so the downloader has to resume.
let requests = 0
let rangeRequests = 0
const origin = createServer((req, res) => {
  requests += 1
  if (req.url === '/stable.bin') {
    res.writeHead(200, { 'content-length': SIZE })
    res.end(payload)
    return
  }
  // A transfer that trickles, so a cancel can land in the middle of it.
  if (req.url === '/slow.bin') {
    res.writeHead(200, { 'content-length': SIZE })
    let offset = 0
    const step = 64 * 1024
    const pump = () => {
      if (offset >= SIZE) {
        res.end()
        return
      }
      res.write(payload.subarray(offset, offset + step))
      offset += step
      setTimeout(pump, 5)
    }
    pump()
    return
  }
  const range = req.headers.range
  if (typeof range === 'string') {
    rangeRequests += 1
    const start = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0)
    const rest = payload.subarray(start)
    res.writeHead(206, { 'content-length': rest.length, 'content-range': 'bytes ' + start + '-' + (SIZE - 1) + '/' + SIZE })
    res.end(rest)
    return
  }
  res.writeHead(200, { 'content-length': SIZE })
  res.write(payload.subarray(0, 512 * 1024))
  setTimeout(() => res.destroy(), 20)
})
const originPort = await listen(origin)

function fresh(name) {
  return join(home, name + '.bin')
}

config('off')
process.env.NO_PROXY = ''

// 1. A dropped connection is resumed with a Range request.
{
  const dest = fresh('resume')
  const bytes = await downloadFile('http://127.0.0.1:' + originPort + '/asset.bin', dest)
  const got = readFileSync(dest)
  check(bytes === SIZE && createHash('sha256').update(got).digest('hex') === digest, 'resumes a dropped download')
  check(rangeRequests >= 1, 'the resume asks for a byte range')
  check(!existsSync(dest + '.part'), 'the working file is gone after success')
}

// 2. An HTTP CONNECT proxy is used when it is configured.
let tunneled = 0
const proxy = createServer()
proxy.on('connect', (req, socket, head) => {
  tunneled += 1
  const [rawHost, rawPort] = req.url.split(':')
  const host = rawHost === 'rack-origin.test' ? '127.0.0.1' : rawHost
  const port = rawPort
  const upstream = netConnect(Number(port), host, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length > 0) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})
const proxyPort = await listen(proxy)
config('http://127.0.0.1:' + proxyPort)
{
  const dest = fresh('proxy')
  await downloadFile('http://127.0.0.1:' + originPort + '/asset.bin', dest)
  check(existsSync(dest) && createHash('sha256').update(readFileSync(dest)).digest('hex') === digest, 'downloads through an HTTP proxy')
  check(tunneled >= 1, 'the HTTP proxy was actually used')
}

// 3. A SOCKS5 proxy works too.
let socked = 0
const socks = createNetServer((socket) => {
  let stage = 0
  let buffer = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    if (stage === 0) {
      if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return
      buffer = buffer.subarray(2 + buffer[1])
      socket.write(Buffer.from([0x05, 0x00]))
      stage = 1
    }
    if (stage === 1) {
      if (buffer.length < 5) return
      const length = buffer[4]
      if (buffer.length < 7 + length) return
      const host = buffer.subarray(5, 5 + length).toString('utf8')
      const port = buffer.readUInt16BE(5 + length)
      buffer = buffer.subarray(7 + length)
      stage = 2
      const upstream = netConnect(port, host, () => {
        socked += 1
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        upstream.pipe(socket)
        socket.pipe(upstream)
      })
      upstream.on('error', () => socket.destroy())
    }
  })
  socket.on('error', () => {})
})
const socksPort = await listen(socks)
config('socks5://127.0.0.1:' + socksPort)
{
  const dest = fresh('socks')
  await downloadFile('http://127.0.0.1:' + originPort + '/asset.bin', dest)
  check(existsSync(dest) && createHash('sha256').update(readFileSync(dest)).digest('hex') === digest, 'downloads through a SOCKS5 proxy')
  check(socked >= 1, 'the SOCKS5 proxy was actually used')
}

// 3b. fetchAny reaches a host only the proxy can resolve.
{
  config('http://127.0.0.1:' + proxyPort)
  const answer = await fetchAny('http://rack-origin.test:' + originPort + '/stable.bin')
  check(answer.ok === true && (await answer.text()).length === SIZE, 'fetchAny goes through the proxy when the host does not resolve')
}

// 4. A proxy that is configured but dead falls back to the direct connection.
config('http://127.0.0.1:9')
{
  const dest = fresh('fallback')
  const bytes = await downloadFile('http://127.0.0.1:' + originPort + '/asset.bin', dest)
  check(bytes === SIZE, 'falls back to the direct connection when the proxy is dead')
}

// 5. NO_PROXY is honoured: the proxy is not even tried.
config('http://127.0.0.1:9')
process.env.NO_PROXY = '127.0.0.1'
{
  const dest = fresh('noproxy')
  const before = requests
  const bytes = await downloadFile('http://127.0.0.1:' + originPort + '/asset.bin', dest)
  check(bytes === SIZE && requests > before, 'NO_PROXY skips the proxy')
}
process.env.NO_PROXY = ''

// 6. Cancelling mid-flight used to destroy the write stream while chunk
// callbacks were still queued; the resulting unhandled 'error' took the whole
// host process down. Five cancels in a row is the cheap way to notice a return.
for (let i = 0; i < 5; i += 1) {
  const controller = new AbortController()
  const dest = fresh('cancel-' + i)
  const timer = setTimeout(() => controller.abort(new Error('cancelled')), 40)
  let stopped = false
  try {
    await downloadFile('http://127.0.0.1:' + originPort + '/slow.bin', dest, controller.signal)
  } catch {
    stopped = true
  } finally {
    clearTimeout(timer)
  }
  check(stopped, 'cancel #' + (i + 1) + ' stops the transfer')
  check(existsSync(dest) === false, 'cancel #' + (i + 1) + ' writes no finished file')
}

for (const server of [origin, proxy, socks]) server.close()

if (failures > 0) {
  console.error('\nDOWNLOAD_FAILED')
  process.exitCode = 1
} else {
  console.log('\nDOWNLOAD_OK')
}
