import { catalogItem } from './catalog'
import { roundCm } from './geometry'
import { roomEdge } from './openings'
import type { Apartment, FloorItem, Plan, PlacedItem, Room, Size3, Vec2, WallItem } from './types'

export const WALL_SNAP_THRESHOLD = 0.15
export const ROTATION_SNAP_DEG = 15

const OVERLAP_EPS = 1e-9

export interface Footprint {
  position: Vec2
  rotation: number
  size: Size3
}

export function footprintCorners(position: Vec2, rotationDeg: number, size: Size3): Vec2[] {
  const t = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const hw = size.width / 2
  const hd = size.depth / 2
  const local: Vec2[] = [
    { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd },
  ]
  return local.map((p) => ({
    x: position.x + p.x * cos - p.y * sin,
    y: position.y + p.x * sin + p.y * cos,
  }))
}

function projectOntoAxis(poly: Vec2[], ax: number, ay: number): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of poly) {
    const d = p.x * ax + p.y * ay
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

export function convexOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const ax = -(q.y - p.y)
      const ay = q.x - p.x
      const [minA, maxA] = projectOntoAxis(a, ax, ay)
      const [minB, maxB] = projectOntoAxis(b, ax, ay)
      if (maxA <= minB + OVERLAP_EPS || maxB <= minA + OVERLAP_EPS) return false
    }
  }
  return true
}

export function pointInConvexPolygon(p: Vec2, poly: Vec2[]): boolean {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (cross === 0) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

export function isSolidFloorItem(item: PlacedItem): item is FloorItem {
  return item.mount === 'floor' && catalogItem(item.catalogId)?.layer === 'solid'
}

export function floorItemCollides(candidate: Footprint, plan: Plan, ignoreId?: string): boolean {
  const corners = footprintCorners(candidate.position, candidate.rotation, candidate.size)
  return plan.furniture.some(
    (f) =>
      f.id !== ignoreId &&
      isSolidFloorItem(f) &&
      convexOverlap(corners, footprintCorners(f.position, f.rotation, f.size)),
  )
}

export function collidingFurnitureIds(plan: Plan): Set<string> {
  const solids = plan.furniture.filter(isSolidFloorItem)
  const corners = solids.map((f) => footprintCorners(f.position, f.rotation, f.size))
  const ids = new Set<string>()
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      if (convexOverlap(corners[i], corners[j])) {
        ids.add(solids[i].id)
        ids.add(solids[j].id)
      }
    }
  }
  return ids
}

function aabbHalfExtents(rotationDeg: number, size: Size3): Vec2 {
  const t = (rotationDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(t))
  const sin = Math.abs(Math.sin(t))
  return {
    x: (size.width * cos + size.depth * sin) / 2,
    y: (size.width * sin + size.depth * cos) / 2,
  }
}

export function floorItemInBounds(candidate: Footprint, apartment: Apartment): boolean {
  return footprintCorners(candidate.position, candidate.rotation, candidate.size).every(
    (c) => c.x >= 0 && c.y >= 0 && c.x <= apartment.width && c.y <= apartment.depth,
  )
}

export function clampFloorItemPosition(
  position: Vec2,
  rotationDeg: number,
  size: Size3,
  apartment: Apartment,
): Vec2 {
  const e = aabbHalfExtents(rotationDeg, size)
  const clampAxis = (v: number, extent: number, max: number) =>
    extent * 2 > max ? max / 2 : Math.min(max - extent, Math.max(extent, v))
  return {
    x: roundCm(clampAxis(position.x, e.x, apartment.width)),
    y: roundCm(clampAxis(position.y, e.y, apartment.depth)),
  }
}

export function wallItemSpan(item: WallItem, room: Room): { a: Vec2; b: Vec2 } | null {
  const edge = roomEdge(room, item.edgeIndex)
  if (!edge) return null
  const s = item.offset - item.size.width / 2
  const e = item.offset + item.size.width / 2
  return {
    a: { x: edge.a.x + edge.ux * s, y: edge.a.y + edge.uy * s },
    b: { x: edge.a.x + edge.ux * e, y: edge.a.y + edge.uy * e },
  }
}
