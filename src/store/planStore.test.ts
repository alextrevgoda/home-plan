import { beforeEach, describe, expect, it } from 'vitest'
import { polygonToRect } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import { usePlanStore } from './planStore'

beforeEach(() => {
  usePlanStore.setState({ plan: createDefaultPlan(), selection: null, mode: '2d', placing: null })
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

describe('openings', () => {
  const addRoomAndDoor = () => {
    const roomId = usePlanStore.getState().addRoom() // 3×3 room, edges of length 3
    const openingId = usePlanStore.getState().addOpening('door', roomId, 0, 1.5)
    return { roomId, openingId }
  }

  it('addOpening applies kind defaults, clamps offset, selects, disarms placement', () => {
    const roomId = usePlanStore.getState().addRoom()
    usePlanStore.getState().setPlacing('door')
    const id = usePlanStore.getState().addOpening('door', roomId, 0, 0.1)
    const s = usePlanStore.getState()
    expect(s.plan.openings).toHaveLength(1)
    expect(s.plan.openings[0]).toMatchObject({
      kind: 'door',
      roomId,
      edgeIndex: 0,
      offset: 0.45,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    })
    expect(s.selection).toEqual({ kind: 'opening', id })
    expect(s.placing).toBeNull()
  })

  it('addOpening no-ops and returns empty id for an unknown room or bad edge', () => {
    expect(usePlanStore.getState().addOpening('door', 'nope', 0, 1)).toBe('')
    const roomId = usePlanStore.getState().addRoom()
    expect(usePlanStore.getState().addOpening('window', roomId, 9, 1)).toBe('')
    expect(usePlanStore.getState().plan.openings).toHaveLength(0)
  })

  it('setPlacing deselects', () => {
    usePlanStore.getState().addRoom()
    usePlanStore.getState().setPlacing('window')
    const s = usePlanStore.getState()
    expect(s.placing).toBe('window')
    expect(s.selection).toBeNull()
  })

  it('moveOpening clamps along the edge', () => {
    const { openingId } = addRoomAndDoor()
    usePlanStore.getState().moveOpening(openingId, 5)
    expect(usePlanStore.getState().plan.openings[0].offset).toBe(2.55)
    usePlanStore.getState().moveOpening(openingId, Number.NaN)
    expect(usePlanStore.getState().plan.openings[0].offset).toBe(2.55)
  })

  it('updateOpening clamps width and keeps doors at sill 0', () => {
    const { openingId } = addRoomAndDoor()
    usePlanStore.getState().updateOpening(openingId, { width: 0.1, sillHeight: 1 })
    const o = usePlanStore.getState().plan.openings[0]
    expect(o.width).toBe(0.3)
    expect(o.sillHeight).toBe(0)
  })

  it('updateOpening clamps window height against the wall', () => {
    const roomId = usePlanStore.getState().addRoom()
    const id = usePlanStore.getState().addOpening('window', roomId, 0, 1.5)
    usePlanStore.getState().updateOpening(id, { height: 5 })
    const o = usePlanStore.getState().plan.openings[0]
    // wallHeight 2.7, sill 0.9 → height ≤ 2.7 − 0.1 − 0.9 = 1.7
    expect(o.height).toBe(1.7)
  })

  it('resizing the room re-clamps its openings', () => {
    const { roomId, openingId } = addRoomAndDoor()
    usePlanStore.getState().moveOpening(openingId, 2.55)
    usePlanStore.getState().updateRoomRect(roomId, { x: 3.5, y: 2.5, width: 1, height: 3 })
    // edge 0 is now 1 m long; door 0.9 wide → offset ∈ [0.45, 0.55]
    expect(usePlanStore.getState().plan.openings[0].offset).toBe(0.55)
  })

  it('deleting the room cascades its openings and clears their selection', () => {
    const { roomId } = addRoomAndDoor()
    usePlanStore.getState().deleteRoom(roomId)
    const s = usePlanStore.getState()
    expect(s.plan.openings).toHaveLength(0)
    expect(s.selection).toBeNull()
  })

  it('deleteOpening removes it and clears its selection', () => {
    const { openingId } = addRoomAndDoor()
    usePlanStore.getState().deleteOpening(openingId)
    const s = usePlanStore.getState()
    expect(s.plan.openings).toHaveLength(0)
    expect(s.selection).toBeNull()
  })
})
