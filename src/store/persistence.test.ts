import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultPlan, serializePlan } from '../model/serialization'
import { usePlanStore } from './planStore'
import { BACKUP_KEY, loadFromStorage, startAutosave, STORAGE_KEY } from './persistence'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as Storage
}

beforeEach(() => {
  usePlanStore.setState({ plan: createDefaultPlan(), selectedRoomId: null, mode: '2d' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loadFromStorage', () => {
  it('returns a default plan when storage is empty', () => {
    const res = loadFromStorage(memoryStorage())
    expect(res.recovered).toBe(false)
    expect(res.plan.rooms).toEqual([])
  })

  it('loads a stored valid plan', () => {
    const storage = memoryStorage()
    const plan = createDefaultPlan()
    storage.setItem(STORAGE_KEY, serializePlan(plan))
    expect(loadFromStorage(storage)).toEqual({ plan, recovered: false })
  })

  it('backs up corrupt data and recovers with a fresh plan', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, '{broken')
    const res = loadFromStorage(storage)
    expect(res.recovered).toBe(true)
    expect(res.plan.rooms).toEqual([])
    expect(storage.getItem(BACKUP_KEY)).toBe('{broken')
  })
})

describe('startAutosave', () => {
  it('saves plan changes after the debounce interval', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const stop = startAutosave(storage, 500)

    usePlanStore.getState().addRoom()
    expect(storage.getItem(STORAGE_KEY)).toBeNull()

    vi.advanceTimersByTime(500)
    expect(storage.getItem(STORAGE_KEY)).toContain('"Room 1"')
    stop()
  })

  it('ignores non-plan state changes', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const stop = startAutosave(storage, 500)

    usePlanStore.getState().setMode('3d')
    vi.advanceTimersByTime(1000)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
    stop()
  })
})
