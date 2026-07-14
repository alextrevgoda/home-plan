import type { Vec2 } from '../model/types'
import { zoomAt, type Viewport } from './viewport'

// Pure touch-gesture math for the 2D editor. Must stay free of Pixi/React/store imports.

export interface Tap {
  x: number
  y: number
  time: number
}

export function isDoubleTap(prev: Tap | null, next: Tap, maxDelayMs = 300, maxDistPx = 30): boolean {
  if (!prev) return false
  return (
    next.time - prev.time <= maxDelayMs &&
    Math.hypot(next.x - prev.x, next.y - prev.y) <= maxDistPx
  )
}

export function pinchTransform(viewport: Viewport, before: [Vec2, Vec2], after: [Vec2, Vec2]): Viewport {
  const d0 = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y)
  const d1 = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y)
  const factor = d0 > 0 && d1 > 0 ? d1 / d0 : 1
  const m0 = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 }
  const m1 = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 }
  const zoomed = zoomAt(viewport, m0, factor)
  return { ...zoomed, offsetX: zoomed.offsetX + (m1.x - m0.x), offsetY: zoomed.offsetY + (m1.y - m0.y) }
}
