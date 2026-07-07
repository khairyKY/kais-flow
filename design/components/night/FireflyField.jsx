export function FireflyField({ count = 12, intensity = 1, active = true }) {
  // deterministic pseudo-random positions so a re-render doesn't jump them around
  const flies = [];
  for (let i = 0; i < count; i++) {
    const seed = (i * 9301 + 49297) % 233280;
    const rx = (seed / 233280);
    const ry = ((seed * 3) % 233280) / 233280;
    const rd = 6 + ((seed * 7) % 5);        // duration 6–10s
    const rdelay = -((seed * 5) % 9);       // negative delay staggers loops
    const rsize = 3 + ((seed * 11) % 3);    // 3–5px core
    flies.push(React.createElement('span', {
      key: i,
      style: {
        position: 'absolute',
        left: `${rx * 100}%`, top: `${ry * 100}%`,
        width: rsize, height: rsize, borderRadius: '50%',
        background: '#F6E28C',
        boxShadow: `0 0 ${8 * intensity}px rgba(246,226,140,0.9), 0 0 ${20 * intensity}px rgba(246,226,140,0.45)`,
        animation: active ? `fireflyDrift ${rd}s ease-in-out ${rdelay}s infinite` : 'none',
        pointerEvents: 'none',
      }
    }));
  }
  return React.createElement('div', {
    'aria-hidden': true,
    style: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }
  }, flies);
}
