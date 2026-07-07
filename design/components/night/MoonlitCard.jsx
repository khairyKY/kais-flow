export function MoonlitCard({ children, tilt = 0, padding = 'md', firefly, style }) {
  const pads = { sm: '12px 14px', md: '18px 22px', lg: '24px 28px' };
  return React.createElement('div', {
    style: {
      position: 'relative', borderRadius: 3,
      padding: pads[padding],
      background: 'linear-gradient(180deg,rgba(240,236,220,0.09) 0%,rgba(240,236,220,0.05) 100%)',
      border: '1px solid rgba(220,214,190,0.18)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      boxShadow: 'inset 0 1px 0 rgba(255,245,210,0.09), 0 12px 40px rgba(0,0,0,0.35)',
      transform: tilt ? `rotate(${tilt}deg)` : undefined,
      color: 'rgba(245,240,220,0.92)',
      ...style,
    }
  },
    firefly && React.createElement('span', {
      style: {
        position: 'absolute', top: -3, right: 18,
        width: 5, height: 5, borderRadius: '50%',
        background: '#F6E28C',
        boxShadow: '0 0 10px rgba(246,226,140,0.9),0 0 22px rgba(246,226,140,0.45)',
        animation: 'fireflyDrift 7s ease-in-out infinite',
      }
    }),
    children
  );
}
