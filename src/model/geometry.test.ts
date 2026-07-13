import { describe, expect, it } from 'vitest'
import {
  MIN_ROOM_SIZE,
  polygonArea,
  polygonToRect,
  rectInBounds,
  rectsOverlap,
  rectToPolygon,
  roundCm,
} from './geometry'

describe('roundCm', () => {
  it('rounds to centimeter precision', () => {
    expect(roundCm(1.2345)).toBe(1.23)
    expect(roundCm(1.239)).toBe(1.24)
    expect(roundCm(2)).toBe(2)
  })
})

describe('rectToPolygon / polygonToRect', () => {
  it('round-trips a rect through its polygon', () => {
    const rect = { x: 1, y: 2, width: 4, height: 3 }
    expect(polygonToRect(rectToPolygon(rect))).toEqual(rect)
  })

  it('produces corners in TL, TR, BR, BL order', () => {
    expect(rectToPolygon({ x: 0, y: 0, width: 2, height: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 1 },
    ])
  })

  it('rejects non-rectangular polygons', () => {
    expect(
      polygonToRect([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull()
  })

  it('rejects polygons with wrong point count or zero area', () => {
    expect(polygonToRect([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toBeNull()
    expect(
      polygonToRect([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBeNull()
  })

  it('returns cm-rounded dimensions despite float subtraction noise', () => {
    const rect = polygonToRect(rectToPolygon({ x: 1.6, y: 1.2, width: 3, height: 3 }))
    expect(rect).toEqual({ x: 1.6, y: 1.2, width: 3, height: 3 })
  })
})

describe('polygonArea', () => {
  it('computes rect area', () => {
    expect(polygonArea(rectToPolygon({ x: 1, y: 1, width: 4, height: 3 }))).toBe(12)
  })
  it('returns 0 for collinear points', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBe(0)
  })
})

describe('rectsOverlap', () => {
  const a = { x: 0, y: 0, width: 2, height: 2 }
  it('detects interior overlap', () => {
    expect(rectsOverlap(a, { x: 1, y: 1, width: 2, height: 2 })).toBe(true)
  })
  it('does not treat touching edges as overlap', () => {
    expect(rectsOverlap(a, { x: 2, y: 0, width: 2, height: 2 })).toBe(false)
  })
  it('detects no overlap when apart', () => {
    expect(rectsOverlap(a, { x: 5, y: 5, width: 1, height: 1 })).toBe(false)
  })
})

describe('rectInBounds', () => {
  const apartment = { width: 10, depth: 8, wallHeight: 2.7 }
  it('accepts a rect fully inside', () => {
    expect(rectInBounds({ x: 0, y: 0, width: 10, height: 8 }, apartment)).toBe(true)
  })
  it('rejects a rect crossing the boundary', () => {
    expect(rectInBounds({ x: 9, y: 0, width: 2, height: 2 }, apartment)).toBe(false)
    expect(rectInBounds({ x: -0.1, y: 0, width: 2, height: 2 }, apartment)).toBe(false)
  })
})

describe('MIN_ROOM_SIZE', () => {
  it('is 0.5 m', () => {
    expect(MIN_ROOM_SIZE).toBe(0.5)
  })
})
