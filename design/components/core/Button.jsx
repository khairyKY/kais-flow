export function Button({ variant = 'secondary', children, showDot, onClick, type = 'button', disabled }) {
  const base = {
    fontFamily: 'inherit',
    fontSize: 13,
    borderRadius: 999,
    cursor: disabled ? 'default' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    lineHeight: 1,
    opacity: disabled ? 0.5 : 1,
    transition: 'transform 120ms ease, background 150ms ease',
  };
  const styles = {
    primary: {
      ...base,
      border: 'none',
      background: 'var(--acc-terra, #B5654A)',
      color: '#fff',
      padding: '10px 18px',
      boxShadow: '0 2px 4px rgba(120,60,40,0.3)',
    },
    secondary: {
      ...base,
      border: '1px solid var(--line-solid, #cfc7b0)',
      background: 'var(--paper-bone, #F6F0E1)',
      color: 'var(--ink-body, #2a2420)',
      padding: '9px 16px',
      boxShadow: '0 1px 2px rgba(60,52,38,0.1)',
    },
    ghost: {
      ...base,
      border: 'none',
      background: 'transparent',
      color: 'var(--ink-muted, #6b6455)',
      padding: '9px 12px',
    },
  }[variant];

  return React.createElement(
    'button',
    { type, onClick, disabled, style: styles },
    showDot && React.createElement('span', {
      style: { width: 7, height: 7, borderRadius: '50%', background: variant === 'primary' ? '#fff' : 'var(--acc-terra)', display: 'inline-block' }
    }),
    children
  );
}
