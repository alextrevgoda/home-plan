import { describe, expect, it } from 'vitest'
import { floorShape } from './floorShape'

describe('floorShape', () => {
  it('builds a closed shape with y negated', () => {
    const shape = floorShape([
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 1 },
      { x: 4, y: 3 }, { x: 0, y: 3 },
    ])
    const pts = shape.getPoints()
    expect(pts[0].x).toBe(0)
    expect(pts.some((p) => p.x === 4 && p.y === -3)).toBe(true)
    expect(pts.length).toBeGreaterThanOrEqual(6)
  })
})
