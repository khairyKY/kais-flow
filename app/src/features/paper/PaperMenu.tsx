import { ActionSheet } from '../../components/ActionSheet'
import { useIsMobile } from '../../components/BottomSheet'
import { ContextMenu } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'

// A ⋯ menu in Paper capture — a line's, the page's, the Inbox's ready row: the action sheet on a phone
// (MK Action Sheet), the context menu on desktop (the ⋯ button or a right-click), the same rows in both.

export interface PaperMenuItem {
  label: string
  icon?: IconName
  /** Quiet words on the right ("to do", "stays in the Inbox"). */
  hint?: string
  /** Desktop: its key ("⏎", "⌫", "T"). */
  shortcut?: string
  danger?: boolean
  /** Opens a second picker. */
  chevron?: boolean
  run: () => void
}

export function PaperMenu({ title, meta, at, items, onClose }: { title: string; meta?: string; at: { x: number; y: number }; items: PaperMenuItem[]; onClose: () => void }) {
  const isMobile = useIsMobile()
  return isMobile ? (
    <ActionSheet title={title} meta={meta} onClose={onClose} items={items.map((i) => ({ label: i.label, icon: i.icon && <Icon name={i.icon} size={24} />, hint: i.hint, destructive: i.danger, chevron: i.chevron, onSelect: i.run }))} />
  ) : (
    <ContextMenu position={at} onClose={onClose} label={title} items={items.map((i) => ({ label: i.label, icon: i.icon && <Icon name={i.icon} size={16} />, hint: i.hint, shortcut: i.shortcut, danger: i.danger, onClick: i.run }))} />
  )
}
