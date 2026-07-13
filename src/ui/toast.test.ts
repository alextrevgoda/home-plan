import { afterEach, expect, it, vi } from 'vitest'
import { useToast } from './toast'

afterEach(() => {
  vi.useRealTimers()
  useToast.setState({ message: null })
})

it('shows a message and auto-clears after 5 seconds', () => {
  vi.useFakeTimers()
  useToast.getState().show('Hello')
  expect(useToast.getState().message).toBe('Hello')
  vi.advanceTimersByTime(5000)
  expect(useToast.getState().message).toBeNull()
})
