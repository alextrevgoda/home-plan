import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import { createDefaultPlan, parsePlan, planSchema, serializePlan } from './serialization'
import type { FloorItem, Plan, WallItem } from './types'

describe('createDefaultPlan', () => {
  it('creates a valid empty v3 plan with spec defaults', () => {
    const plan = createDefaultPlan()
    expect(plan.version).toBe(3)
    expect(plan.apartment).toEqual({ width: 10, depth: 8, wallHeight: 2.7 })
    expect(plan.rooms).toEqual([])
    expect(plan.openings).toEqual([])
    expect(plan.furniture).toEqual([])
    expect(plan.id).not.toBe('')
  })
})

describe('serializePlan / parsePlan', () => {
  it('round-trips a plan with rooms', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Bedroom',
      polygon: rectToPolygon({ x: 1, y: 1, width: 4, height: 3 }),
      color: '#8ecae6',
    })
    expect(parsePlan(serializePlan(plan))).toEqual(plan)
  })

  it('rejects invalid JSON', () => {
    expect(parsePlan('{broken')).toBeNull()
  })

  it('rejects unknown schema version', () => {
    const plan = { ...createDefaultPlan(), version: 4 }
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects out-of-range apartment dimensions', () => {
    const plan = createDefaultPlan()
    plan.apartment.width = 500
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects degenerate (zero-area) polygons', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Broken',
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      color: '#8ecae6',
    })
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects bad color strings', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Bad color',
      polygon: rectToPolygon({ x: 0, y: 0, width: 1, height: 1 }),
      color: 'blue',
    })
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('round-trips a plan with openings', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Bedroom',
      polygon: rectToPolygon({ x: 1, y: 1, width: 4, height: 3 }),
      color: '#8ecae6',
    })
    plan.openings.push({
      id: 'o1',
      kind: 'door',
      roomId: 'r1',
      edgeIndex: 0,
      offset: 2,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    })
    expect(parsePlan(serializePlan(plan))).toEqual(plan)
  })

  it('migrates a v1 payload by adding empty openings', () => {
    const v1 = { ...createDefaultPlan(), version: 1 } as Record<string, unknown>
    delete v1.openings
    const parsed = parsePlan(JSON.stringify(v1))
    expect(parsed).not.toBeNull()
    expect(parsed!.version).toBe(3)
    expect(parsed!.openings).toEqual([])
    expect(parsed!.furniture).toEqual([])
  })

  it('rejects an opening referencing an unknown room', () => {
    const plan = createDefaultPlan()
    plan.openings.push({
      id: 'o1',
      kind: 'door',
      roomId: 'nope',
      edgeIndex: 0,
      offset: 1,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    })
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects an opening with an out-of-range edge index', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Room',
      polygon: rectToPolygon({ x: 0, y: 0, width: 3, height: 3 }),
      color: '#8ecae6',
    })
    plan.openings.push({
      id: 'o1',
      kind: 'window',
      roomId: 'r1',
      edgeIndex: 7,
      offset: 1,
      width: 1.2,
      height: 1.2,
      sillHeight: 0.9,
    })
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects non-finite opening dimensions', () => {
    const base = createDefaultPlan()
    base.rooms.push({
      id: 'r1',
      name: 'Room',
      polygon: rectToPolygon({ x: 0, y: 0, width: 3, height: 3 }),
      color: '#8ecae6',
    })
    for (const patch of [{ width: Infinity }, { height: Infinity }, { sillHeight: Infinity }]) {
      const plan = {
        ...base,
        openings: [
          { id: 'o1', kind: 'window', roomId: 'r1', edgeIndex: 0, offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9, ...patch },
        ],
      }
      expect(planSchema.safeParse(plan).success).toBe(false)
    }
  })
})

describe('v3 furniture', () => {
  const floorItem = {
    id: 'f1', catalogId: 'sofa-3seat', mount: 'floor',
    position: { x: 2, y: 2 }, rotation: 90, size: { width: 2.2, depth: 0.95, height: 0.85 },
  }

  it('migrates v2 to v3 by adding empty furniture', () => {
    const v2 = { ...createDefaultPlan(), version: 2 } as unknown as Record<string, unknown>
    delete v2.furniture
    const plan = parsePlan(JSON.stringify(v2))
    expect(plan?.version).toBe(3)
    expect(plan?.furniture).toEqual([])
  })

  it('migrates v1 all the way to v3', () => {
    const v1 = { ...createDefaultPlan(), version: 1 } as unknown as Record<string, unknown>
    delete v1.openings
    delete v1.furniture
    const plan = parsePlan(JSON.stringify(v1))
    expect(plan?.version).toBe(3)
    expect(plan?.openings).toEqual([])
    expect(plan?.furniture).toEqual([])
  })

  it('round-trips a valid floor item', () => {
    const plan = { ...createDefaultPlan(), furniture: [floorItem] }
    expect(parsePlan(serializePlan(plan as Plan))?.furniture).toHaveLength(1)
  })

  it('rejects unknown catalogId', () => {
    const plan = { ...createDefaultPlan(), furniture: [{ ...floorItem, catalogId: 'nope' }] }
    expect(parsePlan(serializePlan(plan as unknown as Plan))).toBeNull()
  })

  it('rejects wall items referencing unknown rooms or bad edges', () => {
    const wallItem = {
      id: 'w1', catalogId: 'wall-art', mount: 'wall', roomId: 'nope', edgeIndex: 0,
      offset: 1, elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 },
    }
    const plan = { ...createDefaultPlan(), furniture: [wallItem] }
    expect(parsePlan(serializePlan(plan as unknown as Plan))).toBeNull()
  })

  it('rejects unknown floorMaterial and bad wallColor on rooms', () => {
    const base = createDefaultPlan()
    const room = { id: 'r1', name: 'A', polygon: rectToPolygon({ x: 0, y: 0, width: 3, height: 3 }), color: '#8ecae6' }
    expect(parsePlan(serializePlan({ ...base, rooms: [{ ...room, floorMaterial: 'nope' }] } as Plan))).toBeNull()
    expect(parsePlan(serializePlan({ ...base, rooms: [{ ...room, wallColor: 'red' }] } as unknown as Plan))).toBeNull()
    expect(parsePlan(serializePlan({ ...base, rooms: [{ ...room, floorMaterial: 'oak', wallColor: '#aabbcc' }] } as Plan))).not.toBeNull()
  })

  it('clamps size to catalog bounds and normalizes rotation on import', () => {
    const plan = {
      ...createDefaultPlan(),
      furniture: [{ ...floorItem, rotation: -270, size: { width: 99, depth: 0.01, height: 0.85 } }],
    }
    const parsed = parsePlan(serializePlan(plan as Plan))
    const item = parsed?.furniture[0] as FloorItem | undefined
    expect(item?.rotation).toBe(90)
    expect(item?.size.width).toBe(2.8) // max width for sofa-3seat
    expect(item?.size.depth).toBe(0.8) // min depth
  })

  it('normalizes a rotation that rounds to exactly 360 back to 0, idempotently', () => {
    const plan = { ...createDefaultPlan(), furniture: [{ ...floorItem, rotation: 359.97 }] }
    const serialized = serializePlan(plan as Plan)
    const parsed = parsePlan(serialized)
    const item = parsed?.furniture[0] as FloorItem | undefined
    expect(item?.rotation).toBe(0)

    // Re-parsing the serialization of the already-normalized plan must be unchanged.
    const reparsed = parsePlan(serializePlan(parsed as Plan))
    expect(reparsed).toEqual(parsed)
  })

  it('clamps floor positions into the apartment', () => {
    const plan = { ...createDefaultPlan(), furniture: [{ ...floorItem, position: { x: -50, y: 2 } }] }
    const parsed = parsePlan(serializePlan(plan as Plan))
    const item = parsed?.furniture[0] as FloorItem | undefined
    expect(item?.position.x).toBeGreaterThanOrEqual(0)
  })

  it('parses a wall item with a small negative offset/elevation and clamps them on import', () => {
    const base = createDefaultPlan()
    base.rooms.push({
      id: 'r1',
      name: 'Room',
      polygon: rectToPolygon({ x: 0, y: 0, width: 3, height: 3 }),
      color: '#8ecae6',
    })
    const wallItem = {
      id: 'w1', catalogId: 'wall-art', mount: 'wall', roomId: 'r1', edgeIndex: 0,
      offset: -1, elevation: -0.5, size: { width: 0.8, depth: 0.05, height: 0.6 },
    }
    const plan = { ...base, furniture: [wallItem] }
    const parsed = parsePlan(serializePlan(plan as unknown as Plan))
    expect(parsed).not.toBeNull()
    const item = parsed?.furniture[0] as WallItem | undefined
    expect(item?.offset).toBeGreaterThanOrEqual(wallItem.size.width / 2)
    expect(item?.elevation).toBe(0)
  })
})
