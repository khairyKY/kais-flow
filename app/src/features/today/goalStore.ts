// Until migration 0055 the goal of the day was this device's own pick, kept in localStorage by Plan
// my day — so the phone and the computer could disagree. The goal is now the first place of Today's
// Top 3 on the rows themselves (./top3Order, tasks.top3_rank); this old pick is only read, as the
// fallback while none of the day's picks has a place yet.
const KEY = 'kf_goal_task_id'

export function legacyGoalId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null // no storage (tests, a private window)
  }
}
