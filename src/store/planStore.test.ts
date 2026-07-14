import { beforeEach, describe, expect, it } from 'vitest'
import { catalogItem } from '../model/catalog'
import { polygonToRect } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { FloorItem, WallItem } from '../model/types'
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

const placeSofa = (x: number, y: number, rotation = 0) =>
  usePlanStore.getState().placeFurniture('sofa-3seat', { mount: 'floor', position: { x, y }, rotation })

describe('furniture actions', () => {
  it('places a floor item with defaults and selects it', () => {
    const id = placeSofa(5, 4)
    const s = usePlanStore.getState()
    expect(id).not.toBe('')
    const item = s.plan.furniture[0]
    expect(item).toMatchObject({ catalogId: 'sofa-3seat', mount: 'floor', rotation: 0 })
    expect(item.size).toEqual(catalogItem('sofa-3seat')!.defaultSize)
    expect(s.selection).toEqual({ kind: 'furniture', id })
    expect(s.placingFurniture).toBeNull()
  })

  it('rejects colliding and out-of-bounds placements', () => {
    expect(placeSofa(5, 4)).not.toBe('')
    expect(placeSofa(5.5, 4)).toBe('') // overlaps the first sofa
    expect(placeSofa(0.2, 4)).toBe('') // footprint outside the apartment
    expect(usePlanStore.getState().plan.furniture).toHaveLength(1)
  })

  it('places rugs on top of solids (underlay exempt from collision)', () => {
    expect(placeSofa(5, 4)).not.toBe('')
    const rugId = usePlanStore.getState().placeFurniture('rug-rect', { mount: 'floor', position: { x: 5, y: 4 }, rotation: 0 })
    expect(rugId).not.toBe('')
  })

  it('moves with clamping, rotates normalized, resizes within bounds', () => {
    const id = placeSofa(5, 4)
    const st = () => usePlanStore.getState()
    st().moveFloorItem(id, { x: -10, y: 4 })
    expect((st().plan.furniture[0] as FloorItem).position.x).toBe(1.1) // half of width 2.2
    st().rotateFurniture(id, -90)
    expect((st().plan.furniture[0] as FloorItem).rotation).toBe(270)
    st().rotateFurniture(id, 359.97)
    expect((st().plan.furniture[0] as FloorItem).rotation).toBe(0)
    st().rotateFurniture(id, -0.02)
    expect((st().plan.furniture[0] as FloorItem).rotation).toBe(0)
    st().rotateFurniture(id, 2.3)
    expect((st().plan.furniture[0] as FloorItem).rotation).toBe(2.3) // exact, no float noise
    st().resizeFurniture(id, { width: 99 })
    expect(st().plan.furniture[0].size.width).toBe(2.8)
    st().recolorFurniture(id, '#ff0000')
    // sofa-3seat has a recolorMaterial (Task 11) → color is set
    expect(st().plan.furniture[0].color).toBe('#ff0000')
    st().deleteFurniture(id)
    expect(st().plan.furniture).toHaveLength(0)
    expect(st().selection).toBeNull()
  })

  it('places, slides and updates wall items; deleteRoom cascades', () => {
    const st = () => usePlanStore.getState()
    const roomId = st().addRoom()
    const artId = st().placeFurniture('wall-art', { mount: 'wall', roomId, edgeIndex: 0, offset: 1 })
    expect(artId).not.toBe('')
    const art = () => st().plan.furniture.find((f) => f.id === artId) as WallItem
    expect(art().elevation).toBe(1.4)
    st().moveWallItem(artId, roomId, 1, 0)
    expect(art().edgeIndex).toBe(1)
    expect(art().offset).toBe(0.4) // clamped to width/2
    st().updateWallItem(artId, { elevation: 99 })
    expect(art().elevation).toBe(2.7 - 0.6) // wallHeight − item height
    st().deleteRoom(roomId)
    expect(st().plan.furniture).toHaveLength(0)
  })

  it('setApartment re-clamps stranded floor items', () => {
    // NOTE: brief specified placeSofa(9, 4), but the default apartment is 10m wide and the
    // sofa is 2.2m wide (half-width 1.1m), so a center at x=9 puts the right edge at 10.1m —
    // 0.1m outside the 10m apartment, which placeFurniture correctly rejects (see
    // "rejects colliding and out-of-bounds placements" above, same bounds check). Using 8.5
    // keeps the item validly placed pre-shrink while still landing outside the 5m apartment
    // afterward, preserving the test's intent.
    const id = placeSofa(8.5, 4)
    expect(id).not.toBe('')
    usePlanStore.getState().setApartment({ width: 5 })
    const item = usePlanStore.getState().plan.furniture[0] as FloorItem
    expect(item.position.x).toBeLessThanOrEqual(5 - 1.1)
  })

  it('room finishes validate', () => {
    const st = () => usePlanStore.getState()
    const roomId = st().addRoom()
    st().setRoomFloorMaterial(roomId, 'oak')
    st().setRoomWallColor(roomId, '#aabbcc')
    let room = st().plan.rooms[0]
    expect(room.floorMaterial).toBe('oak')
    expect(room.wallColor).toBe('#aabbcc')
    st().setRoomFloorMaterial(roomId, 'nope')
    st().setRoomWallColor(roomId, 'red')
    room = st().plan.rooms[0]
    expect(room.floorMaterial).toBe('oak') // unchanged
    expect(room.wallColor).toBe('#aabbcc')
    st().setRoomFloorMaterial(roomId, undefined)
    expect(st().plan.rooms[0].floorMaterial).toBeUndefined()
  })

  it('placing modes are mutually exclusive', () => {
    const st = () => usePlanStore.getState()
    st().setPlacing('door')
    st().setPlacingFurniture('sofa-3seat')
    expect(st().placing).toBeNull()
    expect(st().placingFurniture).toBe('sofa-3seat')
    st().setPlacing('window')
    expect(st().placingFurniture).toBeNull()
  })

  it('closing the catalog disarms placement; opening it leaves placement untouched', () => {
    const st = () => usePlanStore.getState()
    st().setPlacingFurniture('sofa-3seat')
    expect(st().placingFurniture).toBe('sofa-3seat')
    st().setCatalogOpen(false)
    expect(st().placingFurniture).toBeNull()
    expect(st().catalogOpen).toBe(false)

    st().setPlacingFurniture('sofa-3seat')
    st().setCatalogOpen(true)
    expect(st().placingFurniture).toBe('sofa-3seat')
    expect(st().catalogOpen).toBe(true)
  })
})

describe('setCatalogOpen', () => {
  it('clears placingFurniture when the catalog closes', () => {
    const s = usePlanStore.getState()
    s.setCatalogOpen(true)
    s.setPlacingFurniture('sofa-3seat')
    s.setCatalogOpen(false)
    expect(usePlanStore.getState().placingFurniture).toBeNull()
    expect(usePlanStore.getState().catalogOpen).toBe(false)
  })

  it('keeps placingFurniture while the catalog stays open', () => {
    const s = usePlanStore.getState()
    s.setCatalogOpen(true)
    s.setPlacingFurniture('sofa-3seat')
    s.setCatalogOpen(true)
    expect(usePlanStore.getState().placingFurniture).toBe('sofa-3seat')
  })
})

describe('apartmentPropsOpen', () => {
  it('defaults closed and toggles via the setter', () => {
    usePlanStore.setState({ apartmentPropsOpen: false })
    usePlanStore.getState().setApartmentPropsOpen(true)
    expect(usePlanStore.getState().apartmentPropsOpen).toBe(true)
    usePlanStore.getState().setApartmentPropsOpen(false)
    expect(usePlanStore.getState().apartmentPropsOpen).toBe(false)
  })
})
