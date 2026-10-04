// Shared page chrome and small components. Plain template strings, no framework.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { icon } from './icons.mjs'
import { APP_URL, REPO, CONTACT_EMAIL } from './data.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// ── images ── intrinsic sizes read from the WebP headers, so every <img> carries width/height.
const IMG_DIR = ROOT + 'public/img/'
const webpSize = (buf) => {
  const tag = buf.toString('ascii', 12, 16)
  if (tag === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)]
  if (tag === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)] }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff] // 'VP8 '
}
const SIZES = Object.fromEntries(fs.readdirSync(IMG_DIR).filter((f) => f.endsWith('.webp'))
  .map((f) => [f.slice(0, -5), webpSize(fs.readFileSync(IMG_DIR + f))]))

/** A botanical illustration. `w` = the drawn width in CSS px; height follows the art's ratio. */
export const img = (name, alt, { w, cls = '', eager = false, style = '' } = {}) => {
  const [iw, ih] = SIZES[name] ?? (() => { throw new Error(`no image ${name}`) })()
  const width = w ?? iw
  const height = Math.round((width * ih) / iw)
  const a = alt ? `alt="${alt}"` : 'alt="" aria-hidden="true"'
  return `<img class="${cls}" src="/img/${name}.webp" ${a} width="${width}" height="${height}"${eager ? '' : ' loading="lazy"'} decoding="async"${style ? ` style="${style}"` : ''}>`
}

// ── app screens ── lifted from the designs (src/screens/*.html), shown at a scale. They're
// pictures of the app, so they read as one image with a description, and stay English + LTR.
const SCREEN_CACHE = {}
const screenHtml = (name) => (SCREEN_CACHE[name] ??= fs.readFileSync(ROOT + `src/screens/${name}.html`, 'utf8')
  .replace(/ds\/assets\/(\w+)\/([\w-]+)\.png/g, '/img/$1-$2.webp').replace(/<img /g, '<img loading="lazy" decoding="async" '))
// `s` = scale; leave it out when the stylesheet sets --s for the context (so it can change per breakpoint).
export const screen = (name, label, { s, cls = '' } = {}) => {
  const desk = name === 'calendar-week'
  return `<div class="screen${desk ? ' desk' : ''} ${cls}" role="img" aria-label="${label}"${s ? ` style="--s:${s}"` : ''}><div class="screen-in" dir="ltr" lang="en">${screenHtml(name)}</div></div>`
}

// ── small components ──
export { icon }
export const kmark = (size = 38) => `<span class="kmark" style="--k:${size}px" aria-hidden="true"><span>K</span></span>`
export const eyebrow = (text, tone = 'terra') => `<span class="eyebrow ${tone}">${text}</span>`
export const head2 = ({ eyebrow: e, title, lead, h = 'h2', tone, cls = '' }) =>
  `<div class="head ${cls}">${e ? eyebrow(e, tone) : ''}<${h}>${title}</${h}>${lead ? `<p class="lead">${lead}</p>` : ''}</div>`
export const btn = (label, href, { kind = 'primary', size = '', ic = '', attrs = '' } = {}) =>
  `<a class="btn ${kind} ${size}" href="${href}"${attrs ? ' ' + attrs : ''}>${ic ? icon(ic, 20) : ''}${label}</a>`
export const soon = (t = 'Coming soon') => `<span class="chip soon">${t}</span>`
export const live = () => `<span class="chip live"><i aria-hidden="true"></i>Live</span>`
export const coming = () => `<span class="chip soon">Coming</span>`
export const tape = (tone = 'sage', rot = -4, style = '') => `<span class="tape ${tone}" style="--r:${rot}deg;${style}" aria-hidden="true"></span>`
export const contact = () => CONTACT_EMAIL ? `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>` : '<span class="todo">[contact email]</span>'
export const kai = (t) => `<span class="todo">[Kai writes this: ${t}]</span>`
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── chrome ──
const NAV = { en: [['Features', '/features/'], ['Paper', '/paper/'], ['Download', '/download/'], ['Field notes', '/field-notes/']],
  ar: [['الميزات', '/features/'], ['الورق', '/paper/'], ['التنزيل', '/download/'], ['ملاحظات ميدانية', '/field-notes/']] }
const FOOT = { en: [['Features', '/features/'], ['Guides', '/guides/'], ['Field notes', '/field-notes/'], ['What’s growing', '/growing/'], ['Compare', '/compare/'], ['About', '/about/'], ['Press', '/press/'], ['Privacy', '/privacy/'], ['Terms', '/terms/'], ['Contact', '/privacy/#contact'], ['GitHub', REPO]],
  ar: [['الخصوصية', '/privacy/'], ['الشروط', '/terms/'], ['تواصل', '/privacy/#contact'], ['GitHub', REPO]] }
const T = { en: { skip: 'Skip to content', open: 'Open the app', menu: 'Menu', main: 'Main', lang: 'Language', foot: 'Footer', tag: 'a field journal of days', fine: '© 2026 Kai’s Flow · no cookies, no trackers on this site', home: 'Kai’s Flow, home', toNight: 'Switch to night', toDay: 'Switch to day' },
  ar: { skip: 'انتقل إلى المحتوى', open: 'افتح التطبيق', menu: 'القائمة', main: 'الرئيسية', lang: 'اللغة', foot: 'التذييل', tag: 'سجلّ ميداني للأيام', fine: '© 2026 Kai’s Flow · لا ملفات تعريف ارتباط ولا تتبّع على هذا الموقع', home: 'Kai’s Flow، الرئيسية', toNight: 'الوضع الليلي', toDay: 'الوضع النهاري' } }

const navLinks = (lang, path) => NAV[lang].map(([l, h]) => `<a href="${h}"${path.startsWith(h) ? ' aria-current="page"' : ''}>${l}</a>`).join('')
const langSwitch = (lang) => `<div class="lang" role="group" aria-label="${T[lang].lang}">${lang === 'en'
  ? '<span class="on" lang="en">EN</span><a href="/ar/" lang="ar" hreflang="ar" aria-label="العربية">ع</a>'
  : '<a href="/" lang="en" hreflang="en" aria-label="English">EN</a><span class="on" lang="ar">ع</span>'}</div>`

const header = (lang, path) => {
  const t = T[lang]
  return `<a class="skip" href="#main">${t.skip}</a>
<header class="site-header" id="top">
  <div class="wrap bar">
    <a class="brand" href="${lang === 'ar' ? '/ar/' : '/'}" aria-label="${t.home}">${kmark(38)}<span class="brand-name" lang="en">Kai’s Flow</span></a>
    <nav class="nav" aria-label="${t.main}">${navLinks(lang, path)}</nav>
    ${langSwitch(lang)}
    <button class="round theme-btn" type="button" data-theme-toggle aria-label="${t.toNight}" data-label-night="${t.toNight}" data-label-day="${t.toDay}">${icon('sun', 20).replace('class="ic"', 'class="ic sun"')}${icon('moon', 20).replace('class="ic"', 'class="ic moon"')}</button>
    ${btn(t.open, APP_URL, { attrs: 'data-open-app' }).replace('class="btn primary ', 'class="btn primary cta ')}
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu" aria-label="${t.menu}"><span></span><span></span></button>
  </div>
  <div class="menu" id="menu" hidden>
    <nav class="wrap" aria-label="${t.menu}">${navLinks(lang, path)}${langSwitch(lang)}${btn(t.open, APP_URL)}</nav>
  </div>
</header>`
}

const footer = (lang) => {
  const t = T[lang]
  return `<footer class="site-footer">
  ${img('clover-four_leaf', '', { w: 110, cls: 'foot-clover' })}
  <div class="wrap">
    <div class="foot-row">
      <div class="foot-brand">${kmark(48)}<div><div class="foot-name" lang="en">Kai’s Flow</div><div class="hand">${t.tag}</div></div></div>
      <nav class="foot-links" aria-label="${t.foot}">${FOOT[lang].map(([l, h]) => `<a href="${h}">${l}</a>`).join('')}</nav>
    </div>
    <p class="fine">${t.fine}</p>
  </div>
</footer>`
}

const FONTS = {
  en: 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500&family=Courier+Prime:wght@400;700&family=Inter+Tight:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&display=swap',
  ar: 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500&family=Courier+Prime:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Inter+Tight:wght@400;500;600&family=Noto+Naskh+Arabic:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap',
}

// Sets the theme before first paint: the saved choice, else the system's.
const THEME_JS = `try{var t=localStorage.getItem('kf-theme')}catch(e){}var d=document.documentElement;d.dataset.theme=t==='night'||t==='day'?t:matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';d.classList.add('js')`

/** A whole page. `site` = absolute origin for canonical/OG URLs. */
export const page = ({ site, path, title, description, og = 'home', lang = 'en', body, alternates = false, cls = '' }) => {
  const url = site + path
  const fullTitle = path === '/' ? title : `${title} · Kai’s Flow`
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${alternates ? `<link rel="alternate" hreflang="en" href="${site}/">\n<link rel="alternate" hreflang="ar" href="${site}/ar/">\n<link rel="alternate" hreflang="x-default" href="${site}/">\n` : ''}<meta property="og:type" content="website">
<meta property="og:site_name" content="Kai’s Flow">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${site}/og/${og}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${lang === 'ar' ? 'ar_EG' : 'en_GB'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#EFE9DB" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#211D30" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Kai’s Flow · Field notes" href="/field-notes/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS[lang]}">
<link rel="stylesheet" href="/site.css">
<script>${THEME_JS}</script>
<script src="/site.js" defer></script>
</head>
<body class="${cls}">
${header(lang, path)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(lang)}
</body>
</html>
`
}
