const TAPE_COLORS = {
  sage:        'rgba(138,154,126,0.4)',
  blossom:     'rgba(212,168,176,0.4)',
  lavender:    'rgba(168,160,190,0.4)',
  hydrangea:   'rgba(154,180,190,0.4)',
  clover:      'rgba(201,160,160,0.4)',
  gold:        'rgba(201,165,90,0.5)',
  moss:        'rgba(122,148,110,0.4)',
  buttercream: 'rgba(212,199,138,0.5)',
};

export function Tape({ color = 'sage', position = 'top-center', width = 72, tilt }) {
  const bg = TAPE_COLORS[color] || TAPE_COLORS.sage;
  const rot = tilt ?? (position.includes('left') ? -2 : position.includes('right') ? 2.5 : -1.5);
  const base = {
    position: 'absolute',
    top: -9,
    width,
    height: 16,
    background: bg,
    backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)',
    transform: `rotate(${rot}deg)`,
    borderRadius: 1,
    boxShadow: '0 1px 2px rgba(60,52,38,0.12)',
    pointerEvents: 'none',
  };
  const positioned = {
    'top-center':    { left: '50%', marginLeft: -width / 2 },
    'top-left':      { left: 20 },
    'top-right':     { right: 20 },
    'top-off-left':  { left: 12, top: -7 },
    'top-off-right': { right: 12, top: -7 },
  }[position];
  return React.createElement('span', { style: { ...base, ...positioned } });
}
