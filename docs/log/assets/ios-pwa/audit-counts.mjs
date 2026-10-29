// The iOS audit's numbers in one line per phone (kais-flow-ios-pwa-audit-assets/ios-audit.mjs → audit-results.json).
//   node audit-counts.mjs <audit-results.json>
// The audit runs with no inset simulation (WebKit desktop reports env() = 0), so its home-band count measures what a
// device with no reported inset gets; verify.mjs is where the insets are simulated.
import fs from 'node:fs'

const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const out = {}
for (const [phone, R] of Object.entries(r.phones)) {
  if (R.fatal) {
    out[phone] = 'fatal'
    continue
  }
  const screens = Object.values(R.screens).filter((s) => s.audit)
  out[phone] = {
    smallTapTargets: screens.reduce((n, s) => n + s.audit.smallCount, 0),
    fieldsUnder16: [...new Set(screens.flatMap((s) => s.audit.smallInputs.map((i) => `${i.el} ${i.fontPx}`)))],
    inHomeBand: screens.reduce((n, s) => n + s.audit.inHome.length, 0),
    sidewaysScroll: screens.filter((s) => s.audit.hscroll > 0).length,
    chatFieldHidden: R.screens['14c-chat-keyboard']?.keyboard?.fieldHidden ?? null,
    captureFieldHidden: R.screens['11b-capture-keyboard']?.keyboard?.fieldHidden ?? null,
    pageErrors: (R.errors ?? []).length,
  }
}
out.edgeToEdgeUnderStatusBar = Object.fromEntries(Object.entries(r.edgeToEdge ?? {}).map(([k, v]) => [k, v.audit.underTop.length]))
console.log(JSON.stringify(out, null, 2))
