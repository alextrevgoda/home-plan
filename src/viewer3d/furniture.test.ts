import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { FloorItem, Plan, WallItem } from '../model/types'
import { floorItemTransform, wallItemTransform } from './furniture'

describe('floorItemTransform', () => {
  it('maps plan xy to xz and negates rotation', () => {
    const item: FloorItem = { id: 'a', catalogId: 'sofa-3seat', mount: 'floor',
      position: { x: 3, y: 2 }, rotation: 90, size: { width: 2, depth: 1, height: 0.8 } }
    const t = floorItemTransform(item)
    expect(t.position).toEqual([3, 0, 2])
    expect(t.rotationY).toBeCloseTo(-Math.PI / 2)
  })
})

describe('wallItemTransform', () => {
  const room = { id: 'r1', name: 'A', color: '#8ecae6', polygon: rectToPolygon({ x: 0, y: 0, width: 4, height: 3 }) }
  const plan: Plan = { ...createDefaultPlan(), rooms: [room] }
  const art: WallItem = { id: 'w', catalogId: 'wall-art', mount: 'wall', roomId: 'r1',
    edgeIndex: 0, offset: 2, elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 } }

  it('hangs on the top wall facing into the room', () => {
    const t = wallItemTransform(art, plan)!
    expect(t.position[0]).toBeCloseTo(2)
    expect(t.position[1]).toBe(1.4)
    expect(t.position[2]).toBeCloseTo(0.05 + 0.025) // WALL_THICKNESS/2 + depth/2
    expect(t.rotationY).toBeCloseTo(0)
  })
  it('null for unknown room', () => {
    expect(wallItemTransform({ ...art, roomId: 'nope' }, plan)).toBeNull()
  })
})
