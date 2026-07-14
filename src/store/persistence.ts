import { createDefaultPlan, parsePlan, serializePlan } from '../model/serialization'
import type { Plan } from '../model/types'
import { usePlanStore } from './planStore'

export const STORAGE_KEY = 'home-plan.plan'
export const BACKUP_KEY = 'home-plan.backup'

export interface LoadResult {
  plan: Plan
  recovered: boolean
}

export function loadFromStorage(storage: Storage): LoadResult {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return { plan: createDefaultPlan(), recovered: false }

  const plan = parsePlan(raw)
  if (plan) return { plan, recovered: false }

  try {
    storage.setItem(BACKUP_KEY, raw)
  } catch {
    // best-effort backup only; corrupted data recovery must not be blocked by storage failures
  }
  return { plan: createDefaultPlan(), recovered: true }
}

export interface UnloadTarget {
  addEventListener(type: 'beforeunload', listener: () => void): void
  removeEventListener(type: 'beforeunload', listener: () => void): void
}

export function startAutosave(
  storage: Storage,
  debounceMs = 500,
  onError?: () => void,
  unloadTarget: UnloadTarget | undefined = typeof window !== 'undefined' ? window : undefined,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let didReportError = false

  const save = () => {
    try {
      storage.setItem(STORAGE_KEY, serializePlan(usePlanStore.getState().plan))
    } catch {
      if (!didReportError) {
        didReportError = true
        onError?.()
      }
    }
  }

  const unsubscribe = usePlanStore.subscribe((state, prev) => {
    if (state.plan === prev.plan) return
    clearTimeout(timer)
    timer = setTimeout(save, debounceMs)
  })

  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    save()
  }
  unloadTarget?.addEventListener('beforeunload', flush)

  return () => {
    clearTimeout(timer)
    unloadTarget?.removeEventListener('beforeunload', flush)
    unsubscribe()
  }
}
