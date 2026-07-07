export function Checkbox({ checked, onChange, variant = 'default' }) {
  const size = variant === 'goal' ? 19 : 17;
  const style = {
    width: size, height: size, flex: 'none', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    borderRadius: 5,
    transition: 'background 150ms ease, border-color 150ms ease',
    ...(checked
      ? { background: 'var(--sig-done, #2a2420)', border: '1.5px solid var(--sig-done, #2a2420)', color: '#F4F1EA', fontSize: 11 }
      : { background: variant === 'goal' ? 'rgba(255,255,255,0.5)' : 'transparent',
          border: variant === 'goal' ? '1.5px solid var(--acc-gold, #9a7b3a)' : '1.5px solid var(--line-solid, #bfb8a3)',
          color: 'transparent' }
    ),
  };
  return React.createElement(
    'span',
    { role: 'checkbox', 'aria-checked': !!checked, style, onClick: () => onChange && onChange(!checked) },
    checked ? '✓' : ''
  );
}
