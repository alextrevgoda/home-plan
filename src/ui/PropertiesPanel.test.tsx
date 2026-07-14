import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultPlan } from '../model/serialization'
import { usePlanStore } from '../store/planStore'
import { PropertiesPanel } from './PropertiesPanel'

describe('PropertiesPanel — furniture', () => {
  beforeEach(() => {
    usePlanStore.setState({ plan: createDefaultPlan(), selection: null, placing: null, placingFurniture: null })
  })

  // @testing-library/react's auto-cleanup relies on a global `afterEach`, which
  // this project's vitest config doesn't provide (no `test.globals: true`), so
  // register it explicitly to keep renders isolated between tests.
  afterEach(() => {
    cleanup()
  })

  const placeSofa = () =>
    usePlanStore.getState().placeFurniture('sofa-3seat', { mount: 'floor', position: { x: 5, y: 4 }, rotation: 0 })

  it('shows the catalog name and size fields for a selected floor item', () => {
    placeSofa()
    render(<PropertiesPanel />)
    expect(screen.getByRole('heading', { name: 'Sofa (3-seat)' })).toBeInTheDocument()
    // NumberField renders a plain <input> (type="text"), so jest-dom's
    // toHaveValue(number) — which only coerces for type="number" inputs —
    // would compare a string against a number and always fail. Follow the
    // existing NumberField.test.tsx pattern: cast and compare the raw
    // `.value` string instead, keeping the same underlying assertion.
    expect((screen.getByLabelText('Width (m)') as HTMLInputElement).value).toBe('2.2')
    expect((screen.getByLabelText('Rotation (°)') as HTMLInputElement).value).toBe('0')
  })

  it('resize commits clamp to catalog bounds', () => {
    const id = placeSofa()
    render(<PropertiesPanel />)
    const width = screen.getByLabelText('Width (m)')
    fireEvent.change(width, { target: { value: '99' } })
    fireEvent.blur(width)
    expect(usePlanStore.getState().plan.furniture[0].size.width).toBe(2.8)
    void id
  })

  it('wall items expose offset and elevation', () => {
    const st = usePlanStore.getState()
    const roomId = st.addRoom()
    st.placeFurniture('wall-art', { mount: 'wall', roomId, edgeIndex: 0, offset: 1 })
    render(<PropertiesPanel />)
    expect(screen.getByLabelText('Offset (m)')).toBeInTheDocument()
    expect(screen.getByLabelText('Elevation (m)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rotation (°)')).not.toBeInTheDocument()
  })

  it('delete removes the item', () => {
    placeSofa()
    render(<PropertiesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(usePlanStore.getState().plan.furniture).toHaveLength(0)
  })

  it('room finishes: floor swatches and wall color with reset', () => {
    const st = usePlanStore.getState()
    const roomId = st.addRoom()
    render(<PropertiesPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Oak' }))
    expect(usePlanStore.getState().plan.rooms[0].floorMaterial).toBe('oak')
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(usePlanStore.getState().plan.rooms[0].floorMaterial).toBeUndefined()
    void roomId
  })
})

describe('PropertiesPanel — rooms (rect and polygonal)', () => {
  beforeEach(() => {
    usePlanStore.setState({ plan: createDefaultPlan(), selection: null, placing: null, placingFurniture: null })
  })

  afterEach(() => {
    cleanup()
  })

  it('non-rect rooms hide dimension fields but show area', () => {
    const st = usePlanStore.getState()
    const id = st.addRoom()
    st.splitRoomEdge(id, 0, 1.5)
    const topY = usePlanStore.getState().plan.rooms[0].polygon[0].y
    st.pushRoomEdge(id, 0, topY + 1)
    usePlanStore.getState().selectRoom(id)
    render(<PropertiesPanel />)
    expect(screen.queryByLabelText('Width (m)')).not.toBeInTheDocument()
    expect(screen.getByText(/m²/)).toBeInTheDocument()
  })

  it('rect rooms keep dimension fields and gain area', () => {
    const st = usePlanStore.getState()
    const id = st.addRoom()
    usePlanStore.getState().selectRoom(id)
    render(<PropertiesPanel />)
    expect(screen.getByLabelText('Width (m)')).toBeInTheDocument()
    expect(screen.getByText(/9\.0 m²/)).toBeInTheDocument() // 3×3 default room
  })
})
