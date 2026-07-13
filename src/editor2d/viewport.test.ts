import { describe, expect, it } from 'vitest'
import { fitApartment, screenToWorld, worldToScreen, zoomAt } from './viewport'

describe('worldToScreen / screenToWorld', () => {
  it('round-trips a point', () => {
    const v = { offsetX: 50, offsetY: 20, scale: 80 }
    const p = screenToWorld(v, worldToScreen(v, { x: 3.2, y: 1.5 }))
    expect(p.x).toBeCloseTo(3.2)
    expect(p.y).toBeCloseTo(1.5)
  })

  it('maps world origin to the viewport offset', () => {
    const v = { offsetX: 100, offsetY: 40, scale: 50 }
    expect(worldToScreen(v, { x: 0, y: 0 })).toEqual({ x: 100, y: 40 })
  })
})

describe('zoomAt', () => {
  it('keeps the anchor point fixed in world space', () => {
    const v = { offsetX: 0, offsetY: 0, scale: 100 }
    const anchor = { x: 200, y: 150 }
    const before = screenToWorld(v, anchor)
    const after = screenToWorld(zoomAt(v, anchor, 1.25), anchor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps scale to min/max', () => {
    const v = { offsetX: 0, offsetY: 0, scale: 100 }
    expect(zoomAt(v, { x: 0, y: 0 }, 100).scale).toBe(400)
    expect(zoomAt(v, { x: 0, y: 0 }, 0.0001).scale).toBe(5)
  })
})

describe('fitApartment', () => {
  it('fits and centers the apartment with padding', () => {
    const v = fitApartment(1000, 800, { width: 10, depth: 8, wallHeight: 2.7 })
    expect(v.scale).toBe(85)
    expect(v.offsetX).toBe(75)
    expect(v.offsetY).toBe(60)
  })
})
