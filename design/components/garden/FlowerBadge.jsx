const DEFAULT_STATE = {
  clover: 'awake', hydrangea: 'light', daisy: 'midday', cherry: 'bloom',
  wisteria: 'p60', fern: 'unfurl2', vine: 'flowering',
};

export function FlowerBadge({ species, state, size = 28, label }) {
  const s = state || DEFAULT_STATE[species] || 'default';
  return React.createElement('img', {
    src: `../assets/flowers/${species}/${s}.png`,
    alt: label || `${species} ${s}`,
    title: label,
    style: {
      width: size, height: size, objectFit: 'contain',
      filter: 'drop-shadow(0 2px 2px rgba(60,52,38,0.18))',
      flex: 'none',
    },
  });
}
