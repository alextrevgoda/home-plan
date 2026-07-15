import { roundCm } from './geometry'
import type { Opening, Plan, Room, Vec2 } from './types'

export const OPENING_DEFAULTS = {
  door: { width: 0.9, height: 2.1, sillHeight: 0, hinge: 'start', swing: 'in', open: false },
  window: { width: 1.2, height: 1.2, sillHeight: 0.9 },
} as const

export const MIN_OPENING_WIDTH = 0.3

const COLLINEAR_EPS = 1e-6
const MIN_OVERLAP = 0.01

export interface Edge {
  a: Vec2
  b: Vec2
  length: number
  ux: number
  uy: number
}

export function roomEdge(room: Room, edgeIndex: number): Edge | null {
  const n = room.polygon.length
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return null
  const a = room.polygon[edgeIndex]
  const b = room.polygon[(edgeIndex + 1) % n]
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length === 0) return null
  return { a, b, length, ux: (b.x - a.x) / length, uy: (b.y - a.y) / length }
}

export function clampOffset(offset: number, width: number, edgeLength: number): number {
  if (edgeLength <= width) return roundCm(edgeLength / 2)
  return roundCm(Math.min(edgeLength - width / 2, Math.max(width / 2, offset)))
}

export function openingSpan(opening: Opening, room: Room): { a: Vec2; b: Vec2 } | null {
  const edge = roomEdge(room, opening.edgeIndex)
  if (!edge) return null
  const s = opening.offset - opening.width / 2
  const e = opening.offset + opening.width / 2
  return {
    a: { x: edge.a.x + edge.ux * s, y: edge.a.y + edge.uy * s },
    b: { x: edge.a.x + edge.ux * e, y: edge.a.y + edge.uy * e },
  }
}

export function projectOntoEdge(edge: Edge, p: Vec2): number {
  const t = (p.x - edge.a.x) * edge.ux + (p.y - edge.a.y) * edge.uy
  return Math.min(edge.length, Math.max(0, t))
}

export interface OpeningInterval {
  start: number
  end: number
  opening: Opening
}

export function openingsOnEdge(edgeA: Vec2, edgeB: Vec2, plan: Plan): OpeningInterval[] {
  const length = Math.hypot(edgeB.x - edgeA.x, edgeB.y - edgeA.y)
  if (length === 0) return []
  const ux = (edgeB.x - edgeA.x) / length
  const uy = (edgeB.y - edgeA.y) / length
  const distToLine = (p: Vec2) => Math.abs((p.x - edgeA.x) * uy - (p.y - edgeA.y) * ux)

  const result: OpeningInterval[] = []
  for (const opening of plan.openings) {
    const room = plan.rooms.find((r) => r.id === opening.roomId)
    if (!room) continue
    const span = openingSpan(opening, room)
    if (!span) continue
    if (distToLine(span.a) > COLLINEAR_EPS || distToLine(span.b) > COLLINEAR_EPS) continue
    const t1 = (span.a.x - edgeA.x) * ux + (span.a.y - edgeA.y) * uy
    const t2 = (span.b.x - edgeA.x) * ux + (span.b.y - edgeA.y) * uy
    const start = Math.max(0, Math.min(t1, t2))
    const end = Math.min(length, Math.max(t1, t2))
    if (end - start > MIN_OVERLAP) result.push({ start, end, opening })
  }
  return result
}

export interface Interval {
  start: number
  end: number
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ start: interval.start, end: interval.end })
  }
  return merged
}

export function openingWarnings(plan: Plan): Set<string> {
  const warned = new Set<string>()
  for (const opening of plan.openings) {
    const room = plan.rooms.find((r) => r.id === opening.roomId)
    if (!room) continue
    const edge = roomEdge(room, opening.edgeIndex)
    if (!edge) continue
    if (opening.width > edge.length + COLLINEAR_EPS) warned.add(opening.id)
    const intervals = openingsOnEdge(edge.a, edge.b, plan)
    const own = intervals.find((interval) => interval.opening.id === opening.id)
    if (!own) continue
    for (const other of intervals) {
      if (other.opening.id === opening.id) continue
      if (other.start < own.end - COLLINEAR_EPS && own.start < other.end - COLLINEAR_EPS) {
        warned.add(opening.id)
        break
      }
    }
  }
  return warned
}
