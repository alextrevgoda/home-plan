import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import {
  isRectilinear, isSimplePolygon, mergeCollinear, MIN_EDGE, minEdgeLength,
  pointInPolygon, polygonBounds, polygonCentroid, signedPolygonArea, validateRoomPolygon,
} from './polygon'
import type { Vec2 } from './types'

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
