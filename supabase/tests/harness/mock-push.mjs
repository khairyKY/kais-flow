// Mock Web Push service for the harness tests (supabase/tests/*.sh).
//
//   node mock-push.mjs <port> <listen host> <devices a1,a2,...> <subs.json out> <log file>
//
// Generates a P-256 key pair + auth secret per device name and writes each device's
// PushSubscription `keys` ({p256dh, auth}) to subs.json. Every POST to /<anything>/<device> is
// decrypted (RFC 8291 aes128gcm) with that device's keys and appended to the log as
// {device, payload, error} — so a test sees exactly which device received what. A POST for a
// device name it doesn't know is still logged (error set): that's how a test catches a push that
// should never have been sent.
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'

const [, , port, host, deviceList, subsFile, logFile] = process.argv
const devices = {}
for (const name of deviceList.split(',').filter(Boolean)) {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  devices[name] = { ecdh, auth: crypto.randomBytes(16) }
}
fs.writeFileSync(subsFile, JSON.stringify(Object.fromEntries(Object.entries(devices).map(([n, d]) =>
  [n, { p256dh: d.ecdh.getPublicKey().toString('base64url'), auth: d.auth.toString('base64url') }]))))

const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len))
function decrypt(dev, body) {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const ct = body.subarray(21 + idlen)
  const uaPublic = dev.ecdh.getPublicKey()
  const ikm = hkdf(dev.ecdh.computeSecret(asPublic), dev.auth,
    Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32)
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(ct.subarray(ct.length - 16))
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])
  let end = pt.length - 1
  while (end >= 0 && pt[end] === 0) end-- // RFC 8188 padding: 0x02 delimiter, then zeros
  return pt.subarray(0, end).toString('utf8')
}

http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const device = req.url.split('?')[0].split('/').pop()
    let payload = null
    let error = null
    try {
      if (!devices[device]) throw new Error(`unknown device ${device}`)
      payload = JSON.parse(decrypt(devices[device], Buffer.concat(chunks)))
    } catch (e) {
      error = String(e)
    }
    fs.appendFileSync(logFile, JSON.stringify({ device, payload, error }) + '\n')
    res.writeHead(201)
    res.end()
  })
}).listen(Number(port), host)
