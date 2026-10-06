// Kai's Flow site — the little bit of behaviour. No tracking, no cookies; localStorage only keeps
// your sun/moon choice and (for an hour) the latest version number GitHub told us.
(() => {
  const d = document.documentElement
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const store = { get: (k) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } } }

  // ── sun / moon ── follows the system until you choose
  const themeBtns = $$('[data-theme-toggle]')
  const paintThemeBtn = () => themeBtns.forEach((b) => b.setAttribute('aria-label', d.dataset.theme === 'night' ? b.dataset.labelDay : b.dataset.labelNight))
  paintThemeBtn()
  themeBtns.forEach((b) => b.addEventListener('click', () => {
    d.dataset.theme = d.dataset.theme === 'night' ? 'day' : 'night'
    store.set('kf-theme', d.dataset.theme)
    paintThemeBtn()
  }))
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (store.get('kf-theme')) return
    d.dataset.theme = e.matches ? 'night' : 'day'
    paintThemeBtn()
  })

  // ── header: condenses after 80px; the phone menu ──
  const header = document.querySelector('.site-header')
  const menuBtn = document.querySelector('.menu-btn')
  const menu = document.getElementById('menu')
  const closeMenu = () => { menuBtn.setAttribute('aria-expanded', 'false'); menu.hidden = true }
  menuBtn?.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true'
    menuBtn.setAttribute('aria-expanded', String(open))
    menu.hidden = !open
  })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus() } })
  matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) closeMenu() })

  // ── the scroll-told day: one beat per screen of scroll ──
  const story = document.querySelector('.story')
  const beats = story ? $$('.beat', story) : []
  const stage = story?.querySelector('.story-stage')
  const navItems = story ? $$('.story-nav li, .story-bars i', story) : []
  let current = -1
  const setBeat = (i) => {
    if (i === current) return
    current = i
    story.dataset.beat = i
    beats.forEach((b, j) => { b.classList.toggle('on', j === i); b.classList.toggle('past', j < i) })
    navItems.forEach((n) => n.classList.toggle('on', +n.dataset.i === i))
    if (i === beats.length - 1) stage.dataset.theme = 'night'; else delete stage.dataset.theme
    const hint = story.querySelector('.story-hint b'); if (hint) hint.textContent = i + 1
  }
  const pinned = () => story && getComputedStyle(stage).position === 'sticky'

  let ticking = false
  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      header?.classList.toggle('condensed', scrollY > 80)
      if (!pinned()) { if (current !== -1) { current = -1; beats.forEach((b) => b.classList.remove('on', 'past')); delete stage.dataset.theme } return }
      const r = story.getBoundingClientRect()
      const span = story.offsetHeight - innerHeight
      const p = Math.min(Math.max(-r.top / span, 0), 0.9999)
      setBeat(Math.floor(p * beats.length))
    })
  }
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', onScroll)
  onScroll()

  // ── FAQ: open on wide screens, folded on phones ──
  const wide = matchMedia('(min-width: 761px)')
  const faq = () => $$('.faq details').forEach((x) => { x.open = wide.matches })
  faq(); wide.addEventListener('change', faq)

  // ── the current release, straight from GitHub (falls back to the version baked in at build) ──
  const rel = $$('[data-release], [data-release-tag], [data-asset]')
  if (rel.length) {
    const apply = (r) => {
      const tag = r.tag, date = new Date(r.date)
      const nice = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' })
      $$('[data-release-tag]').forEach((e) => { e.textContent = tag })
      $$('[data-release-date]').forEach((e) => { e.textContent = nice })
      $$('[data-asset]').forEach((a) => { const u = r[a.dataset.asset]; if (u) a.href = u })
    }
    let cached = null
    try { cached = JSON.parse(store.get('kf-release') || 'null') } catch { /* ignore */ }
    if (cached && Date.now() - cached.at < 36e5) apply(cached)
    else fetch('https://api.github.com/repos/khairyKY/kais-flow/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((j) => {
        const find = (re) => (j.assets || []).find((a) => re.test(a.name))?.browser_download_url
        const r = { tag: j.tag_name, date: j.published_at, apk: find(/\.apk$/), exe: find(/windows-setup\.exe$/), at: Date.now() }
        if (!r.tag) return
        store.set('kf-release', JSON.stringify(r))
        apply(r)
      })
      .catch(() => { /* keep the baked-in version */ })
  }

  // ── guides: filter as you type ──
  const q = document.getElementById('guide-q')
  if (q) {
    const cards = $$('[data-guide]')
    const none = document.querySelector('.gnone')
    q.addEventListener('input', () => {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean)
      let shown = 0
      cards.forEach((c) => { const hit = words.every((w) => c.dataset.guide.includes(w)); c.hidden = !hit; shown += hit })
      $$('.gcol').forEach((col) => { col.hidden = !$$('[data-guide]', col).some((c) => !c.hidden) })
      none.hidden = shown > 0
    })
  }

  // ── article table of contents: mark the section you're reading ──
  const toc = $$('.toc a')
  if (toc.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) toc.forEach((a) => a.classList.toggle('on', a.hash === '#' + e.target.id))
    }), { rootMargin: '-20% 0px -70% 0px' })
    toc.forEach((a) => { const t = document.getElementById(a.hash.slice(1)); if (t) io.observe(t) })
  }
})()
