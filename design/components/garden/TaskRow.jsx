export function TaskRow({ title, done, onToggle, chips, status, note, flower }) {
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 4px',
      borderBottom: '1px dashed var(--line-dashed, #d5cdb5)',
      opacity: done ? 0.55 : 1,
    }
  },
    flower
      ? React.createElement('img', { src: `../assets/flowers/${flower.species}/${flower.state || 'bloom'}.png`,
          style: { width: 22, height: 22, objectFit: 'contain', filter: 'drop-shadow(0 2px 2px rgba(60,52,38,0.18))' } })
      : React.createElement('span', {
          role: 'checkbox', 'aria-checked': !!done,
          onClick: () => onToggle && onToggle(!done),
          style: {
            width: 17, height: 17, flex: 'none', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            borderRadius: 5, fontSize: 11,
            ...(done
              ? { background: '#2a2420', border: '1.5px solid #2a2420', color: '#F4F1EA' }
              : { background: 'transparent', border: '1.5px solid var(--line-solid, #bfb8a3)', color: 'transparent' }),
          }
        }, done ? '✓' : ''),
    React.createElement('span', {
      style: {
        flex: 1, fontSize: 14.5, color: done ? 'var(--ink-hairline, #a49d87)' : 'var(--ink-body, #2a2420)',
        textDecoration: done ? 'line-through' : 'none',
      }
    }, title),
    chips && chips.length > 0 && React.createElement('span', { style: { display: 'flex', gap: 6, flex: 'none' } },
      chips.map((c, i) => React.createElement('span', {
        key: i,
        style: { display: 'inline-flex', alignItems: 'center', gap: 5,
                 fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: '0.08em',
                 textTransform: 'uppercase', padding: '3px 7px', borderRadius: 3,
                 border: '1px solid var(--line-solid, #cfc7b0)', color: 'var(--ink-muted, #6b6455)' }
      },
        c.dot && React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: c.dot } }),
        c.label
      ))
    ),
    status && React.createElement('span', {
      style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.14em',
               textTransform: 'uppercase', color: /over/i.test(status) ? 'var(--acc-terra, #B5654A)' : 'var(--ink-faint, #8b8471)',
               flex: 'none' }
    }, status),
    note && React.createElement('span', {
      style: { fontFamily: "'Caveat', cursive", fontSize: 16, color: 'var(--ink-muted, #6b6455)',
               transform: 'rotate(-1.5deg)', flex: 'none' }
    }, note),
  );
}
