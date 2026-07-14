import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../model/types'
import { isDoubleTap, pinchTransform } from './gestures'
import { screenToWorld, type Viewport } from './viewport'

describe('pinchTransform', () => {
  it('zooms by the ratio of finger distances and anchors the world point under the midpoint', () => {
    const v: Viewport = { offsetX: 0, offsetY: 0, scale: 50 }
    const before: [Vec2, Vec2] = [{ x: 100, y: 200 }, { x: 300, y: 200 }]
    const after: [Vec2, Vec2] = [{ x: 50, y: 200 }, { x: 350, y: 200 }]
    const next = pinchTransform(v, before, after)
    expect(next.scale).toBeCloseTo(75) // 300px apart / 200px apart = 1.5x
    const worldBefore = screenToWorld(v, { x: 200, y: 200 })
    const worldAfter = screenToWorld(next, { x: 200, y: 200 })
    expect(worldAfter.x).toBeCloseTo(worldBefore.x)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y)
  })

  it('pans by the midpoint delta when the distance is unchanged', () => {
    const v: Viewport = { offsetX: 10, offsetY: 20, scale: 60 }
    const before: [Vec2, Vec2] = [{ x: 100, y: 100 }, { x: 200, y: 100 }]
    const after: [Vec2, Vec2] = [{ x: 140, y: 130 }, { x: 240, y: 130 }]
    const next = pinchTransform(v, before, after)
    expect(next.scale).toBeCloseTo(60)
    expect(next.offsetX).toBeCloseTo(50)
    expect(next.offsetY).toBeCloseTo(50)
  })

  it('respects the zoom clamp and survives coincident fingers', () => {
    const v: Viewport = { offsetX: 0, offsetY: 0, scale: 350 }
    const before: [Vec2, Vec2] = [{ x: 100, y: 100 }, { x: 110, y: 100 }]
    const after: [Vec2, Vec2] = [{ x: 0, y: 100 }, { x: 400, y: 100 }]
    expect(pinchTransform(v, before, after).scale).toBe(400)
    const degenerate: [Vec2, Vec2] = [{ x: 100, y: 100 }, { x: 100, y: 100 }]
    expect(pinchTransform(v, degenerate, after).scale).toBe(350) // factor treated as 1
  })
})

describe('isDoubleTap', () => {
  it('is true for two taps within 300ms and 30px', () => {
    expect(isDoubleTap({ x: 100, y: 100, time: 1000 }, { x: 110, y: 95, time: 1250 })).toBe(true)
  })
  it('is false when too slow, too far, or there is no previous tap', () => {
    expect(isDoubleTap({ x: 100, y: 100, time: 1000 }, { x: 100, y: 100, time: 1400 })).toBe(false)
    expect(isDoubleTap({ x: 100, y: 100, time: 1000 }, { x: 200, y: 100, time: 1100 })).toBe(false)
    expect(isDoubleTap(null, { x: 100, y: 100, time: 1000 })).toBe(false)
  })
})
