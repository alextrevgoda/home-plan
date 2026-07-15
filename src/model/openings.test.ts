import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import { createDefaultPlan } from './serialization'
import type { Opening, Plan, Room } from './types'
import {
  clampOffset,
  doorSwing,
  fitOpeningWidth,
  mergeIntervals,
  openingsOnEdge,
  openingSpan,
  openingWarnings,
  projectOntoEdge,
  roomEdge,
} from './openings'

const roomAt = (x: number, y: number, w: number, h: number, id: string): Room => ({
  id,
  name: id,
  polygon: rectToPolygon({ x, y, width: w, height: h }),
  color: '#8ecae6',
})

const door = (roomId: string, edgeIndex: number, offset: number, width = 1): Opening => ({
  id: `${roomId}-e${edgeIndex}-${offset}`,
  kind: 'door',
  roomId,
  edgeIndex,
  offset,
  width,
  height: 2.1,
  sillHeight: 0,
})

const planWith = (rooms: Room[], openings: Opening[]): Plan => ({
  ...createDefaultPlan(),
  rooms,
  openings,
})

describe('roomEdge', () => {
  const room = roomAt(0, 0, 4, 3, 'A')

  it('resolves each edge with direction and length', () => {
    expect(roomEdge(room, 0)).toEqual({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, length: 4, ux: 1, uy: 0 })
    expect(roomEdge(room, 2)).toEqual({ a: { x: 4, y: 3 }, b: { x: 0, y: 3 }, length: 4, ux: -1, uy: 0 })
  })

  it('returns null for out-of-range indices', () => {
    expect(roomEdge(room, 4)).toBeNull()
    expect(roomEdge(room, -1)).toBeNull()
    expect(roomEdge(room, 1.5)).toBeNull()
  })
})

describe('clampOffset', () => {
  it('keeps the opening fully on the edge', () => {
    expect(clampOffset(0.2, 1, 4)).toBe(0.5)
    expect(clampOffset(3.9, 1, 4)).toBe(3.5)
    expect(clampOffset(2, 1, 4)).toBe(2)
  })

  it('centers the opening when the edge is shorter than the opening', () => {
    expect(clampOffset(2, 5, 4)).toBe(2)
    expect(clampOffset(0, 5, 4)).toBe(2)
  })
})

describe('openingSpan', () => {
  const room = roomAt(0, 0, 4, 3, 'A')

  it('resolves a span on a forward edge', () => {
    const span = openingSpan(door('A', 0, 2), room)
    expect(span).toEqual({ a: { x: 1.5, y: 0 }, b: { x: 2.5, y: 0 } })
  })

  it('resolves a span on a reversed edge', () => {
    const span = openingSpan(door('A', 2, 1), room)
    expect(span).toEqual({ a: { x: 3.5, y: 3 }, b: { x: 2.5, y: 3 } })
  })

  it('returns null for a bad edge index', () => {
    expect(openingSpan(door('A', 9, 1), room)).toBeNull()
  })
})

describe('projectOntoEdge', () => {
  const edge = roomEdge(roomAt(0, 0, 4, 3, 'A'), 0)!

  it('projects and clamps to the edge', () => {
    expect(projectOntoEdge(edge, { x: 2.34, y: 5 })).toBeCloseTo(2.34)
    expect(projectOntoEdge(edge, { x: -3, y: 0 })).toBe(0)
    expect(projectOntoEdge(edge, { x: 9, y: 0 })).toBe(4)
  })
})

describe('openingsOnEdge', () => {
  const roomA = roomAt(0, 0, 4, 3, 'A')
  const roomB = roomAt(0, 3, 4, 3, 'B')

  it("finds the neighbour room's opening on a shared edge", () => {
    // door owned by A on its bottom edge (edge 2, running right→left)
    const plan = planWith([roomA, roomB], [door('A', 2, 1)])
    // query B's top edge (0,3)→(4,3)
    const intervals = openingsOnEdge({ x: 0, y: 3 }, { x: 4, y: 3 }, plan)
    expect(intervals).toHaveLength(1)
    expect(intervals[0].start).toBeCloseTo(2.5)
    expect(intervals[0].end).toBeCloseTo(3.5)
  })

  it('ignores parallel but non-collinear edges', () => {
    const plan = planWith([roomA, roomB], [door('A', 2, 1)])
    const intervals = openingsOnEdge({ x: 0, y: 6 }, { x: 4, y: 6 }, plan)
    expect(intervals).toHaveLength(0)
  })

  it('clips intervals to the query edge and drops slivers', () => {
    // opening centered at the very start of A's top edge, half hanging off
    const plan = planWith([roomA], [door('A', 0, 0.1)])
    const intervals = openingsOnEdge({ x: 0, y: 0 }, { x: 4, y: 0 }, plan)
    expect(intervals).toHaveLength(1)
    expect(intervals[0].start).toBe(0)
    expect(intervals[0].end).toBeCloseTo(0.6)
  })
})

describe('mergeIntervals', () => {
  it('merges overlapping intervals and keeps disjoint ones', () => {
    expect(
      mergeIntervals([
        { start: 1, end: 2 },
        { start: 1.5, end: 3 },
        { start: 4, end: 5 },
      ]),
    ).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 5 },
    ])
  })

  it('returns empty for empty input', () => {
    expect(mergeIntervals([])).toEqual([])
  })
})

describe('openingWarnings', () => {
  const roomA = roomAt(0, 0, 4, 3, 'A')

  it('flags an opening wider than its edge', () => {
    const wide = door('A', 0, 2, 5)
    const plan = planWith([roomA], [wide])
    expect(openingWarnings(plan)).toEqual(new Set([wide.id]))
  })

  it('flags both openings when they overlap on the same wall', () => {
    const d1 = door('A', 0, 2)
    const d2 = door('A', 0, 2.4)
    const plan = planWith([roomA], [d1, d2])
    expect(openingWarnings(plan)).toEqual(new Set([d1.id, d2.id]))
  })

  it('does not flag separated openings', () => {
    const plan = planWith([roomA], [door('A', 0, 1), door('A', 0, 3)])
    expect(openingWarnings(plan)).toEqual(new Set())
  })
})

describe('doorSwing', () => {
  const room: Room = {
    id: 'r1', name: 'R', color: '#8ecae6',
    polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  }
  const door = (patch: Partial<Opening>): Opening => ({
    id: 'o1', kind: 'door', roomId: 'r1', edgeIndex: 0, offset: 2, width: 1,
    height: 2.1, sillHeight: 0, hinge: 'start', swing: 'in', open: false, ...patch,
  })

  it('hinge start, swing in: opens into the room (top edge → +y)', () => {
    const s = doorSwing(door({}), room)!
    expect(s.hinge).toEqual({ x: 1.5, y: 0 })
    expect(s.closedEnd).toEqual({ x: 2.5, y: 0 })
    expect(s.openEnd.x).toBeCloseTo(1.5, 10)
    expect(s.openEnd.y).toBeCloseTo(1, 10)
  })

  it('hinge end pivots on the far jamb', () => {
    const s = doorSwing(door({ hinge: 'end' }), room)!
    expect(s.hinge).toEqual({ x: 2.5, y: 0 })
    expect(s.closedEnd).toEqual({ x: 1.5, y: 0 })
    expect(s.openEnd.x).toBeCloseTo(2.5, 10)
    expect(s.openEnd.y).toBeCloseTo(1, 10)
  })

  it('swing out flips to the exterior side', () => {
    const s = doorSwing(door({ swing: 'out' }), room)!
    expect(s.openEnd.y).toBeCloseTo(-1, 10)
  })

  it('vertical edge: interior is -x for the east wall', () => {
    const s = doorSwing(door({ edgeIndex: 1, offset: 1.5 }), room)!
    expect(s.hinge).toEqual({ x: 4, y: 1 })
    expect(s.openEnd.x).toBeCloseTo(3, 10)
    expect(s.openEnd.y).toBeCloseTo(1, 10)
  })

  it('returns null for windows', () => {
    expect(doorSwing(door({ kind: 'window' }), room)).toBeNull()
  })
})

describe('fitOpeningWidth', () => {
  it('caps width at the edge length', () => expect(fitOpeningWidth(1, 0.5)).toBe(0.5))
  it('keeps width that fits', () => expect(fitOpeningWidth(1, 4)).toBe(1))
  it('never goes below the minimum', () => expect(fitOpeningWidth(1, 0.2)).toBe(0.3))
})
