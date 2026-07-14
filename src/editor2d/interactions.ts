import { MIN_ROOM_SIZE, normalizeRoundDeg, roundCm } from '../model/geometry'
import { catalogItem, type Layer } from '../model/catalog'
import { ROTATION_SNAP_DEG, footprintCorners, pointInConvexPolygon, wallItemSpan } from '../model/furniture'
import { pointInPolygon } from '../model/polygon'
import type { FloorItem, Plan, Rect, Room, Vec2 } from '../model/types'
import { worldToScreen, screenToWorld, type Viewport } from './viewport'
import { openingSpan, projectOntoEdge, roomEdge } from '../model/openings'

export const HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type HandleId = (typeof HANDLE_IDS)[number]

export function handlePositions(rect: Rect): Record<HandleId, Vec2> {
  const { x, y, width: w, height: h } = rect
  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
  }
}

export function hitRoom(rooms: Room[], world: Vec2): string | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    if (pointInPolygon(world, rooms[i].polygon)) return rooms[i].id
  }
  return null
}

export function hitHandle(rect: Rect, viewport: Viewport, screen: Vec2, radius = 8): HandleId | null {
  const positions = handlePositions(rect)
  for (const id of HANDLE_IDS) {
    const s = worldToScreen(viewport, positions[id])
    if (Math.abs(s.x - screen.x) <= radius && Math.abs(s.y - screen.y) <= radius) return id
  }
  return null
}

export function applyResize(rect: Rect, handle: HandleId, p: Vec2): Rect {
  let { x, y, width, height } = rect
  const right = x + width
  const bottom = y + height

  if (handle.includes('w')) {
    const nx = Math.min(p.x, right - MIN_ROOM_SIZE)
    width = right - nx
    x = nx
  }
  if (handle.includes('e')) {
    width = Math.max(MIN_ROOM_SIZE, p.x - x)
  }
  if (handle.includes('n')) {
    const ny = Math.min(p.y, bottom - MIN_ROOM_SIZE)
    height = bottom - ny
    y = ny
  }
  if (handle.includes('s')) {
    height = Math.max(MIN_ROOM_SIZE, p.y - y)
  }
  return { x, y, width, height }
}

export function distToSegmentScreen(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

export function hitOpening(plan: Plan, viewport: Viewport, screen: Vec2, radius = 8): string | null {
  for (let i = plan.openings.length - 1; i >= 0; i--) {
    const opening = plan.openings[i]
    const room = plan.rooms.find((r) => r.id === opening.roomId)
    if (!room) continue
    const span = openingSpan(opening, room)
    if (!span) continue
    const a = worldToScreen(viewport, span.a)
    const b = worldToScreen(viewport, span.b)
    if (distToSegmentScreen(screen, a, b) <= radius) return opening.id
  }
  return null
}

export interface EdgeHit {
  roomId: string
  edgeIndex: number
  offset: number
}

export function nearestEdge(plan: Plan, viewport: Viewport, screen: Vec2, radius = 10): EdgeHit | null {
  let best: EdgeHit | null = null
  let bestDist = radius
  for (const room of plan.rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const edge = roomEdge(room, i)
      if (!edge) continue
      const a = worldToScreen(viewport, edge.a)
      const b = worldToScreen(viewport, edge.b)
      const d = distToSegmentScreen(screen, a, b)
      if (d <= bestDist) {
        bestDist = d
        const world = screenToWorld(viewport, screen)
        best = { roomId: room.id, edgeIndex: i, offset: roundCm(projectOntoEdge(edge, world)) }
      }
    }
  }
  return best
}

export function hitFurniture(plan: Plan, viewport: Viewport, screen: Vec2, radius = 8): string | null {
  // wall items are topmost
  for (let i = plan.furniture.length - 1; i >= 0; i--) {
    const item = plan.furniture[i]
    if (item.mount !== 'wall') continue
    const room = plan.rooms.find((r) => r.id === item.roomId)
    const span = room ? wallItemSpan(item, room) : null
    if (!span) continue
    const a = worldToScreen(viewport, span.a)
    const b = worldToScreen(viewport, span.b)
    if (distToSegmentScreen(screen, a, b) <= radius) return item.id
  }
  const world = screenToWorld(viewport, screen)
  const hitLayer = (layer: Layer): string | null => {
    for (let i = plan.furniture.length - 1; i >= 0; i--) {
      const item = plan.furniture[i]
      if (item.mount !== 'floor' || catalogItem(item.catalogId)?.layer !== layer) continue
      if (pointInConvexPolygon(world, footprintCorners(item.position, item.rotation, item.size))) return item.id
    }
    return null
  }
  return hitLayer('overlay') ?? hitLayer('solid') ?? hitLayer('underlay')
}

export function rotationHandleScreen(item: FloorItem, viewport: Viewport): Vec2 {
  const t = (item.rotation * Math.PI) / 180
  const dir = { x: Math.sin(t), y: -Math.cos(t) } // local (0,-1) rotated
  const topCenter = {
    x: item.position.x + dir.x * (item.size.depth / 2),
    y: item.position.y + dir.y * (item.size.depth / 2),
  }
  const s = worldToScreen(viewport, topCenter)
  return { x: s.x + dir.x * 24, y: s.y + dir.y * 24 }
}

export function hitRotationHandle(item: FloorItem, viewport: Viewport, screen: Vec2, radius = 9): boolean {
  const p = rotationHandleScreen(item, viewport)
  return Math.hypot(p.x - screen.x, p.y - screen.y) <= radius
}

export function rotationFromPointer(item: FloorItem, viewport: Viewport, screen: Vec2, snap: boolean): number {
  const c = worldToScreen(viewport, item.position)
  const deg = (Math.atan2(screen.y - c.y, screen.x - c.x) * 180) / Math.PI + 90
  const snapped = snap ? Math.round(deg / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG : deg
  return normalizeRoundDeg(snapped)
}
