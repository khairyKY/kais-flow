import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useDeletedItems, restoreItem, deleteItemForever, type DeletedItem } from './api'

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

export function TrashPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const { data: deletedItems = [], isLoading } = useDeletedItems()
  const [showGlobalConfirm, setShowGlobalConfirm] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [toastText, setToastText] = useState<string | null>(null)
  const [toastTarget, setToastTarget] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const handleRestore = (item: DeletedItem) => {
    restoreItem(item)
    queryClient.invalidateQueries({ queryKey: ['deleted_items'] })
    queryClient.invalidateQueries({ queryKey: [item.type === 'Task' ? 'tasks' : item.type === 'Inbox' ? 'inbox_items' : item.type === 'Event' ? 'calendar_events' : 'journal_entries'] })
    const routeMap = { Task: '/tasks', Inbox: '/inbox', Event: '/calendar', Journal: '/journal' }
    setToastText(`Restored to ${item.type === 'Event' ? 'Calendar' : item.type}s`)
    setToastTarget(routeMap[item.type])
    setTimeout(() => { setToastText(null); setToastTarget(null) }, 6000)
  }

  const handleDeleteForever = (item: DeletedItem) => {
    deleteItemForever(item)
    setConfirmDeleteId(null)
    queryClient.invalidateQueries({ queryKey: ['deleted_items'] })
  }

  const handleEmptyEverything = () => {
    for (const item of deletedItems) deleteItemForever(item)
    setShowGlobalConfirm(false)
    queryClient.invalidateQueries({ queryKey: ['deleted_items'] })
  }

  const getDeletionMeta = (deletedAtStr: string) => {
    const deletedAt = new Date(deletedAtStr)
    const now = new Date()
    const diffMs = now.getTime() - deletedAt.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffHours < 24) {
      if (diffHours === 0) return `deleted ${Math.max(1, Math.floor(diffMs / (1000 * 60)))}m ago`
      return `deleted ${diffHours}h ago`
    }
    if (diffDays < 7) return `deleted ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][deletedAt.getDay()]}`
    const dayLabel = deletedAt.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    const daysLeft = Math.max(1, 30 - diffDays)
    return `deleted ${dayLabel} \u00b7 composts in ${daysLeft}d`
  }

  const ageGroupedItems = useMemo(() => {
    const today: DeletedItem[] = []; const thisWeek: DeletedItem[] = []; const older: DeletedItem[] = []
    const now = Date.now(); const oneDay = 86400000; const oneWeek = 7 * oneDay
    for (const item of deletedItems) {
      const diff = now - new Date(item.deleted_at).getTime()
      if (diff < oneDay) today.push(item)
      else if (diff < oneWeek) thisWeek.push(item)
      else older.push(item)
    }
    return { today, thisWeek, older }
  }, [deletedItems])

  const hasItems = deletedItems.length > 0

  const styles = `
    .tbadge { font-family:var(--font-mono); font-size:8.5px; letter-spacing:0.12em; text-transform:uppercase; padding:3px 7px; border-radius:4px; background:rgba(42,36,32,0.07); color:var(--ink-faint); flex:none; width:58px; text-align:center; }
    .trow { display:flex; align-items:center; gap:13px; padding:12px 2px; border-bottom:1px dashed var(--line-dashed); }
    .aghd { position:relative; display:flex; align-items:center; gap:12px; margin:26px 0 4px; padding:6px 10px; border-radius:5px; overflow:hidden; }
    .aghd span.t { font-family:var(--font-mono); font-size:10.5px; letter-spacing:0.18em; text-transform:uppercase; color:var(--ink-faint); white-space:nowrap; position:relative; }
    .aghd .r { flex:1; height:1px; border-bottom:1px dashed var(--line-dashed); position:relative; }
    .leafbg { position:absolute; width:16px; height:10px; border-radius:80% 20% 70% 30%; opacity:0.16; }
  `

  const renderGroupList = (items: DeletedItem[]) => items.map((item) => {
    const isConfirming = confirmDeleteId === item.id
    return (
      <div key={item.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="trow">
          <span className="tbadge">{item.type}</span>
          <span style={{ flex: 1, fontSize: 14, color: 'var(--ink-faint)', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>{getDeletionMeta(item.deleted_at)}</span>
          {isMobile ? (
            <div style={{ position: 'relative' }}>
              <span onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)} style={{ fontSize: 18, padding: '0 8px', cursor: 'pointer', color: 'var(--ink-faint)', userSelect: 'none' }}>\u22ef</span>
              {openMenuId === item.id && (
                <div style={{ position: 'absolute', right: 0, top: 22, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 4, boxShadow: 'var(--shadow-panel)', padding: '6px 0', zIndex: 30, display: 'flex', flexDirection: 'column', minWidth: 120 }}>
                  <span onClick={() => { handleRestore(item); setOpenMenuId(null) }} style={{ padding: '6px 14px', fontSize: 13, color: 'var(--ink-body)', cursor: 'pointer' }}>Restore</span>
                  <span onClick={() => { setConfirmDeleteId(item.id); setOpenMenuId(null) }} style={{ padding: '6px 14px', fontSize: 13, color: 'var(--acc-terra)', cursor: 'pointer' }}>Delete forever</span>
                </div>
              )}
            </div>
          ) : (
            <>
              <span onClick={() => handleRestore(item)} style={{ fontSize: 12.5, color: 'var(--ink-body)', textDecoration: 'underline', cursor: 'pointer' }}>Restore</span>
              <span onClick={() => setConfirmDeleteId(isConfirming ? null : item.id)} style={{ fontSize: 12, color: 'var(--ink-faint)', cursor: 'pointer' }}>Delete forever</span>
            </>
          )}
        </div>
        {isConfirming && (
          <div style={{ margin: '8px 0 0 71px', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, boxShadow: 'var(--shadow-panel)', padding: '11px 15px', display: 'flex', alignItems: 'center', gap: 14, maxWidth: 440 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-body)' }}>Gone for good \u2014 compost now?</span>
            <span style={{ flex: 1 }}></span>
            <span onClick={() => setConfirmDeleteId(null)} style={{ fontSize: 12, color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</span>
            <button onClick={() => handleDeleteForever(item)} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12, padding: '6px 13px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>Delete forever</button>
          </div>
        )}
      </div>
    )
  })

  const renderEmptyState = () => (
    <div style={{ background: 'var(--paper-linen)', padding: '46px 40px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
      <svg width="120" height="76" viewBox="0 0 120 76">
        <ellipse cx="60" cy="62" rx="46" ry="12" fill="#b9a98a" opacity="0.55"></ellipse>
        <path d="M22 60c4-14 18-24 38-24s34 10 38 24" fill="#a3937a" opacity="0.6"></path>
        <path d="M34 52c8-8 40-10 52-2" stroke="#8b7a5e" strokeWidth={1.5} fill="none" opacity={0.5}></path>
        <path d="M60 38V22" stroke="#7A946E" strokeWidth="2.5" strokeLinecap="round"></path>
        <path d="M60 25c-4-.6-6-2.6-6.6-6.6 4 0 6.2 1.8 6.6 6.6Z" fill="#7A946E"></path>
        <path d="M60 28c4-.6 6-2.6 6.6-6.6-4 0-6.2 1.8-6.6 6.6Z" fill="#8A9A7E"></path>
      </svg>
      <div style={{ marginTop: 20, fontFamily: 'var(--font-hand)', fontSize: 19, color: '#7a745f', textAlign: 'center', maxWidth: 360, lineHeight: '1.45' }}>The heap is empty. Deleted things rest here for 30 days before they compost.</div>
    </div>
  )

  const renderAgeGroup = (label: string, items: DeletedItem[]) => items.length > 0 ? (
    <>
      <div className="aghd">
        {label === 'Today' && (
          <>
            <span className="leafbg" style={{ left: '6%', top: 4, background: '#C9A55A', transform: 'rotate(24deg)' }}></span>
            <span className="leafbg" style={{ left: '38%', top: 12, background: '#a9803f', transform: 'rotate(-30deg)' }}></span>
            <span className="leafbg" style={{ left: '72%', top: 2, background: '#C9A55A', transform: 'rotate(60deg)' }}></span>
          </>
        )}
        {label === 'This week' && (
          <>
            <span className="leafbg" style={{ left: '12%', top: 8, background: '#a9803f', transform: 'rotate(-14deg)' }}></span>
            <span className="leafbg" style={{ left: '56%', top: 3, background: '#C9A55A', transform: 'rotate(40deg)' }}></span>
          </>
        )}
        {label === 'Older' && (
          <>
            <span className="leafbg" style={{ left: '22%', top: 6, background: '#C9A55A', transform: 'rotate(10deg)' }}></span>
            <span className="leafbg" style={{ left: '80%', top: 9, background: '#a9803f', transform: 'rotate(-48deg)' }}></span>
          </>
        )}
        <span className="t">{label}</span><span className="r" />
      </div>
      {renderGroupList(items)}
    </>
  ) : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: 'var(--paper-linen)' }}>
      <style>{styles}</style>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />
      <div style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 34px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', flex: 'none' }}>
        <span>Kai's Flow \u00b7 Settings \u00b7 Trash</span><span>Africa/Cairo</span>
      </div>
      <div style={{ flex: 1, padding: '28px 0 44px', display: 'flex', justifyContent: 'center', overflowY: 'auto', position: 'relative', zIndex: 10 }}>
        <div style={{ width: 760, maxWidth: '100%', padding: '0 34px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <svg width="42" height="40" viewBox="0 0 48 46"><path d="M8 30c0-4 4-9 10-10-2-4 1-9 6-9s8 5 6 9c6 1 10 6 10 10Z" fill="#a9a68f" opacity="0.5"/><path d="M4 30h40l-3 12H7L4 30Z" fill="none" stroke="#8b8471" strokeWidth="2" strokeLinejoin="round"/><path d="M24 20v-6" stroke="#7A946E" strokeWidth="2" strokeLinecap="round"/><path d="M24 15c-3-.5-4.5-2-5-5 3 0 4.7 1.3 5 5Z" fill="#7A946E"/></svg>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{deletedItems.length} items resting</div>
                <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 38, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>Trash</h1>
              </div>
            </div>
            {hasItems && <span onClick={() => setShowGlobalConfirm(true)} style={{ fontSize: 12.5, color: 'var(--acc-terra)', textDecoration: 'underline', cursor: 'pointer', paddingBottom: 5 }}>Empty trash\u2026</span>}
          </div>
          {showGlobalConfirm && (
            <div style={{ marginTop: 16, marginBottom: 16, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 6, boxShadow: 'var(--shadow-panel)', padding: '13px 17px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>Empty everything? {deletedItems.length} items, no way back.</span>
              <span style={{ flex: 1 }}></span>
              <span onClick={() => setShowGlobalConfirm(false)} style={{ fontSize: 12.5, color: 'var(--ink-faint)', cursor: 'pointer' }}>Cancel</span>
              <button onClick={handleEmptyEverything} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>Empty</button>
            </div>
          )}
          {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>Loading...</div>
          : !hasItems ? renderEmptyState()
          : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {renderAgeGroup('Today', ageGroupedItems.today)}
              {renderAgeGroup('This week', ageGroupedItems.thisWeek)}
              {renderAgeGroup('Older', ageGroupedItems.older)}
              <div style={{ marginTop: 26, padding: '10px 14px', border: '1px dashed var(--line-solid)', borderRadius: 6, background: 'rgba(169,166,143,0.08)', fontSize: 12.5, color: 'var(--ink-faint)', textAlign: 'center' }}>Items compost after 30 days \u2014 gone for good, feeding nothing in particular.</div>
            </div>
          )}
        </div>
      </div>
      {toastText && (
        <div style={{ position: 'absolute', left: '50%', bottom: 22, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 12, background: '#2a2420', color: '#F4F1EA', borderRadius: 999, padding: '9px 16px', boxShadow: '0 10px 26px rgba(42,36,32,0.3)', whiteSpace: 'nowrap', zIndex: 45 }}>
          <span style={{ fontSize: 12 }}>{toastText}</span>
          {toastTarget && <span onClick={() => navigate(toastTarget)} style={{ fontSize: 12, fontWeight: 600, color: '#C9A55A', cursor: 'pointer' }}>Jump there \u2192</span>}
        </div>
      )}
    </div>
  )
}
