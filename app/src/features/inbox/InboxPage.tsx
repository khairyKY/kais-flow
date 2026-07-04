import { useState } from 'react'
import { usePendingInboxItems, fileToTask, dismissInboxItem } from './api'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import type { InboxItem } from '../../lib/types'

interface AiParse {
  kind?: string
  cleaned_text?: string
  confidence?: number
  domain_id?: string | null
  project_id?: string | null
}

function TriageRow({ item }: { item: InboxItem }) {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const parse = item.ai_parse as AiParse | null
  const [domainId, setDomainId] = useState(parse?.domain_id ?? '')
  const [projectId, setProjectId] = useState(parse?.project_id ?? '')

  return (
    <li className="space-y-2 rounded border p-2 text-sm">
      <p>{item.raw_text}</p>
      {parse && (
        <p className="text-xs text-slate-500">
          AI suggested: <span className="font-medium">{parse.kind}</span>
          {parse.cleaned_text && parse.cleaned_text !== item.raw_text && ` — "${parse.cleaned_text}"`}
          {typeof parse.confidence === 'number' && ` (${Math.round(parse.confidence * 100)}% confident)`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="rounded border px-1 py-1 text-xs">
          <option value="">no domain</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded border px-1 py-1 text-xs">
          <option value="">no project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => fileToTask(item, { domainId: domainId || null, projectId: projectId || null })}
          className="rounded bg-slate-900 px-2 py-1 text-xs text-white"
        >
          File as task
        </button>
        <button type="button" onClick={() => dismissInboxItem(item)} className="text-xs text-slate-500">
          Dismiss
        </button>
      </div>
    </li>
  )
}

export function InboxPage() {
  const { data: items = [] } = usePendingInboxItems()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <VoiceCaptureButton />
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Inbox zero. Captures land here when the command bar can't tell where they go.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <TriageRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}
