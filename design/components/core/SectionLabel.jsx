export function SectionLabel({ label, action }) {
  return React.createElement(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 14, margin: '0 0 8px' } },
    React.createElement('span', {
      style: {
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--ink-faint, #8b8471)', whiteSpace: 'nowrap',
      }
    }, label),
    React.createElement('span', {
      style: { flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed, #d5cdb5)' }
    }),
    action && React.createElement('a', {
      href: '#',
      onClick: (e) => { e.preventDefault(); action.onClick && action.onClick(); },
      style: {
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--ink-faint, #8b8471)', textDecoration: 'none', whiteSpace: 'nowrap',
      }
    }, action.label)
  );
}
