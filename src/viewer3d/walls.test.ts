import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import { WALL_THICKNESS, wallsForPolygon } from './walls'

describe('wallsForPolygon', () => {
  const polygon = rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })

  it('produces one wall per edge', () => {
    expect(wallsForPolygon(polygon, 2.7)).toHaveLength(4)
  })

  it('centers walls on edge midpoints at half wall height', () => {
    const walls = wallsForPolygon(polygon, 2.7)
    expect(walls[0].center).toEqual([2, 1.35, 0]) // top edge (0,0)→(4,0)
    expect(walls[1].center).toEqual([4, 1.35, 1.5]) // right edge (4,0)→(4,3)
  })

  it('extends length by wall thickness to close corners', () => {
    const walls = wallsForPolygon(polygon, 2.7)
    expect(walls[0].length).toBeCloseTo(4 + WALL_THICKNESS)
    expect(walls[1].length).toBeCloseTo(3 + WALL_THICKNESS)
  })

  it('rotates walls to follow the edge direction', () => {
    const walls = wallsForPolygon(polygon, 2.7)
    expect(walls[0].rotationY).toBeCloseTo(0) // along +x
    expect(Math.abs(walls[1].rotationY)).toBeCloseTo(Math.PI / 2) // along z
  })
})
