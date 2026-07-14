import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import {
  isRectilinear, isSimplePolygon, MIN_EDGE, minEdgeLength,
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
