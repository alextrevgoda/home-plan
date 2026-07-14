import { describe, expect, it } from 'vitest'
import { polygonArea, rectToPolygon } from './geometry'
import {
  isRectilinear, isSimplePolygon, mergeCollinear, mergeRoomCollinear, MIN_EDGE, minEdgeLength,
  moveRoomVertex, pointInPolygon, polygonBounds, polygonCentroid, pushRoomEdge, signedPolygonArea,
  splitRoomEdge, translateRoom, validateRoomPolygon,
} from './polygon'
import { createDefaultPlan } from './serialization'
import type { Opening, Plan, Room, Vec2, WallItem } from './types'

// L-shape: 4×3 rect with a 2×1 notch cut from the top-right corner
export const L: Vec2[] = [
  { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 1 },
  { x: 4, y: 3 }, { x: 0, y: 3 },
]

describe('isRectilinear', () => {
  it('accepts rects and L-shapes', () => {
    expect(isRectilinear(rectToPolygon({ x: 1, y: 1, width: 3, height: 2 }))).toBe(true)
    expect(isRectilinear(L)).toBe(true)
  })
  it('rejects diagonals, degenerate edges, and tiny polygons', () => {
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: -1, y: 1 }])).toBe(false)
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }])).toBe(false)
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }])).toBe(false)
  })
})

describe('isSimplePolygon', () => {
  it('accepts rects and L-shapes', () => {
    expect(isSimplePolygon(rectToPolygon({ x: 0, y: 0, width: 2, height: 2 }))).toBe(true)
    expect(isSimplePolygon(L)).toBe(true)
  })
  it('rejects a self-crossing rectilinear outline', () => {
    // "S" that crosses itself: edge 1→2 crosses edge 4→5
    const crossing: Vec2[] = [
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 2 },
      { x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ]
    expect(isSimplePolygon(crossing)).toBe(false)
  })
  it('rejects non-adjacent edges that touch (pinch)', () => {
    const pinched: Vec2[] = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 },
      { x: 2, y: 0.0 }, { x: 2, y: 2.0 }, { x: 0, y: 2 },
    ]
    expect(isSimplePolygon(pinched)).toBe(false)
  })
})

describe('pointInPolygon', () => {
  it('handles the L notch correctly', () => {
    expect(pointInPolygon({ x: 1, y: 0.5 }, L)).toBe(true)   // in the upper arm
    expect(pointInPolygon({ x: 3, y: 0.5 }, L)).toBe(false)  // inside the notch (outside the room)
    expect(pointInPolygon({ x: 3, y: 2 }, L)).toBe(true)     // in the lower body
    expect(pointInPolygon({ x: 5, y: 2 }, L)).toBe(false)    // fully outside
  })
})

describe('metrics', () => {
  it('centroid of a rect is its center; L centroid is area-weighted', () => {
    expect(polygonCentroid(rectToPolygon({ x: 1, y: 1, width: 2, height: 4 }))).toEqual({ x: 2, y: 3 })
    const c = polygonCentroid(L)
    // L = 2×1 upper-left arm (area 2, centroid (1, 0.5)) + 4×2 lower body (area 8, centroid (2, 2))
    // → x̄ = (2·1 + 8·2)/10 = 1.8, ȳ = (2·0.5 + 8·2)/10 = 1.7
    expect(c.x).toBeCloseTo(1.8)
    expect(c.y).toBeCloseTo(1.7)
  })
  it('bounds and min edge', () => {
    expect(polygonBounds(L)).toEqual({ x: 0, y: 0, width: 4, height: 3 })
    expect(minEdgeLength(L)).toBe(1)
  })
})

describe('validateRoomPolygon', () => {
  it('accepts L, rejects sub-MIN_EDGE edges', () => {
    expect(validateRoomPolygon(L)).toBe(true)
    const sliver = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.05 }, { x: 0, y: 0.05 }]
    expect(MIN_EDGE).toBe(0.1)
    expect(validateRoomPolygon(sliver)).toBe(false)
  })
  it('rejects reversed winding (negative signed area)', () => {
    const reversed = [...L].reverse()
    expect(signedPolygonArea(L)).toBeGreaterThan(0)
    expect(signedPolygonArea(reversed)).toBeLessThan(0)
    expect(validateRoomPolygon(reversed)).toBe(false)
  })
})

describe('mergeCollinear', () => {
  it('identity on a canonical rect', () => {
    const rect = rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })
    const r = mergeCollinear(rect)
    expect(r.polygon).toEqual(rect)
    expect(r.edgeIndexMap).toEqual([0, 1, 2, 3])
    expect(r.offsetShift).toEqual([0, 0, 0, 0])
  })

  it('merges a split vertex back into one edge with offset shifts', () => {
    // rect top edge split at x=1.5: vertices v0(0,0) v1(1.5,0) v2(4,0) v3(4,3) v4(0,3)
    const split: Vec2[] = [
      { x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ]
    const r = mergeCollinear(split)
    expect(r.polygon).toEqual(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 }))
    // old edge 0 (v0→v1) → new edge 0, shift 0; old edge 1 (v1→v2) → new edge 0, shift 1.5
    expect(r.edgeIndexMap[0]).toBe(0)
    expect(r.edgeIndexMap[1]).toBe(0)
    expect(r.offsetShift[1]).toBe(1.5)
    // later edges shift down by one
    expect(r.edgeIndexMap[2]).toBe(1)
    expect(r.edgeIndexMap[3]).toBe(2)
    expect(r.offsetShift[2]).toBe(0)
  })

  it('handles a removable vertex at index 0 by rotating the start', () => {
    // same rect but listed starting at the straight-through vertex (1.5, 0)
    const rotated: Vec2[] = [
      { x: 1.5, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 },
    ]
    const r = mergeCollinear(rotated)
    expect(r.polygon).toHaveLength(4)
    expect(r.polygon.map((p) => `${p.x},${p.y}`)).toContain('0,0')
    // every old edge maps into range and shifts are non-negative
    for (let i = 0; i < 5; i++) {
      expect(r.edgeIndexMap[i]).toBeGreaterThanOrEqual(0)
      expect(r.edgeIndexMap[i]).toBeLessThan(4)
      expect(r.offsetShift[i]).toBeGreaterThanOrEqual(0)
    }
  })
})

const room = (polygon: Vec2[]): Room => ({ id: 'r1', name: 'A', color: '#8ecae6', polygon })
const door = (edgeIndex: number, offset: number): Opening => ({
  id: 'd1', kind: 'door', roomId: 'r1', edgeIndex, offset, width: 0.9, height: 2.1, sillHeight: 0,
})
const art = (edgeIndex: number, offset: number): WallItem => ({
  id: 'w1', catalogId: 'wall-art', mount: 'wall', roomId: 'r1', edgeIndex, offset,
  elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 },
})
const planWith = (r: Room, openings: Opening[] = [], furniture: WallItem[] = []): Plan => ({
  ...createDefaultPlan(), rooms: [r], openings, furniture,
})

describe('translateRoom', () => {
  it('moves every vertex and keeps attachments untouched', () => {
    const p = planWith(room(rectToPolygon({ x: 1, y: 1, width: 3, height: 2 })), [door(0, 1.5)])
    const out = translateRoom(p, 'r1', { x: 0.5, y: -0.5 })!
    expect(out.rooms[0].polygon[0]).toEqual({ x: 1.5, y: 0.5 })
    expect(out.openings[0]).toEqual(p.openings[0])
  })
})

describe('pushRoomEdge', () => {
  const p = planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })), [door(1, 1.5)])
  it('slides a wall; attachments on neighbors re-clamp', () => {
    // edge 1 is the right wall (x=4, length 3); door at offset 1.5 on it
    // push the TOP edge (0) down to y=2: right wall shrinks to length 1 → door offset clamps
    const out = pushRoomEdge(p, 'r1', 0, 2)!
    expect(out.rooms[0].polygon).toEqual(rectToPolygon({ x: 0, y: 2, width: 4, height: 1 }))
    expect(out.openings[0].offset).toBe(0.55) // clampOffset(1.5, 0.9, 1) → 1 − 0.45
  })
  it('rejects pushing through the opposite wall', () => {
    expect(pushRoomEdge(p, 'r1', 0, 3)).toBeNull()   // area 0
    expect(pushRoomEdge(p, 'r1', 0, 3.5)).toBeNull() // inverted / self-intersecting
  })
  it('rejects a push that would create a sub-MIN_EDGE neighbor', () => {
    expect(pushRoomEdge(p, 'r1', 0, 2.95)).toBeNull()
  })
  it('handles the wrap case: pushing edge n-1 (the LEFT wall)', () => {
    // edge 3 wraps from the last vertex (0,3) to vertex 0 (0,0); pushing it must not
    // scramble the polygon via a naive non-wrapping rebuild
    const wp = planWith(
      room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })),
      [door(0, 1.5), { ...door(1, 1.2), id: 'd2' }, { ...door(2, 2.0), id: 'd3' }],
    )
    const out = pushRoomEdge(wp, 'r1', 3, 1)!
    expect(out.rooms[0].polygon).toEqual(rectToPolygon({ x: 1, y: 0, width: 3, height: 3 }))
    // top/right/bottom walls are unaffected in index and (since offsets stay clear of the
    // shrunk bounds) in offset too
    expect(out.openings.find((o) => o.id === 'd1')).toEqual({ ...wp.openings.find((o) => o.id === 'd1')! })
    expect(out.openings.find((o) => o.id === 'd2')).toEqual({ ...wp.openings.find((o) => o.id === 'd2')! })
    expect(out.openings.find((o) => o.id === 'd3')).toEqual({ ...wp.openings.find((o) => o.id === 'd3')! })
  })
})

describe('splitRoomEdge', () => {
  const base = planWith(
    room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })),
    [door(0, 1.0), { ...door(0, 3.0), id: 'd2' }],
    [art(2, 2.0)],
  )
  it('splits the top edge; items re-home by center; later indices shift', () => {
    const out = splitRoomEdge(base, 'r1', 0, 2)!
    expect(out.rooms[0].polygon).toHaveLength(5)
    expect(out.rooms[0].polygon[1]).toEqual({ x: 2, y: 0 })
    const d1 = out.openings.find((o) => o.id === 'd1')!
    const d2 = out.openings.find((o) => o.id === 'd2')!
    expect([d1.edgeIndex, d1.offset]).toEqual([0, 1.0])   // center 1.0 < 2 → first sub-edge
    expect([d2.edgeIndex, d2.offset]).toEqual([1, 1.0])   // center 3.0 ≥ 2 → second, offset 3−2
    const w = out.furniture[0] as WallItem
    expect(w.edgeIndex).toBe(3)                            // old edge 2 shifts +1
    expect(w.offset).toBe(2.0)
  })
  it('rejects sliver splits', () => {
    expect(splitRoomEdge(base, 'r1', 0, 0.05)).toBeNull()
    expect(splitRoomEdge(base, 'r1', 0, 3.95)).toBeNull()
  })
})

describe('split → push → merge round-trip', () => {
  it('a notch pushed flush merges back to the original rect and re-homes the door', () => {
    const p = planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })), [{ ...door(0, 3.0), id: 'd1' }])
    const split = splitRoomEdge(p, 'r1', 0, 2)!
    // door center 3.0 ≥ 2 → re-homed to the second sub-edge (index 1) at offset 1.0
    // push the FIRST sub-edge (edge 0, y=0) down to 1:
    //   prev neighbor (left wall) is perpendicular → endpoint moves; next neighbor (second
    //   sub-edge) is PARALLEL → connector vertex (2, 0) inserted after the moved endpoint
    //   → polygon (0,1),(2,1),(2,0),(4,0),(4,3),(0,3) — a proper L, 6 vertices
    const notched = pushRoomEdge(split, 'r1', 0, 1)!
    expect(notched.rooms[0].polygon).toEqual([
      { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ])
    expect(validateRoomPolygon(notched.rooms[0].polygon)).toBe(true)
    // door's edge (old index 1, second sub-edge) shifted +1 by the connector insertion → index 2, offset intact
    const d = notched.openings[0]
    expect([d.edgeIndex, d.offset]).toEqual([2, 1.0])
    // push the notch flush: endpoints return to y=0, the connector collapses to zero length
    // and is deduped → 5 vertices with a collinear pair; drag-end merge → original rect
    const flush = pushRoomEdge(notched, 'r1', 0, 0)!
    expect(flush.rooms[0].polygon).toHaveLength(5)
    const merged = mergeRoomCollinear(flush, 'r1')
    expect(merged.rooms[0].polygon).toHaveLength(4)
    expect(merged.openings[0].edgeIndex).toBe(0)
    expect(merged.openings[0].offset).toBe(3.0)
    expect(polygonArea(merged.rooms[0].polygon)).toBe(12)
  })
})

describe('moveRoomVertex', () => {
  it('reproduces rect corner-resize semantics', () => {
    const p = planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })))
    const out = moveRoomVertex(p, 'r1', 0, { x: 1, y: 0.5 })!
    expect(out.rooms[0].polygon).toEqual(rectToPolygon({ x: 1, y: 0.5, width: 3, height: 2.5 }))
  })
  it('rejects a move that collapses an edge below MIN_EDGE', () => {
    const p = planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })))
    expect(moveRoomVertex(p, 'r1', 0, { x: 3.95, y: 0 })).toBeNull()
  })
})
