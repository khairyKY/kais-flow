const NAV_STATE = { clover: 'awake', hydrangea: 'light', daisy: 'midday', cherry: 'bloom', wisteria: 'p60', fern: 'unfurl2', vine: 'flowering' };
const TAPE = {
  terra: 'rgba(181,101,74,0.32)', sage: 'rgba(138,154,126,0.4)',
  blossom: 'rgba(212,168,176,0.4)', gold: 'rgba(201,165,90,0.5)',
};

export function NavItem({ species, label, href = '#', active, count, activeTape = 'terra' }) {
  const base = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 10px', borderRadius: 6,
    textDecoration: 'none', position: 'relative',
    color: active ? 'var(--ink-body, #2a2420)' : 'var(--ink-muted, #6b6455)',
    fontWeight: active ? 600 : 400, fontSize: 14.5,
  };
  const activeStyle = active ? {
    background: 'var(--paper-parchment, #FBF6E9)',
    border: '1px solid var(--line-card, #e0d8c2)',
    boxShadow: '0 1px 2px rgba(60,52,38,0.14),0 4px 10px rgba(60,52,38,0.08)',
    transform: 'rotate(-0.5deg)',
  } : {};
  return React.createElement(
    'a', { href, style: { ...base, ...activeStyle } },
    active && React.createElement('span', { style: {
      position: 'absolute', top: -6, right: 14, width: 34, height: 11,
      background: TAPE[activeTape],
      backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.25) 0 3px,transparent 3px 6px)',
      transform: 'rotate(3deg)', borderRadius: 1,
    }}),
    React.createElement('img', {
      src: `../assets/flowers/${species}/${NAV_STATE[species]}.png`,
      style: { width: 23, height: 23, objectFit: 'contain', flex: 'none',
               filter: 'drop-shadow(0 2px 2px rgba(60,52,38,0.18))' },
    }),
    React.createElement('span', null, label),
    count != null && React.createElement('span', {
      style: { marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace",
               fontSize: 10, color: 'var(--acc-terra, #B5654A)' }
    }, count)
  );
}
