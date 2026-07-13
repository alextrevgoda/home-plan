import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { Opening, Plan, Room } from '../model/types'
import { fillForOpening, WALL_THICKNESS, wallSegmentsForRoom, type WallPiece } from './walls'

const roomAt = (x: number, y: number, w: number, h: number, id: string): Room => ({
  id,
  name: id,
  polygon: rectToPolygon({ x, y, width: w, height: h }),
  color: '#8ecae6',
})

const planWith = (rooms: Room[], openings: Opening[]): Plan => ({
  ...createDefaultPlan(), // wallHeight 2.7
  rooms,
  openings,
})

const roomA = roomAt(0, 0, 4, 3, 'A')

const doorA: Opening = {
  id: 'd1',
  kind: 'door',
  roomId: 'A',
  edgeIndex: 0, // top edge (0,0)→(4,0)
  offset: 2,
  width: 1,
  height: 2.1,
  sillHeight: 0,
}

const expectPiece = (piece: WallPiece, center: number[], size: number[]) => {
  piece.center.forEach((v, i) => expect(v).toBeCloseTo(center[i]))
  piece.size.forEach((v, i) => expect(v).toBeCloseTo(size[i]))
}

// pieces on roomA's edge 0 lie on the line z = 0
const onEdge0 = (pieces: WallPiece[]) => pieces.filter((p) => Math.abs(p.center[2]) < 0.2)

describe('wallSegmentsForRoom without openings', () => {
  it('produces one full-height piece per edge with v1 corner extension', () => {
    const pieces = wallSegmentsForRoom(roomA, planWith([roomA], []))
    expect(pieces).toHaveLength(4)
    expectPiece(pieces[0], [2, 1.35, 0], [4 + WALL_THICKNESS, 2.7, WALL_THICKNESS])
    expect(pieces[0].rotationY).toBeCloseTo(0)
  })
})

describe('wallSegmentsForRoom with a door', () => {
  it('splits the edge into two jamb pieces and a lintel', () => {
    const pieces = wallSegmentsForRoom(roomA, planWith([roomA], [doorA]))
    expect(pieces).toHaveLength(6) // 3 on the cut edge + 3 full edges
    const edge = onEdge0(pieces)
    expect(edge).toHaveLength(3)
    // left jamb: t ∈ [−0.05, 1.5]
    expectPiece(edge[0], [0.725, 1.35, 0], [1.55, 2.7, WALL_THICKNESS])
    // lintel above the door: y ∈ [2.1, 2.7]
    expectPiece(edge[1], [2, 2.4, 0], [1, 0.6, WALL_THICKNESS])
    // right jamb: t ∈ [2.5, 4.05]
    expectPiece(edge[2], [3.275, 1.35, 0], [1.55, 2.7, WALL_THICKNESS])
  })
})

describe('wallSegmentsForRoom with a window', () => {
  it('adds a breast below and a lintel above the pane', () => {
    const windowA: Opening = { ...doorA, id: 'w1', kind: 'window', width: 1.2, height: 1.2, sillHeight: 0.9 }
    const pieces = wallSegmentsForRoom(roomA, planWith([roomA], [windowA]))
    expect(pieces).toHaveLength(7) // 4 on the cut edge + 3 full edges
    const edge = onEdge0(pieces)
    expect(edge).toHaveLength(4)
    // breast: y ∈ [0, 0.9]
    expectPiece(edge[1], [2, 0.45, 0], [1.2, 0.9, WALL_THICKNESS])
    // lintel: y ∈ [2.1, 2.7]
    expectPiece(edge[2], [2, 2.4, 0], [1.2, 0.6, WALL_THICKNESS])
  })
})

describe('cut-through on shared edges', () => {
  it("a door owned by room A also cuts room B's coincident wall", () => {
    const roomB = roomAt(0, 3, 4, 3, 'B')
    // door on A's bottom edge (edge 2, running (4,3)→(0,3)), centered at x = 3
    const sharedDoor: Opening = { ...doorA, id: 'd2', edgeIndex: 2, offset: 1 }
    const plan = planWith([roomA, roomB], [sharedDoor])
    const piecesB = wallSegmentsForRoom(roomB, plan)
    expect(piecesB).toHaveLength(6) // B's top edge is cut into 3 pieces too
    const cutEdge = piecesB.filter((p) => Math.abs(p.center[2] - 3) < 0.2 && Math.abs(p.rotationY) < 0.01)
    expect(cutEdge).toHaveLength(3)
    const lintel = cutEdge.find((p) => p.size[1] < 1)!
    expectPiece(lintel, [3, 2.4, 3], [1, 0.6, WALL_THICKNESS])
  })
})

describe('overlapping openings', () => {
  it('merge into a single gap', () => {
    const d1: Opening = { ...doorA, id: 'd1', offset: 1.5 }
    const d2: Opening = { ...doorA, id: 'd2', offset: 2.2 }
    const pieces = wallSegmentsForRoom(roomA, planWith([roomA], [d1, d2]))
    const edge = onEdge0(pieces)
    expect(edge).toHaveLength(3) // left jamb, one merged lintel, right jamb
    const lintel = edge.find((p) => p.size[1] < 1)!
    // merged gap t ∈ [1, 2.7]
    expectPiece(lintel, [1.85, 2.4, 0], [1.7, 0.6, WALL_THICKNESS])
  })
})

describe('fillForOpening', () => {
  it('positions a door panel from the floor', () => {
    const fill = fillForOpening(doorA, planWith([roomA], [doorA]))!
    expect(fill.kind).toBe('door')
    expectPiece(fill as unknown as WallPiece, [2, 1.05, 0], [1, 2.1, 0.04])
  })

  it('positions a window pane at sill height and clips to the wall', () => {
    const tall: Opening = { ...doorA, id: 'w2', kind: 'window', width: 1.2, height: 5, sillHeight: 0.9 }
    const fill = fillForOpening(tall, planWith([roomA], [tall]))!
    expect(fill.kind).toBe('window')
    // top clipped to 2.69: y ∈ [0.9, 2.69]
    expectPiece(fill as unknown as WallPiece, [2, 1.795, 0], [1.2, 1.79, 0.02])
  })

  it('returns null for an orphaned opening', () => {
    expect(fillForOpening(doorA, planWith([], [doorA]))).toBeNull()
  })
})
