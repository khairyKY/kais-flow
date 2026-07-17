import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useTasks, completeTask } from '../tasks/api'
import { useProjects } from '../projects/api'
import { useRoutines, useRoutineCompletions } from '../routines/api'
import { computeStreak, localDateKey } from '../routines/streaks'
import { useJournalEntries } from '../journal/api'
import { useTimeEntries, logTimeEntry } from './api'
import { useMotionEnabled } from '../../lib/motion'
import { hydrangeaAsset, daisyAsset } from '../../lib/gardenAssets'
import type { ActivityLogEntry } from '../../lib/types'
import './FocusPage.css'

interface FocusSettings {
  focusRoundMin: number
  shortBreakMin: number
  longBreakMin: number
  roundsBeforeLongBreak: number
  autoStartNextRound: boolean
  autoStartBreaks: boolean
  gardenViewOnLongBreaks: boolean
  gentleChime: boolean
}

const SETTINGS_KEY = 'kf_focus_settings'

const DEFAULT_SETTINGS: FocusSettings = {
  focusRoundMin: 25,
  shortBreakMin: 5,
  longBreakMin: 20,
  roundsBeforeLongBreak: 4,
  autoStartNextRound: true,
  autoStartBreaks: true,
  gardenViewOnLongBreaks: true,
  gentleChime: false,
}

const GearIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.6v2.4M12 19v2.4M4.4 7.2l2.1 1.2M17.5 15.6l2.1 1.2M4.4 16.8l2.1-1.2M17.5 8.4l2.1-1.2" />
  </svg>
)

export function FocusPage() {
  const queryClient = useQueryClient()
  const motionOn = useMotionEnabled()

  // 1. Data queries
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: timeEntries = [] } = useTimeEntries()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: journalEntries = [] } = useJournalEntries()

  const { data: activityLogs = [] } = useQuery<ActivityLogEntry[]>({
    queryKey: ['activity_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ActivityLogEntry[]
    },
  })

  // 2. Settings state
  const [settings, setSettings] = useState<FocusSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      return stored ? JSON.parse(stored) : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  const saveSettings = (newSettings: FocusSettings) => {
    setSettings(newSettings)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
    } catch (e) {
      /* private mode */
    }
  }

  // 3. Focus session state
  const [mode, setMode] = useState<'pomodoro' | 'break' | 'stopwatch' | 'garden'>('pomodoro')
  const [isRunning, setIsRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(settings.focusRoundMin * 60)
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0)
  const [stopwatchStartIso, setStopwatchStartIso] = useState('')
  const [stopwatchStartStr, setStopwatchStartStr] = useState('9:41')
  const [currentRound, setCurrentRound] = useState(2) // Defaults to 2 to match option 1a "round 2 of 4"
  const [breakType, setBreakType] = useState<'short' | 'long'>('short')
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)

  // Active task selection
  const activeTask = useMemo(() => {
    if (activeTaskId) {
      return tasks.find((t) => t.id === activeTaskId && t.status === 'todo') || null
    }
    // Default to first starred task due/scheduled today, or any starred task
    return tasks.find((t) => t.top3 && t.status === 'todo') || tasks.find((t) => t.status === 'todo') || null
  }, [tasks, activeTaskId])

  // Project linked to active task
  const activeProject = useMemo(() => {
    if (!activeTask) return null
    return projects.find((p) => p.id === activeTask.project_id) || null
  }, [projects, activeTask])

  // Start time ISO for the current Pomodoro round
  const [pomodoroStartIso, setPomodoroStartIso] = useState<string | null>(null)

  // Reset timer if settings change
  useEffect(() => {
    if (!isRunning && mode === 'pomodoro') {
      setSecondsLeft(settings.focusRoundMin * 60)
    }
  }, [settings.focusRoundMin, mode])

  // Live timer tick
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      if (mode === 'pomodoro') {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            setIsRunning(false)
            
            // Log completed time entry
            if (activeTask) {
              const start = pomodoroStartIso || new Date(Date.now() - settings.focusRoundMin * 60 * 1000).toISOString()
              logTimeEntry(
                activeTask.project_id,
                activeTask.id,
                'Pomodoro round completed',
                settings.focusRoundMin,
                start
              )
              queryClient.invalidateQueries({ queryKey: ['time_entries'] })
              queryClient.invalidateQueries({ queryKey: ['projects'] })
            }

            // Chime / alert at round end
            if (settings.gentleChime) {
              try {
                const audio = new Audio('/ds/assets/chime.mp3')
                audio.play()
              } catch (e) {
                console.log('Chime!')
              }
            }

            // Switch to break
            if (currentRound >= settings.roundsBeforeLongBreak) {
              setMode('break')
              setBreakType('long')
              setSecondsLeft(settings.longBreakMin * 60)
              if (settings.gardenViewOnLongBreaks) {
                setMode('garden')
              }
            } else {
              setMode('break')
              setBreakType('short')
              setSecondsLeft(settings.shortBreakMin * 60)
            }
            return 0
          }
          return prev - 1
        })
      } else if (mode === 'break') {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            setIsRunning(false)
            
            // Switch back to Focus
            setMode('pomodoro')
            setSecondsLeft(settings.focusRoundMin * 60)
            setCurrentRound((r) => (r >= settings.roundsBeforeLongBreak ? 1 : r + 1))
            return 0
          }
          return prev - 1
        })
      } else if (mode === 'stopwatch') {
        setStopwatchSeconds((prev) => prev + 1)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, mode, settings, currentRound, activeTask, pomodoroStartIso, queryClient])

  // Handle Play/Pause toggle
  const togglePlay = () => {
    if (!isRunning) {
      const now = new Date()
      if (mode === 'pomodoro') {
        if (!pomodoroStartIso) {
          setPomodoroStartIso(now.toISOString())
        }
      } else if (mode === 'stopwatch') {
        if (stopwatchSeconds === 0) {
          setStopwatchStartIso(now.toISOString())
          setStopwatchStartStr(
            now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })
          )
        }
      }
    }
    setIsRunning(!isRunning)
  }

  // Handle "+5 min"
  const addFiveMinutes = () => {
    setSecondsLeft((prev) => prev + 5 * 60)
  }

  // Handle Check Off
  const handleCheckOff = () => {
    if (!activeTask) return

    // If pomodoro timer is active, compute elapsed minutes and log them as partial work
    if (mode === 'pomodoro' && isRunning) {
      const elapsedSec = settings.focusRoundMin * 60 - secondsLeft
      const elapsedMin = Math.ceil(elapsedSec / 60)
      if (elapsedMin > 0) {
        logTimeEntry(
          activeTask.project_id,
          activeTask.id,
          'Focused block (task completed)',
          elapsedMin,
          pomodoroStartIso || new Date().toISOString()
        )
      }
    }

    completeTask(activeTask)
    setIsRunning(false)
    setPomodoroStartIso(null)
    if (mode === 'pomodoro') {
      setSecondsLeft(settings.focusRoundMin * 60)
    }

    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['time_entries'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  // Handle Stop & Log in Stopwatch mode
  const handleStopAndLog = () => {
    const elapsedMin = Math.round(stopwatchSeconds / 60)
    if (elapsedMin > 0 && activeTask) {
      logTimeEntry(
        activeTask.project_id,
        activeTask.id,
        noteText || 'Stopwatch session',
        elapsedMin,
        stopwatchStartIso || new Date().toISOString()
      )
    }
    setStopwatchSeconds(0)
    setIsRunning(false)
    setNoteText('')
    setStopwatchStartIso('')
    
    queryClient.invalidateQueries({ queryKey: ['time_entries'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  // Handle discard in Stopwatch mode
  const handleDiscardStopwatch = () => {
    setStopwatchSeconds(0)
    setIsRunning(false)
    setNoteText('')
    setStopwatchStartIso('')
  }

  // 4. Botanical Stage Calculations
  // Tasks (Cherry)
  const cherryData = useMemo(() => {
    const todayStr = localDateKey(new Date())
    const todayTasks = tasks.filter((t) => {
      const dueToday = t.due_at && localDateKey(new Date(t.due_at)) === todayStr
      const schedToday = t.scheduled_start && localDateKey(new Date(t.scheduled_start)) === todayStr
      const completedToday =
        t.status === 'done' && t.completed_at && localDateKey(new Date(t.completed_at)) === todayStr
      return dueToday || schedToday || completedToday || (t.top3 && t.status === 'todo')
    })
    const completedCount = todayTasks.filter((t) => t.status === 'done').length
    const totalCount = todayTasks.length

    if (totalCount === 0) return { stage: 'bud', note: 'no tasks scheduled' }

    const ratio = completedCount / totalCount
    if (ratio === 1) {
      return { stage: 'fallen', note: `${completedCount} of ${totalCount} petals fell` }
    }
    if (ratio >= 0.5) {
      return { stage: 'bloom', note: `${completedCount} of ${totalCount} tasks done` }
    }
    if (ratio > 0) {
      return { stage: 'opening', note: `${completedCount} of ${totalCount} tasks done` }
    }
    return { stage: 'bud', note: `0 of ${totalCount} tasks done` }
  }, [tasks])

  // Inbox (Hydrangea)
  const hydrangeaData = useMemo(() => {
    const pendingCount = tasks.filter((t) => t.status === 'todo' && t.area_id === null && !t.project_id).length // Inbox proxy
    const asset = hydrangeaAsset(pendingCount)
    return { stage: asset.src, note: asset.note }
  }, [tasks])

  // Calendar (Daisy)
  const daisyData = useMemo(() => {
    const hour = new Date().getHours()
    const asset = daisyAsset(hour)
    return { stage: asset.src, note: asset.note }
  }, [])

  // Routines (Vine)
  const vineData = useMemo(() => {
    const byRoutine = new Map<string, string[]>()
    for (const c of completions) {
      const arr = byRoutine.get(c.routine_id) ?? []
      arr.push(c.completed_on)
      byRoutine.set(c.routine_id, arr)
    }
    let currentStreak = 0
    for (const r of routines) {
      if (!r.active) continue
      const s = computeStreak(byRoutine.get(r.id) ?? [], r.cadence)
      currentStreak = Math.max(currentStreak, s.current)
    }
    const stage = currentStreak >= 30 ? 'lush' : currentStreak >= 7 ? 'flowering' : currentStreak >= 1 ? 'sprouting' : 'bare'
    return {
      stage,
      streak: currentStreak,
      note: currentStreak > 0 ? `day ${currentStreak} — kept again` : 'bare streak',
    }
  }, [routines, completions])

  // Journal (Fern)
  const fernData = useMemo(() => {
    const todayStr = localDateKey(new Date())
    const todayEntry = journalEntries.find((e) => e.entry_date === todayStr)
    const wordCount = todayEntry ? todayEntry.body.trim().split(/\s+/).filter(Boolean).length : 0

    let stage = 'coil'
    if (wordCount > 400) stage = 'unfurl2'
    else if (wordCount > 100) stage = 'unfurl1'

    return { stage, note: wordCount > 0 ? `${wordCount} words tonight` : 'unwritten journal' }
  }, [journalEntries])

  // Projects (Wisteria)
  const wisteriaData = useMemo(() => {
    const proj = activeProject || projects[0]
    if (!proj) return { stage: 'p0', note: 'no projects' }

    const milestones = proj.milestones || []
    if (milestones.length === 0) return { stage: 'p0', note: `${proj.name} — 0%` }

    const completed = milestones.filter((m) => m.completed).length
    const pct = Math.round((completed / milestones.length) * 100)

    let stage = 'p0'
    if (pct >= 90) stage = 'p100'
    else if (pct >= 70) stage = 'p80'
    else if (pct >= 50) stage = 'p60'
    else if (pct >= 30) stage = 'p40'
    else if (pct >= 10) stage = 'p20'

    return { stage, percent: pct, note: `climbing — ${pct}%` }
  }, [activeProject, projects])

  // Clover / People
  const cloverData = useMemo(() => {
    // Clover is resting in focus mode or garden dusk mode
    return { stage: 'resting', note: 'folded for the night' }
  }, [])

  // 5. Stat metrics for Dusk Garden View
  const stats = useMemo(() => {
    const todayStr = localDateKey(new Date())
    const completedToday = tasks.filter(
      (t) => t.status === 'done' && t.completed_at && localDateKey(new Date(t.completed_at)) === todayStr
    ).length

    const todayEntries = timeEntries.filter((e) => localDateKey(new Date(e.started_at)) === todayStr)
    const totalMin = todayEntries.reduce((sum, e) => sum + e.duration_min, 0)
    const hrs = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    const timeText = hrs > 0 ? `${hrs}h ${mins}m kept` : `${mins}m kept`

    const firstLog = activityLogs.length > 0 ? new Date(activityLogs[0].created_at) : new Date()
    const daysCount = Math.max(1, Math.ceil((Date.now() - firstLog.getTime()) / 86400000))

    return {
      completedToday,
      timeText,
      daysCount,
    }
  }, [tasks, timeEntries, activityLogs])

  // Rhythm preview calculation for Settings
  const rhythmPreviewData = useMemo(() => {
    const totalMin =
      settings.focusRoundMin * settings.roundsBeforeLongBreak +
      settings.shortBreakMin * (settings.roundsBeforeLongBreak - 1) +
      settings.longBreakMin
    const hrs = Math.floor(totalMin / 60)
    const mins = totalMin % 60
    return {
      totalMin,
      text: `${hrs > 0 ? `${hrs}h ` : ''}${mins}m per cycle`,
    }
  }, [settings])

  // Format MM:SS for countdown timers
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Format Stopwatch time
  const formatStopwatch = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Dynamic coordinates for Cherry Bud marker on Pomodoro circle
  const progressRatio = secondsLeft / (settings.focusRoundMin * 60)
  const angle = -Math.PI / 2 + 2 * Math.PI * (1 - progressRatio)
  const budX = 160 + 146 * Math.cos(angle)
  const budY = 160 + 146 * Math.sin(angle)

  // Dynamic coordinates for Break circle
  const breakTotalSeconds = (breakType === 'short' ? settings.shortBreakMin : settings.longBreakMin) * 60
  const breakRatio = secondsLeft / breakTotalSeconds
  const breakDashoffset = 528 * (1 - breakRatio)

  // Stopwatch live hours projection calculation
  const stopwatchProjectedHours = useMemo(() => {
    if (!activeProject) return { before: 11.5, after: 12.1 }
    // Get all time entries for active project
    const projectEntries = timeEntries.filter((e) => e.project_id === activeProject.id)
    const totalMinutes = projectEntries.reduce((sum, e) => sum + e.duration_min, 0)
    const beforeHours = parseFloat((totalMinutes / 60).toFixed(1))
    const afterHours = parseFloat(((totalMinutes + stopwatchSeconds / 60) / 60).toFixed(1))
    return { before: beforeHours, after: afterHours }
  }, [activeProject, timeEntries, stopwatchSeconds])

  // Select task from list
  const handleSelectTask = (taskId: string) => {
    setActiveTaskId(taskId)
    setTaskPickerOpen(false)
  }

  // Render Dusk Garden View (Option 1b)
  if (mode === 'garden') {
    const weekdayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--paper-linen)', zIndex: 30 }}>
        {/* Ambient pollen motes */}
        {motionOn && (
          <>
            <span className="mote" style={{ left: '24%', animationDelay: '2s' }}></span>
            <span className="mote" style={{ left: '60%', animationDelay: '5s', width: 3, height: 3 }}></span>
            <span className="mote" style={{ left: '84%', animationDelay: '0.8s' }}></span>
            <span className="petal" style={{ left: '14%', animationDelay: '0s', animationDuration: '9s' }}></span>
            <span className="petal" style={{ left: '30%', animationDelay: '3.2s', animationDuration: '10.5s', width: 9, height: 7 }}></span>
            <span className="petal" style={{ left: '47%', animationDelay: '6.4s', animationDuration: '8.8s' }}></span>
            <span className="petal" style={{ left: '71%', animationDelay: '1.8s', animationDuration: '11s', width: 10, height: 8 }}></span>
          </>
        )}

        {/* The 7 beds */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 90px', zIndex: 10 }}>
          {/* Bed 1: Tasks */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/cherry/${cherryData.stage}.png`} alt="" style={{ height: 150, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(-1.2deg)' }}>
              {cherryData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Tasks</div>
          </div>

          {/* Bed 2: Inbox */}
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <span className="focus-bloom-glow-slow" style={{ position: 'absolute', left: '50%', bottom: 40, width: 110, height: 110, transform: 'translateX(-50%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,165,90,0.35), rgba(201,165,90,0) 70%)', pointerEvents: 'none' }}></span>
            <img className="focus-sway" src={`/ds/assets/hydrangea/${hydrangeaData.stage}.png`} alt="" style={{ height: 120, animationDelay: '1.4s', filter: 'var(--shadow-drop-sm)', position: 'relative' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(0.8deg)' }}>
              {hydrangeaData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Inbox</div>
          </div>

          {/* Bed 3: Calendar */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/daisy/${daisyData.stage}.png`} alt="" style={{ height: 118, animationDelay: '2.8s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(-0.8deg)' }}>
              {daisyData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Calendar</div>
          </div>

          {/* Bed 4: Routines */}
          <div style={{ textAlign: 'center', position: 'relative' }}>
            <img className="focus-sway" src={`/ds/assets/vine/${vineData.stage}.png`} alt="" style={{ height: 140, animationDelay: '0.9s', filter: 'var(--shadow-drop-sm)' }} />
            <span className="focus-dew-glint" style={{ position: 'absolute', right: 8, top: 26, width: 9, height: 9, background: 'radial-gradient(circle at 40% 40%, #fff, rgba(255,255,255,0) 65%)', borderRadius: '50%' }}></span>
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(1deg)' }}>
              {vineData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Routines</div>
          </div>

          {/* Bed 5: Journal */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/fern/${fernData.stage}.png`} alt="" style={{ height: 124, animationDelay: '3.6s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(-1deg)' }}>
              {fernData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Journal</div>
          </div>

          {/* Bed 6: Projects */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/wisteria/${wisteriaData.stage}.png`} alt="" style={{ height: 136, animationDelay: '1.9s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(0.7deg)' }}>
              {wisteriaData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>Projects</div>
          </div>

          {/* Bed 7: People */}
          <div style={{ textAlign: 'center' }}>
            <img className="focus-sway" src={`/ds/assets/clover/${cloverData.stage}.png`} alt="" style={{ height: 86, animationDelay: '4.4s', filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: '#5f5a6e', marginTop: 10, transform: 'rotate(-0.6deg)' }}>
              {cloverData.note}
            </div>
            <div className="flabel" style={{ marginTop: 3, color: '#8e88a0' }}>People &amp; chat</div>
          </div>
        </div>

        {/* Soil line */}
        <span style={{ position: 'absolute', left: 60, right: 60, bottom: 118, borderBottom: '1.5px dashed rgba(90,82,110,0.5)' }}></span>

        {/* Dusk veil + vignette */}
        <span className="focus-veil-breathe" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(46,40,62,0.42), rgba(26,22,36,0.66) 85%)', mixBlendMode: 'multiply', pointerEvents: 'none' }}></span>
        <span style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 110px rgba(20,16,28,0.5)', pointerEvents: 'none' }}></span>

        {/* Fireflies above the veil */}
        {motionOn && (
          <>
            <span className="fly" style={{ left: '18%', top: '38%', animationDelay: '0s,0s' }}></span>
            <span className="fly" style={{ left: '41%', top: '30%', animationDelay: '1.7s,2.4s', width: 4, height: 4 }}></span>
            <span className="fly" style={{ left: '58%', top: '46%', animationDelay: '3.2s,1.2s' }}></span>
            <span className="fly" style={{ left: '76%', top: '33%', animationDelay: '2.4s,4s', width: 4, height: 4 }}></span>
            <span className="fly" style={{ left: '88%', top: '55%', animationDelay: '0.9s,3s' }}></span>
          </>
        )}

        <div className="grain" style={{ opacity: 0.3 }}></div>

        {/* Header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '30px 40px', zIndex: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#b8b0c8' }}>
              Your garden · day {stats.daysCount}
            </div>
            <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 38, letterSpacing: '-0.015em', color: '#f0ebdd' }}>
              {weekdayName}, closing
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999 }}>
              {stats.completedToday} task{stats.completedToday === 1 ? '' : 's'} done
            </span>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999 }}>
              {stats.timeText}
            </span>
            <span className="chip" style={{ background: 'rgba(240,235,221,0.14)', color: '#e4ddcc', border: '1px solid rgba(240,235,221,0.25)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999 }}>
              {vineData.streak}-day streak
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 40px', zIndex: 20 }}>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: '#c9c0d8', transform: 'rotate(-1deg)' }}>
            everything tended, nothing waiting ✿
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              onClick={() => setMode('pomodoro')}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a89fc0', cursor: 'pointer' }}
            >
              stay a while
            </span>
            <Link
              to="/weekly-review"
              style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13, padding: '10px 22px', borderRadius: 999, boxShadow: 'var(--shadow-cta)' }}
            >
              Close the day → evening ritual
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 6. Base Timer layout (Pomodoro / Break / Stopwatch)
  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', background: 'var(--paper-linen)', margin: '-30px -40px -64px' }}>
      <div className="grain" style={{ pointerEvents: 'none' }}></div>

      {/* Quiet top strip */}
      <div style={{ height: 46, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px', borderBottom: '1px dashed var(--line-solid)', position: 'relative', zIndex: 10 }}>
        <span className="flabel" style={{ fontSize: 10 }}>Focus · Deep work block · 9:00 – 11:00</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999 }}>
            session 2 of 3 today
          </span>
          <span className="flabel">esc leaves quietly</span>
        </div>
      </div>

      {/* Center content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10, paddingBottom: 20 }}>
        {/* Ambient pollen motes */}
        {motionOn && (
          <>
            <span className="mote" style={{ left: '16%', animationDelay: '0s' }}></span>
            <span className="mote" style={{ left: '29%', animationDelay: '3.4s', width: 3, height: 3 }}></span>
            <span className="mote" style={{ left: '72%', animationDelay: '1.6s' }}></span>
            <span className="mote" style={{ left: '86%', animationDelay: '5.2s', width: 3, height: 3 }}></span>
          </>
        )}

        {/* Mode Switcher pill and settings button */}
        {mode !== 'break' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26, position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 999, padding: 3, gap: 3 }}>
              <span
                onClick={() => {
                  setMode('pomodoro')
                  setIsRunning(false)
                  setSecondsLeft(settings.focusRoundMin * 60)
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: 999,
                  background: mode === 'pomodoro' ? 'var(--paper-parchment)' : 'none',
                  border: mode === 'pomodoro' ? '1px solid var(--line-card)' : '1px solid transparent',
                  boxShadow: mode === 'pomodoro' ? 'var(--shadow-crisp)' : 'none',
                  fontSize: 12,
                  fontWeight: mode === 'pomodoro' ? 600 : 400,
                  color: mode === 'pomodoro' ? 'var(--ink-body)' : 'var(--ink-muted)',
                  cursor: 'pointer',
                }}
              >
                Pomodoro
              </span>
              <span
                onClick={() => {
                  setMode('stopwatch')
                  setIsRunning(false)
                  setStopwatchSeconds(0)
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: 999,
                  background: mode === 'stopwatch' ? 'var(--paper-parchment)' : 'none',
                  border: mode === 'stopwatch' ? '1px solid var(--line-card)' : '1px solid transparent',
                  boxShadow: mode === 'stopwatch' ? 'var(--shadow-crisp)' : 'none',
                  fontSize: 12,
                  fontWeight: mode === 'stopwatch' ? 600 : 400,
                  color: mode === 'stopwatch' ? 'var(--ink-body)' : 'var(--ink-muted)',
                  cursor: 'pointer',
                }}
              >
                Stopwatch
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {mode === 'pomodoro' && (
                <>
                  {Array.from({ length: settings.roundsBeforeLongBreak }).map((_, idx) => {
                    const isDone = idx + 1 < currentRound
                    const isActive = idx + 1 === currentRound
                    return (
                      <span
                        key={idx}
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: isDone || isActive ? 'var(--acc-terra)' : 'none',
                          border: isDone || isActive ? 'none' : '1.5px solid var(--line-sidebar)',
                          outline: isActive ? '2px solid var(--paper-linen)' : 'none',
                          boxShadow: isActive ? '0 0 0 3.5px rgba(181,101,74,0.35)' : 'none',
                        }}
                      />
                    )
                  })}
                  <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                    round {currentRound} of {settings.roundsBeforeLongBreak} · long break after
                  </span>
                </>
              )}

              <span
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', color: 'var(--ink-muted)', cursor: 'pointer' }}
                title="pomodoro settings"
              >
                <GearIcon />
              </span>
            </div>
          </div>
        )}

        {/* 1c: BREAK VIEW */}
        {mode === 'break' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--acc-sage-text)', position: 'relative', zIndex: 5 }}>
              {breakType === 'short' ? `Short break · round ${currentRound} done` : 'Long break · cycle complete'}
            </div>
            <div style={{ position: 'relative', width: 190, height: 190, marginTop: 18 }}>
              <svg width="190" height="190" viewBox="0 0 190 190" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="95" cy="95" r="84" fill="none" stroke="var(--line-card)" strokeWidth="8"></circle>
                <circle cx="95" cy="95" r="84" fill="none" stroke="var(--acc-sage)" strokeWidth="8" strokeLinecap="round" strokeDasharray="528" strokeDashoffset={breakDashoffset}></circle>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 500, lineHeight: 1, color: 'var(--ink-body)' }}>
                  {formatTime(secondsLeft)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginTop: 6 }}>
                  of {breakType === 'short' ? settings.shortBreakMin : settings.longBreakMin} min
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, fontFamily: 'var(--font-hand)', fontSize: 17, color: '#7a745f', transform: 'rotate(-1deg)' }}>
              stand up — go water something real ✿
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
              <button
                onClick={() => {
                  setIsRunning(false)
                  setMode('pomodoro')
                  setSecondsLeft(settings.focusRoundMin * 60)
                  setCurrentRound((r) => (r >= settings.roundsBeforeLongBreak ? 1 : r + 1))
                }}
                style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 12.5, padding: '9px 17px', borderRadius: 999, cursor: 'pointer' }}
              >
                Skip break
              </button>
              <button
                onClick={() => {
                  setMode('pomodoro')
                  setSecondsLeft(settings.focusRoundMin * 60)
                  setCurrentRound((r) => (r >= settings.roundsBeforeLongBreak ? 1 : r + 1))
                  setIsRunning(true)
                }}
                style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12.5, padding: '9px 19px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
              >
                Back to work →
              </button>
            </div>
            <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
              after round {settings.roundsBeforeLongBreak} · a {settings.longBreakMin}-min long break, garden view opens on its own
            </div>
          </div>
        )}

        {/* 1a: POMODORO TIMER */}
        {mode === 'pomodoro' && (
          <>
            <div style={{ position: 'relative', width: 320, height: 320 }}>
              <svg width="320" height="320" viewBox="0 0 320 320" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="160" cy="160" r="146" fill="none" stroke="var(--line-card)" strokeWidth="10"></circle>
                <circle cx="160" cy="160" r="146" fill="none" stroke="var(--acc-lavender)" strokeWidth="10" strokeLinecap="round" strokeDasharray="917" strokeDashoffset={917 * (1 - progressRatio)}></circle>
              </svg>
              {/* Bud marker at progress tip */}
              <img
                src="/ds/assets/cherry/bud.png"
                alt=""
                style={{
                  position: 'absolute',
                  left: budX - 15,
                  top: budY - 15,
                  height: 30,
                  width: 30,
                  filter: 'var(--shadow-drop-sm)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  remaining
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 74, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--ink-body)', marginTop: 6 }}>
                  {formatTime(secondsLeft)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginTop: 8 }}>
                  of {settings.focusRoundMin} min · break at{' '}
                  {new Date(Date.now() + secondsLeft * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* 1d: STOPWATCH TIMER */}
        {mode === 'stopwatch' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '0 44px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 26 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 66, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.01em', color: 'var(--ink-body)' }}>
                {formatStopwatch(stopwatchSeconds)}
              </span>
              <span className="focus-bloom-glow" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc-terra)' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 8 }}>
              {isRunning ? 'recording' : 'paused'} · started {stopwatchStartStr}
            </div>
          </div>
        )}

        {/* Active Task display */}
        {mode !== 'break' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 30, position: 'relative' }}>
              <span
                style={{ width: 19, height: 19, border: '1.5px solid #bfb8a3', borderRadius: 6, flex: 'none', cursor: 'pointer' }}
                onClick={handleCheckOff}
                title="Complete task"
              />
              <span
                onClick={() => setTaskPickerOpen(!taskPickerOpen)}
                style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--ink-body)', cursor: 'pointer', borderBottom: '1px dashed var(--line-dashed)' }}
                title="Click to select another task"
              >
                {activeTask ? activeTask.title : 'No active task selected'}
              </span>
              {activeTask?.top3 && <span style={{ color: 'var(--acc-terra)', fontSize: 17 }}>★</span>}

              {/* Task Picker dropdown */}
              {taskPickerOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 8, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', padding: '8px 0', zIndex: 50, width: 320, maxHeight: 200, overflowY: 'auto' }}>
                  <div style={{ padding: '4px 12px 8px', borderBottom: '1px dashed var(--line-dashed)', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Select a task to focus on
                  </div>
                  {tasks.filter(t => t.status === 'todo').map(t => (
                    <div
                      key={t.id}
                      onClick={() => handleSelectTask(t.id)}
                      style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-body)', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      className="task-picker-row"
                    >
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginRight: 8 }}>{t.title}</span>
                      {t.top3 && <span style={{ color: 'var(--acc-terra)' }}>★</span>}
                    </div>
                  ))}
                  {tasks.filter(t => t.status === 'todo').length === 0 && (
                    <div style={{ padding: '12px', fontSize: 12, color: 'var(--ink-muted)', textAlign: 'center' }}>
                      No tasks left!
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              {activeProject && (
                <span className="chip" style={{ background: 'rgba(122,148,110,0.2)', color: 'var(--acc-sage-text)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999 }}>
                  {activeProject.name}
                </span>
              )}
              <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 9px', borderRadius: 3 }}>
                {activeTask?.notes ? activeTask.notes : 'subtask 2 of 3 · draft the cohort model'}
              </span>
            </div>
          </>
        )}

        {/* 1d: STOPWATCH target project / logging panel */}
        {mode === 'stopwatch' && (
          <div style={{ width: '420px', marginTop: 24, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 8, boxShadow: 'var(--shadow-crisp)', padding: '12px 16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginBottom: 8 }}>
              on stop, this lands automatically
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="chip" style={{ background: 'rgba(122,148,110,0.18)', color: 'var(--acc-sage-text)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999 }}>
                work · {Math.round(stopwatchSeconds / 60)}m
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-body)' }}>
                Projects → {activeProject ? activeProject.name : 'Unlinked'} → Activity
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>
                hours {stopwatchProjectedHours.before} → <b style={{ color: 'var(--ink-body)', fontWeight: 600 }}>{stopwatchProjectedHours.after}</b>
              </span>
            </div>
            <input
              type="text"
              placeholder="What are you working on? (Optional note)"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--paper-bone)',
                border: '1px solid var(--line-card)',
                borderRadius: 4,
                padding: '6px 10px',
                fontSize: 12.5,
                color: 'var(--ink-body)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Controls */}
        {mode !== 'break' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 32 }}>
            <button
              onClick={togglePlay}
              style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 13, padding: '10px 20px', borderRadius: 999, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {isRunning ? '❙❙ Pause' : '▶ Start'}
            </button>
            {mode === 'pomodoro' ? (
              <>
                <button
                  onClick={handleCheckOff}
                  style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 13, padding: '10px 22px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
                >
                  Done — check it off ✓
                </button>
                <button
                  onClick={addFiveMinutes}
                  style={{ border: '1px solid var(--line-solid)', background: 'var(--paper-bone)', color: 'var(--ink-body)', fontFamily: 'inherit', fontSize: 13, padding: '10px 18px', borderRadius: 999, cursor: 'pointer' }}
                >
                  +5 min
                </button>
                <span
                  onClick={() => {
                    setIsRunning(false)
                    setSecondsLeft(settings.focusRoundMin * 60)
                    setPomodoroStartIso(null)
                  }}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer', marginLeft: 6 }}
                >
                  end early…
                </span>
              </>
            ) : (
              <>
                <button
                  onClick={handleStopAndLog}
                  disabled={stopwatchSeconds === 0}
                  style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12.5, padding: '9px 19px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer', opacity: stopwatchSeconds === 0 ? 0.6 : 1 }}
                >
                  Stop &amp; log ✓
                </button>
                <span
                  onClick={handleDiscardStopwatch}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer' }}
                >
                  discard
                </span>
              </>
            )}
          </div>
        )}

        {mode !== 'break' && (
          <div style={{ marginTop: 18, fontFamily: 'var(--font-hand)', fontSize: 17, color: '#7a745f', transform: 'rotate(-0.8deg)' }}>
            nothing else exists for the next hour ✿
          </div>
        )}
      </div>

      {/* Garden Strip at the bottom */}
      <div style={{ flex: 'none', position: 'relative', height: 190, borderTop: '1px dashed var(--line-solid)', overflow: 'hidden' }}>
        {motionOn && (
          <>
            <span className="petal" style={{ left: '12%', animationDelay: '1s', animationDuration: '8.4s' }}></span>
            <span className="petal" style={{ left: '22%', animationDelay: '4.8s', width: 9, height: 7 }}></span>
          </>
        )}

        {/* Glow behind the active working plant */}
        {activeProject && (
          <span className="focus-bloom-glow" style={{ position: 'absolute', left: 158 + projects.indexOf(activeProject) * 150, bottom: 16, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,165,90,0.4), rgba(201,165,90,0) 70%)', pointerEvents: 'none' }}></span>
        )}

        {/* The 7 small beds */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 130px', zIndex: 10 }}>
          <img className="focus-sway" src={`/ds/assets/cherry/${cherryData.stage}.png`} alt="" style={{ height: 120, filter: 'var(--shadow-drop-sm)' }} title={cherryData.note} />
          <img className="focus-sway" src={`/ds/assets/hydrangea/${hydrangeaData.stage}.png`} alt="" style={{ height: 96, animationDelay: '1.2s', filter: 'var(--shadow-drop-sm)' }} title={hydrangeaData.note} />
          <img className="focus-sway" src={`/ds/assets/daisy/${daisyData.stage}.png`} alt="" style={{ height: 100, animationDelay: '2.6s', filter: 'var(--shadow-drop-sm)' }} title={daisyData.note} />
          <img className="focus-sway" src={`/ds/assets/vine/${vineData.stage}.png`} alt="" style={{ height: 110, animationDelay: '0.6s', filter: 'var(--shadow-drop-sm)' }} title={vineData.note} />
          <img className="focus-sway" src={`/ds/assets/fern/${fernData.stage}.png`} alt="" style={{ height: 88, animationDelay: '3.4s', filter: 'var(--shadow-drop-sm)' }} title={fernData.note} />
          <img className="focus-sway" src={`/ds/assets/wisteria/${wisteriaData.stage}.png`} alt="" style={{ height: 110, animationDelay: '1.8s', filter: 'var(--shadow-drop-sm)' }} title={wisteriaData.note} />
          <img className="focus-sway" src={`/ds/assets/clover/${cloverData.stage}.png`} alt="" style={{ height: 78, animationDelay: '4.2s', filter: 'var(--shadow-drop-sm)' }} title={cloverData.note} />
        </div>
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 24, borderBottom: '1px dashed var(--line-dashed)' }}></span>
        <div style={{ position: 'absolute', left: 36, bottom: 4, fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', transform: 'rotate(-1deg)' }}>
          the garden grows while you work
        </div>
        <span
          onClick={() => setMode('garden')}
          style={{ position: 'absolute', right: 36, bottom: 6, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-muted)', cursor: 'pointer' }}
        >
          open the garden →
        </span>
      </div>

      {/* 1e: SETTINGS POPOVER (Modal Overlay) */}
      {isSettingsOpen && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.05)', zIndex: 100 }}>
          <div style={{ position: 'relative', width: 420, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', padding: '18px 20px 20px', transform: 'rotate(-0.3deg)' }}>
            {/* Washi tape decoration */}
            <span className="washi-tape-settings"></span>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                Pomodoro settings
              </span>
              <span
                onClick={() => setIsSettingsOpen(false)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-hairline)', cursor: 'pointer' }}
              >
                ✕
              </span>
            </div>

            {/* Focus round */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginBottom: 6 }}>
              Focus round
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {[15, 25, 45, 50].map((t) => (
                <span
                  key={t}
                  onClick={() => saveSettings({ ...settings, focusRoundMin: t })}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '4px 9px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    background: settings.focusRoundMin === t ? 'rgba(181,101,74,0.16)' : 'none',
                    color: settings.focusRoundMin === t ? 'var(--acc-terra)' : 'var(--ink-muted)',
                    border: settings.focusRoundMin === t ? '1px solid rgba(181,101,74,0.3)' : '1px solid var(--line-solid)',
                  }}
                >
                  {t}m
                </span>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Short break */}
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginBottom: 6 }}>
                  Short break
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[3, 5, 10].map((t) => (
                    <span
                      key={t}
                      onClick={() => saveSettings({ ...settings, shortBreakMin: t })}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '4px 9px',
                        borderRadius: 999,
                        cursor: 'pointer',
                        background: settings.shortBreakMin === t ? 'rgba(122,148,110,0.2)' : 'none',
                        color: settings.shortBreakMin === t ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                        border: settings.shortBreakMin === t ? '1px solid rgba(122,148,110,0.35)' : '1px solid var(--line-solid)',
                      }}
                    >
                      {t}m
                    </span>
                  ))}
                </div>
              </div>

              {/* Long break */}
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginBottom: 6 }}>
                  Long break
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[15, 20, 30].map((t) => (
                    <span
                      key={t}
                      onClick={() => saveSettings({ ...settings, longBreakMin: t })}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '4px 9px',
                        borderRadius: 999,
                        cursor: 'pointer',
                        background: settings.longBreakMin === t ? 'rgba(122,148,110,0.2)' : 'none',
                        color: settings.longBreakMin === t ? 'var(--acc-sage-text)' : 'var(--ink-muted)',
                        border: settings.longBreakMin === t ? '1px solid rgba(122,148,110,0.35)' : '1px solid var(--line-solid)',
                      }}
                    >
                      {t}m
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Rounds count */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 13, borderTop: '1px dashed var(--line-dashed)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Rounds before a long break</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 3 }}>
                  the classic is 4
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  onClick={() => saveSettings({ ...settings, roundsBeforeLongBreak: Math.max(1, settings.roundsBeforeLongBreak - 1) })}
                  style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer' }}
                >
                  −
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--ink-body)', width: 18, textAlign: 'center' }}>
                  {settings.roundsBeforeLongBreak}
                </span>
                <span
                  onClick={() => saveSettings({ ...settings, roundsBeforeLongBreak: Math.min(10, settings.roundsBeforeLongBreak + 1) })}
                  style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--ink-muted)', cursor: 'pointer' }}
                >
                  +
                </span>
              </div>
            </div>

            {/* Rhythm preview */}
            <div style={{ marginTop: 14, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '11px 13px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginBottom: 8 }}>
                Your rhythm · {rhythmPreviewData.text}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {Array.from({ length: settings.roundsBeforeLongBreak }).map((_, idx) => (
                  <React.Fragment key={idx}>
                    <span style={{ flex: settings.focusRoundMin, height: 8, borderRadius: 2, background: 'var(--acc-terra)', opacity: 0.85 }} />
                    {idx < settings.roundsBeforeLongBreak - 1 ? (
                      <span style={{ flex: settings.shortBreakMin, height: 8, borderRadius: 2, background: 'var(--acc-sage)' }} />
                    ) : (
                      <span style={{ flex: settings.longBreakMin, height: 8, borderRadius: 2, background: 'var(--acc-lavender)' }} />
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>
                <span><span style={{ color: 'var(--acc-terra)' }}>■</span> focus {settings.focusRoundMin}</span>
                <span><span style={{ color: 'var(--acc-sage)' }}>■</span> break {settings.shortBreakMin}</span>
                <span><span style={{ color: 'var(--acc-lavender-deep)' }}>■</span> long {settings.longBreakMin}</span>
              </div>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Auto-start the next round</div>
              <span
                onClick={() => saveSettings({ ...settings, autoStartNextRound: !settings.autoStartNextRound })}
                style={{ width: 34, height: 20, borderRadius: 999, background: settings.autoStartNextRound ? 'var(--acc-sage)' : 'var(--line-solid)', flex: 'none', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <span style={{ position: 'absolute', top: 2, left: settings.autoStartNextRound ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left 0.2s' }}></span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Auto-start breaks</div>
              <span
                onClick={() => saveSettings({ ...settings, autoStartBreaks: !settings.autoStartBreaks })}
                style={{ width: 34, height: 20, borderRadius: 999, background: settings.autoStartBreaks ? 'var(--acc-sage)' : 'var(--line-solid)', flex: 'none', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <span style={{ position: 'absolute', top: 2, left: settings.autoStartBreaks ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left 0.2s' }}></span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Garden view on long breaks</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 2 }}>
                  the dusk scene opens by itself
                </div>
              </div>
              <span
                onClick={() => saveSettings({ ...settings, gardenViewOnLongBreaks: !settings.gardenViewOnLongBreaks })}
                style={{ width: 34, height: 20, borderRadius: 999, background: settings.gardenViewOnLongBreaks ? 'var(--acc-sage)' : 'var(--line-solid)', flex: 'none', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <span style={{ position: 'absolute', top: 2, left: settings.gardenViewOnLongBreaks ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left 0.2s' }}></span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Gentle chime at round's end</div>
              <span
                onClick={() => saveSettings({ ...settings, gentleChime: !settings.gentleChime })}
                style={{ width: 34, height: 20, borderRadius: 999, background: settings.gentleChime ? 'var(--acc-sage)' : 'var(--line-solid)', flex: 'none', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <span style={{ position: 'absolute', top: 2, left: settings.gentleChime ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', transition: 'left 0.2s' }}></span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 13, borderTop: '1px dashed var(--line-dashed)' }}>
              <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: '#7a745f', transform: 'rotate(-1deg)' }}>
                saves quietly, per you ✿
              </span>
              <span
                onClick={() => saveSettings(DEFAULT_SETTINGS)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', cursor: 'pointer' }}
              >
                reset to classic
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
