import type { Vec2 } from '../model/types'

export const WALL_THICKNESS = 0.1

export interface WallSegment {
  center: [number, number, number]
  length: number
  rotationY: number
}

export function wallsForPolygon(polygon: Vec2[], wallHeight: number): WallSegment[] {
  const walls: WallSegment[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    walls.push({
      center: [(a.x + b.x) / 2, wallHeight / 2, (a.y + b.y) / 2],
      length: Math.hypot(dx, dy) + WALL_THICKNESS,
      rotationY: -Math.atan2(dy, dx),
    })
  }
  return walls
}
