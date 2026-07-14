import type { Rect, Vec2 } from './types'

export const MIN_EDGE = 0.1

const EPS = 1e-9

export function isRectilinear(polygon: Vec2[]): boolean {
  const n = polygon.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    if ((dx === 0) === (dy === 0)) return false // degenerate or diagonal
  }
  return true
}

interface Seg {
  a: Vec2
  b: Vec2
  horizontal: boolean
}

function seg(polygon: Vec2[], i: number): Seg {
  const a = polygon[i]
  const b = polygon[(i + 1) % polygon.length]
  return { a, b, horizontal: a.y === b.y }
}

const lo = (s: Seg) => (s.horizontal ? Math.min(s.a.x, s.b.x) : Math.min(s.a.y, s.b.y))
const hi = (s: Seg) => (s.horizontal ? Math.max(s.a.x, s.b.x) : Math.max(s.a.y, s.b.y))
const level = (s: Seg) => (s.horizontal ? s.a.y : s.a.x)

function segsTouch(p: Seg, q: Seg): boolean {
  if (p.horizontal === q.horizontal) {
    // parallel: touch only if on the same line with overlapping extents
    return level(p) === level(q) && lo(p) <= hi(q) + EPS && lo(q) <= hi(p) + EPS
  }
  const h = p.horizontal ? p : q
  const v = p.horizontal ? q : p
  return (
    level(v) >= lo(h) - EPS && level(v) <= hi(h) + EPS &&
    level(h) >= lo(v) - EPS && level(h) <= hi(v) + EPS
  )
}

export function isSimplePolygon(polygon: Vec2[]): boolean {
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) continue
      if (segsTouch(seg(polygon, i), seg(polygon, j))) return false
    }
  }
  return true
}

export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function polygonCentroid(polygon: Vec2[]): Vec2 {
  let area2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]
    const q = polygon[(i + 1) % polygon.length]
    const cross = p.x * q.y - q.x * p.y
    area2 += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  if (area2 === 0) return polygon[0]
  return { x: cx / (3 * area2), y: cy / (3 * area2) }
}

export function polygonBounds(polygon: Vec2[]): Rect {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function minEdgeLength(polygon: Vec2[]): number {
  let min = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    min = Math.min(min, Math.hypot(b.x - a.x, b.y - a.y))
  }
  return min
}

export function signedPolygonArea(polygon: Vec2[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function validateRoomPolygon(polygon: Vec2[]): boolean {
  return (
    isRectilinear(polygon) &&
    isSimplePolygon(polygon) &&
    minEdgeLength(polygon) >= MIN_EDGE - EPS &&
    signedPolygonArea(polygon) > 0 // positive = rectToPolygon winding; negative = reversed, rejected
  )
}
