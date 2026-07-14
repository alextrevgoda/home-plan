import { describe, expect, it } from 'vitest'
import {
  clampFloorItemPosition, collidingFurnitureIds, convexOverlap, floorItemCollides,
  floorItemInBounds, footprintCorners, isSolidFloorItem, pointInConvexPolygon, wallItemSpan,
} from './furniture'
import { createDefaultPlan } from './serialization'
import type { FloorItem, Plan, Size3, WallItem } from './types'

const size: Size3 = { width: 2, depth: 1, height: 0.8 }
const sofa = (x: number, y: number, rotation = 0, id = 'a'): FloorItem => ({
  id, catalogId: 'sofa-3seat', mount: 'floor', position: { x, y }, rotation, size,
})
const rug = (x: number, y: number): FloorItem => ({
  id: 'r', catalogId: 'rug-rect', mount: 'floor', position: { x, y }, rotation: 0,
  size: { width: 2, depth: 1.4, height: 0.01 },
})
const planWith = (...furniture: FloorItem[]): Plan => ({ ...createDefaultPlan(), furniture })

describe('footprintCorners', () => {
  it('unrotated: axis-aligned box around the center', () => {
    const c = footprintCorners({ x: 5, y: 4 }, 0, size)
    expect(c).toEqual([
      { x: 4, y: 3.5 }, { x: 6, y: 3.5 }, { x: 6, y: 4.5 }, { x: 4, y: 4.5 },
    ])
  })
  it('90°: width and depth swap', () => {
    const c = footprintCorners({ x: 0, y: 0 }, 90, size)
    const xs = c.map((p) => p.x), ys = c.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2)
  })
})

describe('convexOverlap (SAT)', () => {
  const box = (x: number, y: number) => footprintCorners({ x, y }, 0, size)
  it('detects overlap', () => expect(convexOverlap(box(0, 0), box(1, 0.5))).toBe(true))
  it('separated boxes do not overlap', () => expect(convexOverlap(box(0, 0), box(5, 0))).toBe(false))
  it('touching edges do not overlap', () => expect(convexOverlap(box(0, 0), box(2, 0))).toBe(false))
  it('rotated: diagonal neighbor overlaps only when turned', () => {
    const a = footprintCorners({ x: 0, y: 0 }, 0, size)
    const turned = footprintCorners({ x: 1.4, y: 0.9 }, 45, size)
    const straight = footprintCorners({ x: 1.4, y: 0.9 }, 0, size)
    expect(convexOverlap(a, straight)).toBe(true)
    expect(convexOverlap(a, turned)).toBe(true)
    expect(convexOverlap(a, footprintCorners({ x: 2.3, y: 1.6 }, 45, size))).toBe(false)
  })
})

describe('collision + layers', () => {
  it('solid vs solid collides', () => {
    expect(floorItemCollides(sofa(1, 1), planWith(sofa(1.5, 1, 0, 'b')))).toBe(true)
  })
  it('ignores the candidate itself via ignoreId', () => {
    expect(floorItemCollides(sofa(1, 1), planWith(sofa(1, 1, 0, 'a')), 'a')).toBe(false)
  })
  it('rugs never collide', () => {
    expect(isSolidFloorItem(rug(1, 1))).toBe(false)
    expect(floorItemCollides(sofa(1, 1), planWith(rug(1, 1)))).toBe(false)
    expect(collidingFurnitureIds(planWith(sofa(1, 1), rug(1, 1)))).toEqual(new Set())
  })
  it('collidingFurnitureIds flags both solids of a pair', () => {
    expect(collidingFurnitureIds(planWith(sofa(1, 1, 0, 'a'), sofa(1.5, 1, 0, 'b')))).toEqual(new Set(['a', 'b']))
  })
})

describe('bounds', () => {
  const apartment = createDefaultPlan().apartment // 10 × 8
  it('inside is in bounds, straddling the boundary is not', () => {
    expect(floorItemInBounds(sofa(5, 4), apartment)).toBe(true)
    expect(floorItemInBounds(sofa(0.5, 4), apartment)).toBe(false) // width 2 → needs x ≥ 1
  })
  it('rotation widens the required margin', () => {
    expect(floorItemInBounds(sofa(1, 4, 0), apartment)).toBe(true)
    expect(floorItemInBounds(sofa(1, 4, 90), apartment)).toBe(true) // depth 1 → needs x ≥ 0.5
    expect(floorItemInBounds(sofa(0.4, 4, 90), apartment)).toBe(false) // depth/2 = 0.5 margin
  })
  it('clampFloorItemPosition pulls a stranded item back in', () => {
    expect(clampFloorItemPosition({ x: -3, y: 4 }, 0, size, apartment)).toEqual({ x: 1, y: 4 })
    expect(clampFloorItemPosition({ x: 5, y: 100 }, 0, size, apartment)).toEqual({ x: 5, y: 7.5 })
  })
})

describe('wallItemSpan', () => {
  it('resolves like openingSpan', () => {
    const room = { id: 'r1', name: 'A', color: '#8ecae6', polygon: [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ] }
    const art: WallItem = { id: 'w', catalogId: 'wall-art', mount: 'wall', roomId: 'r1',
      edgeIndex: 0, offset: 2, elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 } }
    expect(wallItemSpan(art, room)).toEqual({ a: { x: 1.6, y: 0 }, b: { x: 2.4, y: 0 } })
    expect(wallItemSpan({ ...art, edgeIndex: 9 }, room)).toBeNull()
  })
})
