import { useSyncExternalStore } from 'react'

export const MOBILE_LAYOUT_QUERY = '(max-width: 768px)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_LAYOUT_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches
}

/** True when the viewport is phone-sized. Drives component-tree differences only —
 *  visual styling reacts to the same query in CSS, and touch behavior is keyed off
 *  each event's pointerType, never off this hook. */
export function useIsMobileLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
