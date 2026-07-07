export function Chip({ children, variant = 'bordered', dot }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '4px 7px', borderRadius: 3, lineHeight: 1.2,
  };
  const variants = {
    filled:   { ...base, background: 'var(--acc-terra, #B5654A)', color: '#fff', fontSize: 11, padding: '5px 9px', borderRadius: 999, letterSpacing: '0.02em', textTransform: 'none', fontFamily: "'Inter Tight', sans-serif" },
    bordered: { ...base, border: '1px solid var(--line-solid, #cfc7b0)', color: 'var(--ink-muted, #6b6455)' },
    faint:    { ...base, color: 'var(--ink-faint, #8b8471)', padding: '4px 5px' },
  }[variant];
  return React.createElement(
    'span',
    { style: variants },
    dot && React.createElement('span', { style: { width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block' }}),
    children
  );
}
