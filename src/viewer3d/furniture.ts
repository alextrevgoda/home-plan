import { roomEdge } from '../model/openings'
import type { FloorItem, Plan, WallItem } from '../model/types'
import { WALL_THICKNESS } from './walls'

export interface ItemTransform {
  position: [number, number, number]
  rotationY: number
}

export function floorItemTransform(item: FloorItem): ItemTransform {
  return {
    position: [item.position.x, 0, item.position.y],
    rotationY: (-item.rotation * Math.PI) / 180,
  }
}

export function wallItemTransform(item: WallItem, plan: Plan): ItemTransform | null {
  const room = plan.rooms.find((r) => r.id === item.roomId)
  const edge = room ? roomEdge(room, item.edgeIndex) : null
  if (!edge) return null
  const nx = -edge.uy
  const ny = edge.ux
  const push = WALL_THICKNESS / 2 + item.size.depth / 2
  return {
    position: [
      edge.a.x + edge.ux * item.offset + nx * push,
      item.elevation,
      edge.a.y + edge.uy * item.offset + ny * push,
    ],
    rotationY: -Math.atan2(edge.uy, edge.ux),
  }
}
