// Shared by check.mjs and shots.mjs: bundling src/core.jsx for Node and for a browser page, and running the
// widgets' real `command` (a /bin/sh script) with bash against a local fake of the Widget feed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(here, '..')
export const REPO = path.resolve(ROOT, '..', '..')
export const SAMPLE = path.join(REPO, 'docs', 'log', 'assets', 'widget-feed', 'sample-feed.json')
const APP_MODULES = path.join(REPO, 'app', 'node_modules')
export const esbuild = createRequire(import.meta.url)(process.env.ESBUILD ?? path.join(APP_MODULES, 'esbuild', 'lib', 'main.js'))
export const NOW = 1793271600 // the sample feed's own clock: Thursday 29 Oct 2026, 14:00 in Cairo

const shim = path.join(here, 'shim.js')
const common = { bundle: true, write: false, charset: 'utf8', alias: { uebersicht: shim }, nodePaths: [APP_MODULES], logLevel: 'error' }

// core.jsx as an ES module Node can import, plus its exports
export async function loadCore(tmp) {
  const r = await esbuild.build({ ...common, entryPoints: [path.join(ROOT, 'src', 'core.jsx')], format: 'esm', platform: 'node', jsx: 'automatic' })
  const file = path.join(tmp, 'core.bundle.mjs')
  fs.writeFileSync(file, r.outputFiles[0].text)
  return import(pathToFileURL(file).href + `?${Date.now()}`)
}

// the browser harness: React + core, as one script that sets window.KFH
export async function harnessScript() {
  const r = await esbuild.build({ ...common, entryPoints: [path.join(here, 'harness-entry.jsx')], format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
  return r.outputFiles[0].text
}

// ---------------------------------------------------------------- the real shell command against a fake feed
export async function runCommand(config, opts = {}) {
  const core = opts.core
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-mac-'))
  const home = path.join(dir, 'home')
  fs.mkdirSync(path.join(home, 'Applications'), { recursive: true })
  if (opts.app) fs.mkdirSync(path.join(home, 'Applications', "Kai's Flow.app"))
  const widget = path.join(dir, 'Kais-Flow', 'kais-flow-today.widget')
  fs.mkdirSync(widget, { recursive: true })
  const body = opts.body ?? fs.readFileSync(SAMPLE, 'utf8')
  const server = http.createServer((req, res) => {
    res.writeHead(opts.status ?? 200, { 'content-type': 'application/json' })
    res.end(body)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const link = `http://127.0.0.1:${server.address().port}/functions/v1/widget?t=kf_w_TEST`
  if (config !== null) {
    const text = typeof config === 'string' ? config : JSON.stringify({ link, ...config }, null, 2)
    fs.writeFileSync(path.join(dir, 'Kais-Flow', 'kaisflow.config.json'), text)
  }
  let out
  try {
    // async: the fake feed is served from this same process
    out = (await promisify(execFile)('bash', ['-c', core.command], { cwd: widget, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000 })).stdout
  } finally {
    server.close()
  }
  fs.rmSync(dir, { recursive: true, force: true })
  return { out, link }
}
