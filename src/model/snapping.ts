import { roundCm } from './geometry'
import type { Apartment, Rect } from './types'

export interface SnapLines {
  xs: number[]
  ys: number[]
}

export interface SnapGuide {
  axis: 'x' | 'y'
  position: number
}

export interface SnapOptions {
  gridStep: number
  gridThreshold: number
  edgeThreshold: number
}

export interface ScalarSnap {
  value: number
  guide: number | null
}

export interface MoveSnap {
  x: number
  y: number
  guides: SnapGuide[]
}

export function collectSnapLines(others: Rect[], apartment: Apartment): SnapLines {
  const xs = [0, apartment.width]
  const ys = [0, apartment.depth]
  for (const r of others) {
    xs.push(r.x, r.x + r.width)
    ys.push(r.y, r.y + r.height)
  }
  return { xs, ys }
}

export function snapScalar(value: number, candidates: number[], opts: SnapOptions): ScalarSnap {
  let best: number | null = null
  let bestDist = opts.edgeThreshold
  for (const c of candidates) {
    const d = Math.abs(value - c)
    if (d <= bestDist) {
      best = c
      bestDist = d
    }
  }
  if (best !== null) return { value: best, guide: best }

  const grid = Math.round(value / opts.gridStep) * opts.gridStep
  if (Math.abs(value - grid) <= opts.gridThreshold) return { value: roundCm(grid), guide: null }

  return { value: roundCm(value), guide: null }
}

function bestAxisSnap(
  start: number,
  size: number,
  candidates: number[],
  opts: SnapOptions,
): { pos: number; guide: number | null } {
  const leading = snapScalar(start, candidates, opts)
  const trailing = snapScalar(start + size, candidates, opts)
  const leadingDist = Math.abs(leading.value - start)
  const trailingDist = Math.abs(trailing.value - (start + size))

  if (leading.guide !== null && (trailing.guide === null || leadingDist <= trailingDist)) {
    return { pos: leading.value, guide: leading.guide }
  }
  if (trailing.guide !== null) {
    return { pos: roundCm(trailing.value - size), guide: trailing.guide }
  }
  return { pos: leading.value, guide: null }
}

export function snapMove(rect: Rect, lines: SnapLines, opts: SnapOptions): MoveSnap {
  const x = bestAxisSnap(rect.x, rect.width, lines.xs, opts)
  const y = bestAxisSnap(rect.y, rect.height, lines.ys, opts)
  const guides: SnapGuide[] = []
  if (x.guide !== null) guides.push({ axis: 'x', position: x.guide })
  if (y.guide !== null) guides.push({ axis: 'y', position: y.guide })
  return { x: x.pos, y: y.pos, guides }
}
