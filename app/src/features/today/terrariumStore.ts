import { create } from 'zustand'

function readBool(key: string, fallback: boolean): boolean {
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(key)
  return raw === null ? fallback : raw !== '0'
}

interface TerrariumState {
  on: boolean
  toggleOn: () => void
}

export const useTerrariumStore = create<TerrariumState>((set, get) => ({
  on: readBool('kf_terrarium_on', true),
  toggleOn: () => {
    const v = !get().on
    localStorage.setItem('kf_terrarium_on', v ? '1' : '0')
    set({ on: v })
  },
}))
