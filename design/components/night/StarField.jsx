export function StarField({ count = 60, moon = { x: '82%', y: '14%' } }) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    const s = (i * 1301 + 4297) % 233280;
    const rx = s / 233280;
    const ry = ((s * 7) % 233280) / 233280;
    const size = ((s * 3) % 100) < 8 ? 2.5 : ((s * 3) % 100) < 40 ? 1.6 : 1;
    const dur = 3 + ((s * 11) % 5);
    const delay = -((s * 13) % 6);
    stars.push(React.createElement('span', {
      key: i,
      style: {
        position: 'absolute', left: `${rx * 100}%`, top: `${ry * 60}%`,
        width: size, height: size, borderRadius: '50%',
        background: 'rgba(255,250,230,0.9)',
        boxShadow: size > 1.5 ? '0 0 4px rgba(255,250,230,0.7)' : 'none',
        animation: `twinkle ${dur}s ease-in-out ${delay}s infinite`,
      }
    }));
  }
  return React.createElement('div', {
    'aria-hidden': true,
    style: {
      position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
      background: 'radial-gradient(ellipse at 30% 0%,#1F2D5C 0%,#142147 40%,#0B1330 100%)',
    }
  },
    moon && React.createElement('span', {
      style: {
        position: 'absolute', left: moon.x, top: moon.y,
        width: 130, height: 130, borderRadius: '50%',
        background: 'radial-gradient(circle,rgba(255,245,210,0.28) 0%,rgba(255,245,210,0.12) 40%,transparent 70%)',
        filter: 'blur(2px)',
      }
    }),
    stars
  );
}
