import { create } from 'zustand'

function readBool(key: string, fallback: boolean): boolean {
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  return raw === null ? fallback : raw !== '0'
}

interface TerrariumState {
  on: boolean
  inToday: boolean
  toggleOn: () => void
  toggleInToday: () => void
}

export const useTerrariumStore = create<TerrariumState>((set, get) => ({
  on: readBool('kf_terrarium_on', true),
  inToday: readBool('kf_terrarium_today', true),
  toggleOn: () => {
    const v = !get().on
    localStorage.setItem('kf_terrarium_on', v ? '1' : '0')
    set({ on: v })
  },
  toggleInToday: () => {
    if (!get().on) return
    const v = !get().inToday
    localStorage.setItem('kf_terrarium_today', v ? '1' : '0')
    set({ inToday: v })
  },
}))
