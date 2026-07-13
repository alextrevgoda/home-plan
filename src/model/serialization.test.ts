import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import { createDefaultPlan, parsePlan, serializePlan } from './serialization'

describe('createDefaultPlan', () => {
  it('creates a valid empty plan with spec defaults', () => {
    const plan = createDefaultPlan()
    expect(plan.version).toBe(1)
    expect(plan.apartment).toEqual({ width: 10, depth: 8, wallHeight: 2.7 })
    expect(plan.rooms).toEqual([])
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
    const plan = { ...createDefaultPlan(), version: 2 }
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
})
