import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createDefaultPlan } from '../model/serialization'
import { usePlanStore } from '../store/planStore'
import App from './App'

beforeEach(() => {
  usePlanStore.setState({ plan: createDefaultPlan(), selectedRoomId: null, mode: '2d' })
})

// @testing-library/react's auto-cleanup relies on a global `afterEach`, which
// this project's vitest config doesn't provide (no `test.globals: true`), so
// register it explicitly to keep renders isolated between tests.
afterEach(() => {
  cleanup()
})

it('renders the app title', () => {
  render(<App />)
  expect(screen.getByText('Home Plan')).toBeInTheDocument()
})

it('toggles between 2D and 3D canvas areas', () => {
  render(<App />)
  expect(screen.getByTestId('canvas-2d')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '3D' }))
  expect(screen.getByTestId('canvas-3d')).toBeInTheDocument()
})

it('adds a room from the toolbar and edits its name in the panel', () => {
  render(<App />)
  fireEvent.click(screen.getByText('+ Add room'))
  const nameInput = screen.getByLabelText('Name')
  fireEvent.change(nameInput, { target: { value: 'Bedroom' } })
  expect(usePlanStore.getState().plan.rooms[0].name).toBe('Bedroom')
})

it('shows apartment fields when nothing is selected and clamps on commit', () => {
  render(<App />)
  const width = screen.getByLabelText('Width (m)')
  fireEvent.change(width, { target: { value: '500' } })
  fireEvent.blur(width)
  expect(usePlanStore.getState().plan.apartment.width).toBe(100)
})

it('updates room geometry from the panel', () => {
  render(<App />)
  fireEvent.click(screen.getByText('+ Add room'))
  const widthField = screen.getByLabelText('Width (m)')
  fireEvent.change(widthField, { target: { value: '4.5' } })
  fireEvent.blur(widthField)
  const { polygon } = usePlanStore.getState().plan.rooms[0]
  expect(Math.max(...polygon.map((p) => p.x)) - Math.min(...polygon.map((p) => p.x))).toBe(4.5)
})

it('deletes the selected room from the panel', () => {
  render(<App />)
  fireEvent.click(screen.getByText('+ Add room'))
  fireEvent.click(screen.getByText('Delete room'))
  expect(usePlanStore.getState().plan.rooms).toHaveLength(0)
})
