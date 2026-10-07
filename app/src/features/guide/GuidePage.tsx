import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { useIsMobile } from '../../components/BottomSheet'
import { MOD, restartTour } from '../tour/help'
import { ARTICLES, SECTIONS, cropOf, searchArticles, type Article } from './articles'
import './guide.css'

// Tour & help — the Guide (Tour and Help Guide.dc.html 14i index · 14j article; Desktop 14k): search,
// the tour again, and eleven short articles, each step a line and a crop of the real screen.
// Reached from More (phone) and the sidebar foot (desktop). English only — the app has no Arabic
// layer yet — but every side is a logical property, so the page mirrors under dir="rtl".

export function GuidePage() {
  const { slug } = useParams()
  if (!slug) return <GuideIndex />
  const article = ARTICLES.find((a) => a.slug === slug)
  return article ? <ArticleView key={slug} a={article} /> : <Navigate to="/guide" replace />
}

/** `**word**` → bold. */
function rich(text: string): ReactNode {
  return text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))
}

const SUN = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </svg>
)

function Chip({ a }: { a: Article }) {
  return (
    <span className="gd-chip" style={{ background: a.tint }} aria-hidden>
      {a.icon === 'sun' ? SUN : <Icon name={a.icon} size={20} />}
    </span>
  )
}

function Back({ label, to }: { label: string; to?: string }) {
  const navigate = useNavigate()
  const back = () => {
    if (to) navigate(to)
    else if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1)
    else navigate('/today')
  }
  return (
    <button type="button" className="gd-back" onClick={back}>
      <Icon name="back" size={20} className="gd-flip" />
      <span>{label}</span>
    </button>
  )
}

function TourCard() {
  return (
    <button type="button" className="gd-tour" onClick={restartTour}>
      <span className="gd-tape" aria-hidden />
      <img src="/ds/assets/clover/seedling.png" alt="" />
      <span className="gd-tour-text">
        <span className="gd-tour-title">Show me around again</span>
        <span className="gd-tour-sub">5 short notes on Today · 1 min</span>
      </span>
      <Icon name="chevright" size={20} className="gd-flip gd-faint" />
    </button>
  )
}

/** The `?` sheet and the chat belong to the shell; these ask it, the same way a key press would. */
// ponytail: synthetic key events instead of new shell props — AppLayout's own hotkeys open both.
const openShortcuts = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
const openChat = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }))

function GuideIndex() {
  const mobile = useIsMobile()
  const [q, setQ] = useState('')
  const found = useMemo(() => (q.trim() ? searchArticles(ARTICLES, q) : null), [q])
  const search = (
    <label className="gd-search">
      <Icon name="search" size={20} className="gd-faint" />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — “swipe”, “import”, “streak”" aria-label="Search the Guide" />
    </label>
  )
  const list = (articles: readonly Article[]) =>
    mobile ? (
      <div className="gd-band">
        {articles.map((a) => (
          <Link key={a.slug} to={`/guide/${a.slug}`} className="gd-row">
            <Chip a={a} />
            <span className="gd-row-text">
              <span className="gd-row-title">{a.title}</span>
              <span className="gd-row-sub">{a.sub}</span>
            </span>
            <span className="gd-steps">{a.steps.length} steps</span>
            <Icon name="chevright" size={20} className="gd-flip gd-faint" />
          </Link>
        ))}
      </div>
    ) : (
      <div className="gd-cards">
        {articles.map((a) => (
          <Link key={a.slug} to={`/guide/${a.slug}`} className="gd-card">
            <Chip a={a} />
            <span className="gd-row-text">
              <span className="gd-row-title">{a.title}</span>
              <span className="gd-row-sub">{a.sub}</span>
              <span className="gd-steps">{a.steps.length} steps</span>
            </span>
          </Link>
        ))}
      </div>
    )

  return (
    <div className="gd">
      <header className="gd-head">
        <div>
          {mobile ? (
            <div className="gd-bar">
              <Back label="More" />
              <h1 className="gd-h1">Guide</h1>
            </div>
          ) : (
            <>
              <div className="gd-eyebrow">Help</div>
              <h1 className="gd-h1">Guide</h1>
            </>
          )}
          <div className="gd-hand">a field guide to the garden</div>
        </div>
        {search}
      </header>

      {found ? (
        <section aria-live="polite">
          <div className="gd-sec">
            <span>{found.length ? `${found.length} found` : 'Nothing found'}</span>
            <span className="gd-rule" />
          </div>
          {found.length ? list(found) : <p className="gd-none">Nothing by that name yet — try another word, or ask in Chat.</p>}
        </section>
      ) : (
        <>
          <div className="gd-top">
            <TourCard />
            {!mobile && (
              <div className="gd-keys">
                <button type="button" className="gd-keys-btn" onClick={openShortcuts}>
                  <span className="gd-key">?</span>
                  <span>shows every shortcut, on any page</span>
                </button>
                <button type="button" className="gd-keys-btn is-quiet" onClick={openChat}>
                  <span>Still stuck? Ask in Chat</span>
                  <span className="gd-key">{MOD}J</span>
                </button>
              </div>
            )}
          </div>
          <div className="gd-sections">
            {SECTIONS.map((s) => (
              <section key={s}>
                <div className="gd-sec">
                  <span>{s}</span>
                  <span className="gd-rule" />
                </div>
                {list(ARTICLES.filter((a) => a.section === s))}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ArticleView({ a }: { a: Article }) {
  const mobile = useIsMobile()
  const i = ARTICLES.indexOf(a)
  const next = ARTICLES[i + 1]
  const meta = `${a.steps.length} steps · ${a.min} min`
  return (
    <div className="gd gd-article">
      {!mobile && (
        <nav className="gd-toc" aria-label="On this page">
          <div className="gd-eyebrow is-faint">On this page</div>
          {a.steps.map((s, n) => (
            <a key={n} href={`#step-${n + 1}`} onClick={(e) => { e.preventDefault(); document.getElementById(`step-${n + 1}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }}>
              {n + 1} · {s.name}
            </a>
          ))}
        </nav>
      )}
      <article className="gd-body">
        {mobile ? (
          <Back label="Guide" to="/guide" />
        ) : (
          <div className="gd-crumb">
            <Link to="/guide">Guide</Link> › {a.section}
          </div>
        )}
        {mobile && <div className="gd-eyebrow">Guide · {meta}</div>}
        <h1 className="gd-h1 is-article">{a.title}</h1>
        {!mobile && <div className="gd-eyebrow is-faint">{meta}</div>}
        <p className="gd-intro">{a.intro}</p>
        <ol className="gd-step-list">
          {a.steps.map((s, n) => {
            const crop = cropOf(a.slug, n)
            return (
              <li key={n} id={`step-${n + 1}`} className="gd-step">
                <span className="gd-num" aria-hidden>{n + 1}</span>
                <p className="gd-step-text">{rich(s.text)}</p>
                {crop && (
                  <figure className="gd-crop">
                    <img src={crop.src} width={crop.w} height={crop.h} loading="lazy" decoding="async" alt="" />
                  </figure>
                )}
              </li>
            )
          })}
        </ol>
        {mobile && <TourCard />}
        {next && (
          <Link to={`/guide/${next.slug}`} className="gd-next">
            Next: {next.title} <span className="gd-flip" aria-hidden>→</span>
          </Link>
        )}
      </article>
    </div>
  )
}
