// Auth email previews: every supabase/templates/*.html with made-up values, screenshotted at 600
// and 375 wide (and the confirmation email in dark mode too). It also checks each template uses
// only the Go-template variables Supabase gives that email, so a typo can't ship as raw text.
//   node docs/log/assets/email/preview.mjs <outDir> [playwright-core path]
// Run from the repo root. The logo's https URL is answered from app/public, so no network is used.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = process.argv[2] ?? 'docs/log/assets/email'
const PW = process.argv[3] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/omniroute/node_modules/playwright-core/index.mjs'
const DIR = 'supabase/templates'

// supabase.com/docs/guides/auth/auth-email-templates — what each email can use.
const LINK = ['ConfirmationURL', 'Token', 'TokenHash', 'SiteURL', 'RedirectTo', 'Data', 'Email']
const ALLOWED = {
  confirmation: LINK,
  recovery: LINK,
  magic_link: LINK,
  invite: LINK,
  email_change: [...LINK, 'NewEmail'],
  password_changed_notification: ['Email', 'Data'],
  email_changed_notification: ['Email', 'Data', 'OldEmail'],
}
const SAMPLE = {
  Email: 'kai@example.test',
  NewEmail: 'kai.new@example.test',
  OldEmail: 'kai.old@example.test',
  ConfirmationURL: 'https://example-project.supabase.co/auth/v1/verify?token=made-up-0123456789abcdef&type=signup&redirect_to=https%3A%2F%2Fkais-flow.kaidagoat.workers.dev%2F',
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const { chromium } = await import(pathToFileURL(PW).href)
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
fs.mkdirSync(OUT, { recursive: true })

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.html'))) {
  const name = file.replace('.html', '')
  const html = fs.readFileSync(path.join(DIR, file), 'utf8')
  const used = [...html.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)].map((m) => m[1])
  const other = [...html.matchAll(/\{\{(.*?)\}\}/g)].filter((m) => !/^\s*\.\w+\s*$/.test(m[1]))
  check(`${name} only uses its own variables`, ALLOWED[name] && used.every((v) => ALLOWED[name].includes(v)) && other.length === 0, used.join(' '))
  if (ALLOWED[name]?.includes('ConfirmationURL')) check(`${name} links {{ .ConfirmationURL }}`, used.includes('ConfirmationURL'))
  const filled = html.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_, v) => SAMPLE[v] ?? `[${v}]`)

  for (const [width, scheme] of [[600, 'light'], [375, 'light'], ...(name === 'confirmation' ? [[375, 'dark']] : [])]) {
    const page = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 1, colorScheme: scheme })
    await page.route('https://kais-flow.kaidagoat.workers.dev/**', (r) => r.fulfill({ path: path.join('app/public', new URL(r.request().url()).pathname) }))
    await page.setContent(filled, { waitUntil: 'load' })
    const wide = await page.evaluate(() => document.documentElement.scrollWidth)
    check(`${name} ${width}${scheme === 'dark' ? ' dark' : ''} fits without sideways scroll`, wide <= width, wide)
    if (scheme === 'dark') check(`${name} dark: page and button take the night colours`, (await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.kf-btn')).backgroundColor].join(' '))) === 'rgb(33, 29, 48) rgb(226, 148, 115)')
    await page.screenshot({ path: path.join(OUT, `${name}-${width}${scheme === 'dark' ? '-dark' : ''}.png`), fullPage: true })
    await page.close()
  }
}
await browser.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
