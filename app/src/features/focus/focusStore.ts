import { useEffect } from 'react'
import { create } from 'zustand'
import { logTimeEntry } from '../projects/api'
import { queryClient } from '../../lib/queryClient'
import { playSound } from '../../lib/sounds'

// R4-D3 (Kai's 2026-07-20 ruling): Focus needs "multiple ways to enter it" — a Focus action on
// a task's full-page detail, and a *mini* pomodoro that rides next to the task so he can stay on
// the task view. That only works if the timer outlives the Focus page, so the whole session
// lives here instead of in FocusPage's local state, and one ticker (mounted in the shell) drives
// it wherever the user navigates.

export interface FocusSettings {
  focusRoundMin: number
  shortBreakMin: number
  longBreakMin: number
  roundsBeforeLongBreak: number
  // R4-18: these two had toggles in the settings sheet but nothing ever read them —
  // dead controls. tick() now honors both.
  autoStartNextRound: boolean
  autoStartBreaks: boolean
  gentleChime: boolean
  gardenViewOnLongBreaks: boolean
}

export const DEFAULT_SETTINGS: FocusSettings = {
  focusRoundMin: 25,
  shortBreakMin: 5,
  longBreakMin: 20,
  roundsBeforeLongBreak: 4,
  autoStartNextRound: true,
  autoStartBreaks: true,
  gentleChime: false,
  gardenViewOnLongBreaks: true,
}

const SETTINGS_KEY = 'kf_focus_settings'

function loadSettings(): FocusSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    // Spread over defaults so a settings object saved before a field existed still boots.
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export type FocusMode = 'pomodoro' | 'break' | 'stopwatch' | 'garden'

interface FocusTask {
  id: string
  project_id: string | null
}

interface FocusState {
  settings: FocusSettings
  mode: FocusMode
  isRunning: boolean
  secondsLeft: number
  stopwatchSeconds: number
  stopwatchStartIso: string
  stopwatchStartStr: string
  currentRound: number
  breakType: 'short' | 'long'
  activeTask: FocusTask | null
  pomodoroStartIso: string | null

  saveSettings: (s: FocusSettings) => void
  setMode: (m: FocusMode) => void
  setActiveTask: (t: FocusTask | null) => void
  togglePlay: () => void
  addFiveMinutes: () => void
  resetRound: () => void
  tick: () => void
}

export const useFocusStore = create<FocusState>((set, get) => ({
  settings: loadSettings(),
  mode: 'pomodoro',
  isRunning: false,
  secondsLeft: loadSettings().focusRoundMin * 60,
  stopwatchSeconds: 0,
  stopwatchStartIso: '',
  // Punch 52: seeded '9:41' — the export's sample clock — so a stopwatch that had never run
  // still claimed a start time. Empty until an actual start stamps it.
  stopwatchStartStr: '',
  currentRound: 1,
  breakType: 'short',
  activeTask: null,
  pomodoroStartIso: null,

  saveSettings: (next) => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    } catch {
      /* private mode */
    }
    const { isRunning, mode } = get()
    set({
      settings: next,
      // An idle pomodoro adopts a new round length immediately; a running one isn't yanked.
      ...(!isRunning && mode === 'pomodoro' ? { secondsLeft: next.focusRoundMin * 60 } : {}),
    })
  },

  setMode: (mode) => {
    const { settings } = get()
    set({
      mode,
      isRunning: false,
      secondsLeft: mode === 'pomodoro' ? settings.focusRoundMin * 60 : mode === 'break' ? settings.shortBreakMin * 60 : 0,
    })
  },

  setActiveTask: (activeTask) => set({ activeTask }),

  togglePlay: () => {
    const { isRunning, mode, pomodoroStartIso, stopwatchSeconds } = get()
    if (!isRunning) {
      const now = new Date()
      if (mode === 'pomodoro' && !pomodoroStartIso) set({ pomodoroStartIso: now.toISOString() })
      if (mode === 'stopwatch' && stopwatchSeconds === 0) {
        set({
          stopwatchStartIso: now.toISOString(),
          stopwatchStartStr: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }),
        })
      }
    }
    set({ isRunning: !isRunning })
  },

  addFiveMinutes: () => set((s) => ({ secondsLeft: s.secondsLeft + 5 * 60 })),

  resetRound: () => {
    const { settings, mode } = get()
    set({
      isRunning: false,
      pomodoroStartIso: null,
      secondsLeft: mode === 'pomodoro' ? settings.focusRoundMin * 60 : get().secondsLeft,
    })
  },

  tick: () => {
    const s = get()
    if (!s.isRunning) return

    if (s.mode === 'stopwatch') {
      set({ stopwatchSeconds: s.stopwatchSeconds + 1 })
      return
    }

    if (s.secondsLeft > 1) {
      set({ secondsLeft: s.secondsLeft - 1 })
      return
    }

    // ── the round just ran out ──
    if (s.mode === 'pomodoro') {
      if (s.activeTask) {
        const start = s.pomodoroStartIso || new Date(Date.now() - s.settings.focusRoundMin * 60_000).toISOString()
        logTimeEntry(s.activeTask.project_id, s.activeTask.id, 'Pomodoro round completed', s.settings.focusRoundMin, start)
        queryClient.invalidateQueries({ queryKey: ['time_entries'] })
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      }
      // Punch 52: this used to `new Audio('/ds/assets/chime.mp3')` — a file that never existed
      // in the build, so the round-end chime was silent no matter what. It now goes through the
      // synthesised sound engine. Called unconditionally on purpose: playSound owns the master
      // toggle, the per-sound toggle, volume and quiet hours, so a check here would double-gate.
      playSound('distant_chime')

      const long = s.currentRound >= s.settings.roundsBeforeLongBreak
      const toGarden = long && s.settings.gardenViewOnLongBreaks
      set({
        // The garden view is a place to rest, not a countdown — never auto-run into it.
        isRunning: s.settings.autoStartBreaks && !toGarden,
        pomodoroStartIso: null,
        breakType: long ? 'long' : 'short',
        mode: toGarden ? 'garden' : 'break',
        secondsLeft: (long ? s.settings.longBreakMin : s.settings.shortBreakMin) * 60,
      })
      return
    }

    // break → back to a fresh focus round, advancing the round counter
    set({
      isRunning: s.settings.autoStartNextRound,
      mode: 'pomodoro',
      secondsLeft: s.settings.focusRoundMin * 60,
      currentRound: s.currentRound >= s.settings.roundsBeforeLongBreak ? 1 : s.currentRound + 1,
    })
  },
}))

/** Mounted once in the shell so a running session keeps ticking across route changes. */
export function useFocusTicker(): void {
  const isRunning = useFocusStore((s) => s.isRunning)
  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => useFocusStore.getState().tick(), 1000)
    return () => clearInterval(id)
  }, [isRunning])
}
