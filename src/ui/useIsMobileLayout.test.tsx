import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MOBILE_LAYOUT_QUERY, useIsMobileLayout } from './useIsMobileLayout'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return matches
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
  return {
    set(value: boolean) {
      matches = value
      act(() => listeners.forEach((fn) => fn()))
    },
  }
}

it('uses the 768px breakpoint query', () => {
  expect(MOBILE_LAYOUT_QUERY).toBe('(max-width: 768px)')
})

it('reflects the current match and updates on change events', () => {
  const media = mockMatchMedia(false)
  const { result } = renderHook(() => useIsMobileLayout())
  expect(result.current).toBe(false)
  media.set(true)
  expect(result.current).toBe(true)
  media.set(false)
  expect(result.current).toBe(false)
})
