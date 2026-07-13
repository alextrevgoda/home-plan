import { MIN_ROOM_SIZE, polygonToRect } from '../model/geometry'
import type { Rect, Room, Vec2 } from '../model/types'
import { worldToScreen, type Viewport } from './viewport'

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
    const rect = polygonToRect(rooms[i].polygon)
    if (
      rect &&
      world.x >= rect.x &&
      world.x <= rect.x + rect.width &&
      world.y >= rect.y &&
      world.y <= rect.y + rect.height
    ) {
      return rooms[i].id
    }
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
