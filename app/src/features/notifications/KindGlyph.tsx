import { Icon } from '../../components/Icon'
import { KIND_LOOK, type KindId } from './kinds'

/** A kind's glyph in its tinted disc — the same mark in Settings and in the history. */
export function KindGlyph({ kind, size = 30, grouped = false }: { kind: KindId; size?: number; grouped?: boolean }) {
  const k = KIND_LOOK[kind]
  return (
    <span style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: k.tint, color: k.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={grouped ? 'bell' : k.icon} size={Math.round(size * 0.55)} />
    </span>
  )
}
