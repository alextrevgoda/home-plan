import { normalizeRoundDeg, roundCm } from '../model/geometry'
import { catalogItem, type Layer } from '../model/catalog'
import { ROTATION_SNAP_DEG, footprintCorners, pointInConvexPolygon, wallItemSpan } from '../model/furniture'
import { pointInPolygon } from '../model/polygon'
import type { FloorItem, Plan, Room, Selection, Vec2 } from '../model/types'
import { worldToScreen, screenToWorld, type Viewport } from './viewport'
import { openingSpan, projectOntoEdge, roomEdge } from '../model/openings'

export function hitRoom(rooms: Room[], world: Vec2): string | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    if (pointInPolygon(world, rooms[i].polygon)) return rooms[i].id
  }
  return null
}

export interface PolygonHandle {
  kind: 'vertex' | 'edge'
  index: number
  point: Vec2
}

export function polygonHandles(room: Room): PolygonHandle[] {
  const n = room.polygon.length
  const handles: PolygonHandle[] = []
  for (let i = 0; i < n; i++) {
    const prev = room.polygon[(i - 1 + n) % n]
    const cur = room.polygon[i]
    const next = room.polygon[(i + 1) % n]
    const corner = (prev.x === cur.x) !== (cur.x === next.x)
    if (corner) handles.push({ kind: 'vertex', index: i, point: cur })
  }
  for (let i = 0; i < n; i++) {
    const a = room.polygon[i]
    const b = room.polygon[(i + 1) % n]
    handles.push({ kind: 'edge', index: i, point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } })
  }
  return handles
}

export function hitPolygonHandle(room: Room, viewport: Viewport, screen: Vec2, radius = 8): PolygonHandle | null {
  const handles = polygonHandles(room)
  for (const kind of ['vertex', 'edge'] as const) {
    for (const h of handles) {
      if (h.kind !== kind) continue
      const s = worldToScreen(viewport, h.point)
      if (Math.abs(s.x - screen.x) <= radius && Math.abs(s.y - screen.y) <= radius) return h
    }
  }
  return null
}

export function edgeIsHorizontal(polygon: Vec2[], edgeIndex: number): boolean {
  return polygon[edgeIndex].y === polygon[(edgeIndex + 1) % polygon.length].y
}

export function nearestRoomEdge(
  room: Room,
  viewport: Viewport,
  screen: Vec2,
  radius = 8,
): { edgeIndex: number; t: number } | null {
  let best: { edgeIndex: number; t: number } | null = null
  let bestDist = radius
  for (let i = 0; i < room.polygon.length; i++) {
    const edge = roomEdge(room, i)
    if (!edge) continue
    const a = worldToScreen(viewport, edge.a)
    const b = worldToScreen(viewport, edge.b)
    const d = distToSegmentScreen(screen, a, b)
    if (d <= bestDist) {
      bestDist = d
      const world = screenToWorld(viewport, screen)
      best = { edgeIndex: i, t: roundCm(projectOntoEdge(edge, world)) }
    }
  }
  return best
}

export function distToSegmentScreen(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

export interface OpeningJambHit {
  openingId: string
  end: 'start' | 'end'
}

// Jamb resize handles only exist on the selected opening, so they can't steal
// pointer-downs from neighboring openings or rooms.
export function hitOpeningJamb(
  plan: Plan,
  selection: Selection | null,
  viewport: Viewport,
  screen: Vec2,
  radius = 8,
): OpeningJambHit | null {
  if (selection?.kind !== 'opening') return null
  const opening = plan.openings.find((o) => o.id === selection.id)
  const room = opening ? plan.rooms.find((r) => r.id === opening.roomId) : undefined
  const span = opening && room ? openingSpan(opening, room) : null
  if (!opening || !span) return null
  for (const [end, point] of [['start', span.a], ['end', span.b]] as const) {
    const s = worldToScreen(viewport, point)
    if (Math.abs(s.x - screen.x) <= radius && Math.abs(s.y - screen.y) <= radius) {
      return { openingId: opening.id, end }
    }
  }
  return null
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

// Finger contact patches are much larger than a mouse cursor, so every screen-space
// hit-test doubles its radius when the interacting pointer is a touch.
export function hitRadius(base: number, pointerType?: string): number {
  return pointerType === 'touch' ? base * 2 : base
}
