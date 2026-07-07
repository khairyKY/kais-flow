export function Card({ children, tilt = 0, tone = 'parchment', padding = 'md', style }) {
  const pads = { sm: '12px 14px', md: '18px 20px', lg: '22px 28px' };
  const tones = {
    parchment: { background: 'var(--paper-parchment, #FBF6E9)', border: '1px solid var(--line-card, #e0d8c2)', boxShadow: '0 1px 2px rgba(60,52,38,0.12), 0 5px 12px rgba(60,52,38,0.08)' },
    bone:      { background: 'var(--paper-bone, #F6F0E1)',      border: '1px solid var(--line-solid, #cfc7b0)', boxShadow: '0 1px 2px rgba(60,52,38,0.1)' },
    goal:      { background: 'var(--paper-goal, #F8EFD3)',      border: '1px solid var(--line-goal, #dcc48e)', boxShadow: '0 1px 2px rgba(60,52,38,0.14), 0 8px 20px rgba(154,123,58,0.14)' },
    flat:      { background: 'var(--paper-parchment, #FBF6E9)', border: '1px solid var(--line-card, #e0d8c2)', boxShadow: 'none' },
  };
  return React.createElement(
    'div',
    { style: {
        position: 'relative', borderRadius: 3, padding: pads[padding],
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        ...tones[tone], ...style,
    } },
    children
  );
}
