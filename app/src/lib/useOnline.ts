import { useSyncExternalStore } from 'react'
import { onlineManager } from '@tanstack/react-query'

/** The connection as the query layer sees it (the same signal that pauses a query offline). */
export function useOnline(): boolean {
  return useSyncExternalStore((cb) => onlineManager.subscribe(cb), () => onlineManager.isOnline())
}
