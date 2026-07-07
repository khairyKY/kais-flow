export function GoalCard({ title, eyebrow = 'Goal of the day', why, done, onToggle, meta }) {
  return React.createElement('div', {
    style: {
      position: 'relative', background: 'var(--paper-goal, #F8EFD3)',
      border: '1px solid var(--line-goal, #dcc48e)', borderRadius: 3,
      padding: '22px 26px', transform: 'rotate(-0.4deg)',
      boxShadow: '0 1px 2px rgba(60,52,38,0.14),0 8px 20px rgba(154,123,58,0.14)',
    }
  },
    React.createElement('span', {
      style: { position: 'absolute', top: -9, left: '50%', marginLeft: -38, width: 76, height: 16,
               background: 'rgba(201,165,90,0.5)',
               backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)',
               transform: 'rotate(2deg)', borderRadius: 1 },
    }),
    React.createElement('div', {
      style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: '0.22em',
               textTransform: 'uppercase', color: 'var(--acc-gold, #9a7b3a)', marginBottom: 10 }
    }, eyebrow),
    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 14 } },
      React.createElement('span', {
        role: 'checkbox', 'aria-checked': !!done,
        onClick: () => onToggle && onToggle(!done),
        style: {
          marginTop: 4, width: 19, height: 19, flex: 'none', borderRadius: 5, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          ...(done
            ? { background: '#2a2420', border: '1.5px solid #2a2420', color: '#F4F1EA', fontSize: 12 }
            : { background: 'rgba(255,255,255,0.5)', border: '1.5px solid var(--acc-gold, #9a7b3a)', color: 'transparent' })
        }
      }, done ? '✓' : ''),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', {
          style: { fontFamily: "'Source Serif 4', serif", fontSize: 22, fontWeight: 500,
                   color: '#3d2f1a', lineHeight: 1.25, letterSpacing: '-0.01em' }
        }, title),
        why && React.createElement('div', {
          style: { fontFamily: "'Caveat', cursive", fontSize: 18, color: '#7a5f2a',
                   transform: 'rotate(-0.6deg)', marginTop: 10 }
        }, why),
      ),
      meta && React.createElement('span', {
        style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.16em',
                 textTransform: 'uppercase', color: 'var(--acc-gold, #9a7b3a)', flex: 'none' }
      }, meta),
    )
  );
}
