import { doorSwing, mergeIntervals, openingsOnEdge, openingSpan } from '../model/openings'
import type { Opening, Plan, Room } from '../model/types'

export const WALL_THICKNESS = 0.1

const MIN_PIECE = 0.01

export interface WallPiece {
  center: [number, number, number]
  size: [number, number, number] // [length, height, thickness]
  rotationY: number
}

export function wallSegmentsForRoom(room: Room, plan: Plan): WallPiece[] {
  const wallHeight = plan.apartment.wallHeight
  const pieces: WallPiece[] = []
  const n = room.polygon.length

  for (let i = 0; i < n; i++) {
    const a = room.polygon[i]
    const b = room.polygon[(i + 1) % n]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) continue
    const ux = (b.x - a.x) / length
    const uy = (b.y - a.y) / length
    const rotationY = -Math.atan2(b.y - a.y, b.x - a.x)

    const push = (t0: number, t1: number, y0: number, y1: number) => {
      // pieces touching a corner extend past it so corners stay closed (v1 behavior)
      const s0 = t0 === 0 ? t0 - WALL_THICKNESS / 2 : t0
      const s1 = t1 === length ? t1 + WALL_THICKNESS / 2 : t1
      const len = s1 - s0
      const height = y1 - y0
      if (len <= MIN_PIECE || height <= MIN_PIECE) return
      const mid = (s0 + s1) / 2
      pieces.push({
        center: [a.x + ux * mid, (y0 + y1) / 2, a.y + uy * mid],
        size: [len, height, WALL_THICKNESS],
        rotationY,
      })
    }

    const intervals = openingsOnEdge(a, b, plan)
    if (intervals.length === 0) {
      push(0, length, 0, wallHeight)
      continue
    }

    const gaps = mergeIntervals(intervals).map((gap) => {
      const inGap = intervals.filter((iv) => iv.start < gap.end && gap.start < iv.end)
      const bottom = Math.min(...inGap.map((iv) => iv.opening.sillHeight))
      const top = Math.max(...inGap.map((iv) => iv.opening.sillHeight + iv.opening.height))
      return {
        start: gap.start,
        end: gap.end,
        bottom: Math.min(Math.max(0, bottom), wallHeight),
        top: Math.min(Math.max(0, top), wallHeight),
      }
    })

    let cursor = 0
    for (const gap of gaps) {
      push(cursor, gap.start, 0, wallHeight) // full-height piece before the gap
      push(gap.start, gap.end, 0, gap.bottom) // breast below (windows)
      push(gap.start, gap.end, gap.top, wallHeight) // lintel above
      cursor = gap.end
    }
    push(cursor, length, 0, wallHeight)
  }
  return pieces
}

export interface OpeningFill {
  kind: Opening['kind']
  center: [number, number, number]
  size: [number, number, number]
  rotationY: number
}

export function fillForOpening(opening: Opening, plan: Plan): OpeningFill | null {
  const room = plan.rooms.find((r) => r.id === opening.roomId)
  if (!room) return null
  const span = openingSpan(opening, room)
  if (!span) return null
  const wallHeight = plan.apartment.wallHeight
  const bottom = Math.min(Math.max(0, opening.sillHeight), wallHeight)
  const top = Math.max(bottom, Math.min(opening.sillHeight + opening.height, wallHeight - 0.01))
  const height = top - bottom
  if (height <= MIN_PIECE) return null

  if (opening.kind === 'door' && opening.open) {
    const swing = doorSwing(opening, room)
    if (swing) {
      const dx = swing.openEnd.x - swing.hinge.x
      const dy = swing.openEnd.y - swing.hinge.y
      return {
        kind: 'door',
        center: [(swing.hinge.x + swing.openEnd.x) / 2, (bottom + top) / 2, (swing.hinge.y + swing.openEnd.y) / 2],
        size: [Math.hypot(dx, dy), height, 0.04],
        rotationY: -Math.atan2(dy, dx),
      }
    }
  }

  const dx = span.b.x - span.a.x
  const dy = span.b.y - span.a.y
  return {
    kind: opening.kind,
    center: [(span.a.x + span.b.x) / 2, (bottom + top) / 2, (span.a.y + span.b.y) / 2],
    size: [Math.hypot(dx, dy), height, opening.kind === 'door' ? 0.04 : 0.02],
    rotationY: -Math.atan2(dy, dx),
  }
}
