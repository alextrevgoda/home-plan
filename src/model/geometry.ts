import type { Apartment, Rect, Vec2 } from './types'

export const MIN_ROOM_SIZE = 0.5

export function roundCm(v: number): number {
  return Math.round(v * 100) / 100
}

export function rectToPolygon(r: Rect): Vec2[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ]
}

export function polygonToRect(polygon: Vec2[]): Rect | null {
  if (polygon.length !== 4) return null
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const rect: Rect = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  if (rect.width === 0 || rect.height === 0) return null
  const corners = rectToPolygon(rect)
  const matches = corners.every((c) => polygon.some((p) => p.x === c.x && p.y === c.y))
  return matches ? { x: roundCm(x), y: roundCm(y), width: roundCm(rect.width), height: roundCm(rect.height) } : null
}

export function polygonArea(polygon: Vec2[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

export function rectInBounds(r: Rect, apartment: Apartment): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.width <= apartment.width && r.y + r.height <= apartment.depth
}

export function normalizeDeg(d: number): number {
  return ((d % 360) + 360) % 360
}

export function roundDeg(d: number): number {
  return Math.round(d * 10) / 10
}

// Normalizes then rounds, folding the one boundary case (values like 359.97 or
// -0.02 that round up to exactly 360) back to 0 so the result always lands in
// [0, 360). Rounding happens LAST: running normalizeDeg's modulo arithmetic on
// an already-rounded value would reintroduce float noise (e.g. 2.3 → 2.3000…114).
export function normalizeRoundDeg(d: number): number {
  const r = roundDeg(normalizeDeg(d))
  return r === 360 ? 0 : r
}
