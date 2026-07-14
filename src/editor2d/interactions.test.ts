import { describe, expect, it } from 'vitest'
import { createDefaultPlan } from '../model/serialization'
import { rectToPolygon } from '../model/geometry'
import type { FloorItem, Opening, Plan, Room, WallItem } from '../model/types'
import {
  distToSegmentScreen,
  edgeIsHorizontal,
  hitFurniture,
  hitOpening,
  hitPolygonHandle,
  hitRoom,
  hitRotationHandle,
  nearestEdge,
  nearestRoomEdge,
  polygonHandles,
  rotationFromPointer,
  rotationHandleScreen,
} from './interactions'

const roomAt = (x: number, y: number, w: number, h: number, id: string): Room => ({
  id,
  name: id,
  polygon: rectToPolygon({ x, y, width: w, height: h }),
  color: '#8ecae6',
})

describe('polygonHandles', () => {
  const viewport = { scale: 100, offsetX: 0, offsetY: 0 }
  const rect = { id: 'r1', name: 'A', color: '#8ecae6', polygon: rectToPolygon({ x: 0, y: 0, width: 4, height: 3 }) }

  it('a rect exposes 4 vertex + 4 edge handles', () => {
    const handles = polygonHandles(rect)
    expect(handles.filter((h) => h.kind === 'vertex')).toHaveLength(4)
    expect(handles.filter((h) => h.kind === 'edge')).toHaveLength(4)
    expect(handles.find((h) => h.kind === 'edge' && h.index === 0)?.point).toEqual({ x: 2, y: 0 })
  })

  it('split vertices get no vertex handle but both sub-edges get edge handles', () => {
    const split = { ...rect, polygon: [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 } ] }
    const handles = polygonHandles(split)
    expect(handles.filter((h) => h.kind === 'vertex')).toHaveLength(4) // corner count unchanged
    expect(handles.filter((h) => h.kind === 'edge')).toHaveLength(5)
    expect(handles.some((h) => h.kind === 'vertex' && h.point.x === 2 && h.point.y === 0)).toBe(false)
  })

  it('hitPolygonHandle: vertex wins over edge within radius', () => {
    expect(hitPolygonHandle(rect, viewport, { x: 200, y: -3 })).toMatchObject({ kind: 'edge', index: 0 }) // top-edge midpoint (2,0) → screen (200,0)
    expect(hitPolygonHandle(rect, viewport, { x: 3, y: 4 })).toMatchObject({ kind: 'vertex', index: 0 }) // near (0,0)
    expect(hitPolygonHandle(rect, viewport, { x: 200, y: 150 })).toBeNull() // room center
  })

  it('edgeIsHorizontal and nearestRoomEdge', () => {
    expect(edgeIsHorizontal(rect.polygon, 0)).toBe(true)
    expect(edgeIsHorizontal(rect.polygon, 1)).toBe(false)
    expect(nearestRoomEdge(rect, viewport, { x: 150, y: 4 })).toEqual({ edgeIndex: 0, t: 1.5 })
    expect(nearestRoomEdge(rect, viewport, { x: 150, y: 150 })).toBeNull()
  })
})

describe('hitRoom', () => {
  it('returns the topmost (last) room under the point', () => {
    const rooms = [roomAt(0, 0, 4, 4, 'a'), roomAt(2, 2, 4, 4, 'b')]
    expect(hitRoom(rooms, { x: 3, y: 3 })).toBe('b')
  })

  it('returns null on empty space', () => {
    expect(hitRoom([roomAt(0, 0, 1, 1, 'a')], { x: 5, y: 5 })).toBeNull()
  })

  const lRoom: Room = {
    id: 'l',
    name: 'L',
    color: '#8ecae6',
    polygon: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ],
  }

  it('misses the notch cut out of an L-shaped room', () => {
    expect(hitRoom([lRoom], { x: 3, y: 0.5 })).toBeNull()
  })

  it('hits inside the L-shaped room arm', () => {
    expect(hitRoom([lRoom], { x: 1, y: 0.5 })).toBe('l')
    expect(hitRoom([lRoom], { x: 3, y: 2 })).toBe('l')
  })
})

const planWithOpenings = (openings: Opening[]): Plan => ({
  ...createDefaultPlan(),
  rooms: [roomAt(0, 0, 4, 3, 'A')],
  openings,
})

const doorA: Opening = {
  id: 'd1',
  kind: 'door',
  roomId: 'A',
  edgeIndex: 0,
  offset: 2,
  width: 1,
  height: 2.1,
  sillHeight: 0,
}

describe('distToSegmentScreen', () => {
  it('measures perpendicular and endpoint distances', () => {
    expect(distToSegmentScreen({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(distToSegmentScreen({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4)
  })
})

describe('hitOpening', () => {
  const viewport = { offsetX: 0, offsetY: 0, scale: 100 }

  it('hits an opening near its span', () => {
    // span (1.5,0)→(2.5,0) → screen (150,0)→(250,0)
    expect(hitOpening(planWithOpenings([doorA]), viewport, { x: 200, y: 5 })).toBe('d1')
  })

  it('misses outside the radius', () => {
    expect(hitOpening(planWithOpenings([doorA]), viewport, { x: 200, y: 20 })).toBeNull()
  })
})

describe('nearestEdge', () => {
  const viewport = { offsetX: 0, offsetY: 0, scale: 100 }

  it('finds the nearest room edge and projects the offset', () => {
    const hit = nearestEdge(planWithOpenings([]), viewport, { x: 200, y: -5 })
    expect(hit).toEqual({ roomId: 'A', edgeIndex: 0, offset: 2 })
  })

  it('returns null when no edge is within the radius', () => {
    expect(nearestEdge(planWithOpenings([]), viewport, { x: 200, y: 150 })).toBeNull()
  })
})

describe('hitFurniture', () => {
  const viewport = { scale: 100, offsetX: 0, offsetY: 0 }
  const sofa: FloorItem = { id: 'sofa', catalogId: 'sofa-3seat', mount: 'floor',
    position: { x: 2, y: 2 }, rotation: 0, size: { width: 2.2, depth: 0.95, height: 0.85 } }
  const rugUnder: FloorItem = { id: 'rug', catalogId: 'rug-rect', mount: 'floor',
    position: { x: 2, y: 2 }, rotation: 0, size: { width: 3, depth: 2, height: 0.01 } }
  const room = { id: 'r1', name: 'A', color: '#8ecae6', polygon: [
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 } ] }
  const art: WallItem = { id: 'art', catalogId: 'wall-art', mount: 'wall', roomId: 'r1',
    edgeIndex: 0, offset: 2, elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 } }
  const plan = { ...createDefaultPlan(), rooms: [room], furniture: [rugUnder, sofa, art] }

  it('solid wins over underlay at the same point', () => {
    expect(hitFurniture(plan, viewport, { x: 200, y: 200 })).toBe('sofa')
  })
  it('exposed rug is hit where the sofa is not', () => {
    expect(hitFurniture(plan, viewport, { x: 200, y: 280 })).toBe('rug')
  })
  it('wall item hit by proximity to its span', () => {
    expect(hitFurniture(plan, viewport, { x: 200, y: 4 })).toBe('art')
  })
  it('misses empty space and respects rotation', () => {
    expect(hitFurniture(plan, viewport, { x: 390, y: 290 })).toBeNull()
    const rotated = { ...plan, furniture: [{ ...sofa, rotation: 90 }] }
    expect(hitFurniture(rotated, viewport, { x: 200, y: 290 })).toBe('sofa') // depth now along x
    expect(hitFurniture(rotated, viewport, { x: 290, y: 200 })).toBeNull()
  })
})

describe('rotation handle', () => {
  const viewport = { scale: 100, offsetX: 0, offsetY: 0 }
  const item: FloorItem = { id: 'a', catalogId: 'sofa-3seat', mount: 'floor',
    position: { x: 2, y: 2 }, rotation: 0, size: { width: 2, depth: 1, height: 0.8 } }

  it('sits 24px above the footprint top at rotation 0', () => {
    expect(rotationHandleScreen(item, viewport)).toEqual({ x: 200, y: 150 - 24 })
  })
  it('rotates with the item', () => {
    const p = rotationHandleScreen({ ...item, rotation: 90 }, viewport)
    expect(p.x).toBeCloseTo(200 + 50 + 24)
    expect(p.y).toBeCloseTo(200)
  })
  it('hit within 9px', () => {
    expect(hitRotationHandle(item, viewport, { x: 202, y: 128 })).toBe(true)
    expect(hitRotationHandle(item, viewport, { x: 220, y: 128 })).toBe(false)
  })
  it('pointer angle → rotation, snapped and free', () => {
    expect(rotationFromPointer(item, viewport, { x: 200, y: 100 }, true)).toBe(0)
    expect(rotationFromPointer(item, viewport, { x: 300, y: 200 }, true)).toBe(90)
    expect(rotationFromPointer(item, viewport, { x: 300, y: 208 }, true)).toBe(90) // snaps
    const free = rotationFromPointer(item, viewport, { x: 300, y: 208 }, false)
    expect(free).toBeGreaterThan(90)
    expect(free).toBeLessThan(95)
  })
})
