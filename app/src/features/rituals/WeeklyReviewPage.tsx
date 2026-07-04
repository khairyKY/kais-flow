import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useTasks } from '../tasks/api'
import { useRoutines, useRoutineCompletions } from '../routines/api'
import { computeStreak } from '../routines/streaks'
import { useSlipping, markReviewed } from '../slipping/api'

export function WeeklyReviewPage() {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: tasks = [] } = useTasks()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: slipping = [] } = useSlipping()

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Weekly Review</h1>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-500">Per-domain sweep</h2>
        {domains.length === 0 ? (
          <p className="text-sm text-slate-400">No domains yet.</p>
        ) : (
          <ul className="space-y-1">
            {domains.map((d) => {
              const domainProjects = projects.filter((p) => p.domain_id === d.id)
              const openTasks = tasks.filter((t) => t.domain_id === d.id && t.status === 'todo')
              return (
                <li key={d.id} className="rounded border p-2 text-sm">
                  <span className="font-medium">{d.name}</span> — {domainProjects.length} project(s),{' '}
                  {openTasks.length} open task(s)
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-amber-600">Slipping</h2>
        {slipping.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing slipping.</p>
        ) : (
          <ul className="space-y-1">
            {slipping.map((row) => (
              <li
                key={`${row.entity_type}-${row.entity_id}`}
                className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm"
              >
                <span className="flex-1">
                  {row.entity_name} — {Math.floor(row.days_since)}d untouched
                </span>
                <button type="button" onClick={() => markReviewed(row)} className="text-xs text-amber-700 underline">
                  reviewed
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-500">Streaks</h2>
        {routines.filter((r) => r.active).length === 0 ? (
          <p className="text-sm text-slate-400">No routines yet.</p>
        ) : (
          <ul className="space-y-1">
            {routines
              .filter((r) => r.active)
              .map((r) => {
                const dates = completions.filter((c) => c.routine_id === r.id).map((c) => c.completed_on)
                const { current, best } = computeStreak(dates, r.cadence)
                return (
                  <li key={r.id} className="rounded border p-2 text-sm">
                    {r.name} — 🔥 {current} current, best {best}
                  </li>
                )
              })}
          </ul>
        )}
      </section>
    </div>
  )
}
