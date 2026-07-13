import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import { createDefaultPlan, parsePlan, planSchema, serializePlan } from './serialization'

describe('createDefaultPlan', () => {
  it('creates a valid empty v2 plan with spec defaults', () => {
    const plan = createDefaultPlan()
    expect(plan.version).toBe(2)
    expect(plan.apartment).toEqual({ width: 10, depth: 8, wallHeight: 2.7 })
    expect(plan.rooms).toEqual([])
    expect(plan.openings).toEqual([])
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
    const plan = { ...createDefaultPlan(), version: 3 }
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
    expect(parsed!.version).toBe(2)
    expect(parsed!.openings).toEqual([])
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
