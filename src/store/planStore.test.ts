import { beforeEach, describe, expect, it } from 'vitest'
import { polygonToRect } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import { usePlanStore } from './planStore'

beforeEach(() => {
  usePlanStore.setState({ plan: createDefaultPlan(), selection: null, mode: '2d' })
})

describe('addRoom', () => {
  it('adds a 3x3 room centered in the apartment and selects it', () => {
    const id = usePlanStore.getState().addRoom()
    const s = usePlanStore.getState()
    expect(s.plan.rooms).toHaveLength(1)
    expect(s.selection).toEqual({ kind: 'room', id })
    expect(s.plan.rooms[0].name).toBe('Room 1')
    const rect = polygonToRect(s.plan.rooms[0].polygon)
    expect(rect).toEqual({ x: 3.5, y: 2.5, width: 3, height: 3 })
  })
})

describe('updateRoomRect', () => {
  it('rounds to cm and enforces the minimum size', () => {
    const id = usePlanStore.getState().addRoom()
    usePlanStore.getState().updateRoomRect(id, { x: 1.2345, y: 2, width: 0.2, height: 3.456 })
    const rect = polygonToRect(usePlanStore.getState().plan.rooms[0].polygon)
    expect(rect).toEqual({ x: 1.23, y: 2, width: 0.5, height: 3.46 })
  })

  it('rejects non-finite x and leaves polygon unchanged', () => {
    const id = usePlanStore.getState().addRoom()
    const polygonBefore = usePlanStore.getState().plan.rooms[0].polygon
    usePlanStore.getState().updateRoomRect(id, { x: NaN, y: 2, width: 3, height: 3 })
    const polygonAfter = usePlanStore.getState().plan.rooms[0].polygon
    expect(polygonAfter).toEqual(polygonBefore)
  })
})

describe('setApartment', () => {
  it('clamps dimensions to spec ranges and keeps unset fields', () => {
    usePlanStore.getState().setApartment({ width: 500, wallHeight: 1 })
    const a = usePlanStore.getState().plan.apartment
    expect(a).toEqual({ width: 100, depth: 8, wallHeight: 2 })
  })

  it('rejects non-finite width and leaves apartment unchanged', () => {
    const apartmentBefore = usePlanStore.getState().plan.apartment
    usePlanStore.getState().setApartment({ width: NaN })
    const apartmentAfter = usePlanStore.getState().plan.apartment
    expect(apartmentAfter).toEqual(apartmentBefore)
  })
})

describe('renameRoom / setRoomColor', () => {
  it('updates name and color of the targeted room only', () => {
    const id1 = usePlanStore.getState().addRoom()
    const id2 = usePlanStore.getState().addRoom()
    usePlanStore.getState().renameRoom(id1, 'Bedroom')
    usePlanStore.getState().setRoomColor(id2, '#123456')
    const rooms = usePlanStore.getState().plan.rooms
    expect(rooms.find((r) => r.id === id1)?.name).toBe('Bedroom')
    expect(rooms.find((r) => r.id === id2)?.color).toBe('#123456')
    expect(rooms.find((r) => r.id === id2)?.name).toBe('Room 2')
  })
})

describe('deleteRoom', () => {
  it('removes the room and clears its selection', () => {
    const id = usePlanStore.getState().addRoom()
    usePlanStore.getState().deleteRoom(id)
    const s = usePlanStore.getState()
    expect(s.plan.rooms).toHaveLength(0)
    expect(s.selection).toBeNull()
  })
})

describe('loadPlan / setMode / selectRoom', () => {
  it('replaces the plan and clears selection', () => {
    usePlanStore.getState().addRoom()
    const fresh = createDefaultPlan()
    usePlanStore.getState().loadPlan(fresh)
    const s = usePlanStore.getState()
    expect(s.plan).toEqual(fresh)
    expect(s.selection).toBeNull()
  })

  it('switches mode', () => {
    usePlanStore.getState().setMode('3d')
    expect(usePlanStore.getState().mode).toBe('3d')
  })

  it('selectOpening sets an opening selection', () => {
    usePlanStore.getState().selectOpening('o1')
    expect(usePlanStore.getState().selection).toEqual({ kind: 'opening', id: 'o1' })
  })
})
