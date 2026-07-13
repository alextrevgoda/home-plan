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

  storage.setItem(BACKUP_KEY, raw)
  return { plan: createDefaultPlan(), recovered: true }
}

export function startAutosave(storage: Storage, debounceMs = 500): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const unsubscribe = usePlanStore.subscribe((state, prev) => {
    if (state.plan === prev.plan) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      storage.setItem(STORAGE_KEY, serializePlan(usePlanStore.getState().plan))
    }, debounceMs)
  })

  return () => {
    clearTimeout(timer)
    unsubscribe()
  }
}
