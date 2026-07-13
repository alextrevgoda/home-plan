import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDefaultPlan } from '../model/serialization'
import { usePlanStore } from '../store/planStore'
import App from './App'
import { NumberField } from './NumberField'

// jsdom cannot init WebGL, so Editor2D and Viewer3D are mocked in App tests.
vi.mock('../editor2d/Editor2D', () => ({
  Editor2D: () => <div data-testid="canvas-2d" />,
}))

vi.mock('../viewer3d/Viewer3D', () => ({
  Viewer3D: () => <div data-testid="canvas-3d" />,
}))

beforeEach(() => {
  usePlanStore.setState({ plan: createDefaultPlan(), selection: null, mode: '2d' })
})

// @testing-library/react's auto-cleanup relies on a global `afterEach`, which
// this project's vitest config doesn't provide (no `test.globals: true`), so
// register it explicitly to keep renders isolated between tests.
afterEach(() => {
  cleanup()
})

it('re-syncs the displayed text when a commit clamps back to the current store value', () => {
  render(<App />)
  const width = screen.getByLabelText('Width (m)') as HTMLInputElement

  // First push the store to 100 (clamped from an out-of-range value).
  fireEvent.change(width, { target: { value: '500' } })
  fireEvent.blur(width)
  expect(usePlanStore.getState().plan.apartment.width).toBe(100)
  expect(width.value).toBe('100')

  // Now commit another out-of-range value while the store is ALREADY at 100.
  // The store value doesn't change, so the [value] effect alone can't fix the
  // display - commit() itself must re-sync the text.
  fireEvent.change(width, { target: { value: '500' } })
  fireEvent.blur(width)
  expect(usePlanStore.getState().plan.apartment.width).toBe(100)
  expect(width.value).toBe('100')
})

it('reverts to the previous value and does not commit when the field is cleared', () => {
  const onCommit = vi.fn()
  render(<NumberField label="Width" value={7} onCommit={onCommit} />)
  const input = screen.getByLabelText('Width') as HTMLInputElement

  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)

  expect(input.value).toBe('7')
  expect(onCommit).not.toHaveBeenCalled()
})
