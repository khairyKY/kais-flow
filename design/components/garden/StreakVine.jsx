export function StreakVine({ days, labels, highlightLast = true }) {
  return React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end' } },
    days.map((state, i) => {
      const isLast = i === days.length - 1;
      return React.createElement('div', {
        key: i,
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                 padding: '6px 4px', borderRadius: 4,
                 background: highlightLast && isLast ? 'rgba(154,123,58,0.1)' : 'transparent',
                 border: highlightLast && isLast ? '1px dashed var(--line-goal, #dcc48e)' : '1px solid transparent' }
      },
        React.createElement('img', {
          src: `../assets/flowers/vine/${state}.png`,
          style: { width: 30, height: 30, objectFit: 'contain',
                   filter: 'drop-shadow(0 2px 2px rgba(60,52,38,0.18))' },
        }),
        labels && labels[i] && React.createElement('span', {
          style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 9,
                   letterSpacing: '0.14em', textTransform: 'uppercase',
                   color: isLast ? 'var(--ink-body)' : 'var(--ink-faint, #8b8471)' }
        }, labels[i])
      );
    })
  );
}
