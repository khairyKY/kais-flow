import { create } from 'zustand'

const KEY = 'kf_goal_task_id'

interface GoalState {
  goalTaskId: string | null
  setGoal: (id: string | null) => void
}

export const useGoalStore = create<GoalState>((set) => ({
  goalTaskId: typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY),
  setGoal: (id) => {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
    set({ goalTaskId: id })
  },
}))
