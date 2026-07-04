import { useTasks } from '../tasks/api'
import { useAllInboxItems } from '../inbox/api'
import { useLatestResurfaced, convertResurfaced, reviewLaterResurfaced, dismissResurfaced } from './api'

export function ResurfaceCard() {
  const { data: row } = useLatestResurfaced()
  const { data: tasks = [] } = useTasks()
  const { data: inboxItems = [] } = useAllInboxItems()

  if (!row || row.action !== 'pending') return null

  const title =
    row.entity_type === 'task'
      ? tasks.find((t) => t.id === row.entity_id)?.title
      : inboxItems.find((i) => i.id === row.entity_id)?.raw_text
  if (!title) return null // entity was deleted since the pick was made

  const inboxItem = row.entity_type === 'inbox_item' ? inboxItems.find((i) => i.id === row.entity_id) : undefined
  const canConvert = row.entity_type === 'inbox_item' && inboxItem && inboxItem.status !== 'filed'

  return (
    <section className="rounded border border-indigo-200 bg-indigo-50 p-3 text-sm">
      <h2 className="mb-1 text-sm font-semibold text-indigo-700">From a while ago</h2>
      <p className="mb-2">{title}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {canConvert && (
          <button
            type="button"
            onClick={() => convertResurfaced(row, inboxItem)}
            className="rounded bg-indigo-600 px-2 py-1 text-white"
          >
            Still relevant → task
          </button>
        )}
        <button type="button" onClick={() => reviewLaterResurfaced(row)} className="rounded border border-indigo-300 px-2 py-1 text-indigo-700">
          Review later
        </button>
        <button type="button" onClick={() => dismissResurfaced(row)} className="text-indigo-500">
          Dismiss
        </button>
      </div>
    </section>
  )
}
