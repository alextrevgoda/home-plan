import { describe, expect, it } from 'vitest'
import { CATALOG, catalogItem, FLOOR_MATERIALS, floorFinish } from './catalog'

describe('catalog integrity', () => {
  it('has unique ids', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length)
  })

  it('every defaultSize lies within its bounds', () => {
    for (const c of CATALOG) {
      for (const axis of ['width', 'depth', 'height'] as const) {
        expect(c.defaultSize[axis], `${c.id}.${axis}`).toBeGreaterThanOrEqual(c.sizeBounds.min[axis])
        expect(c.defaultSize[axis], `${c.id}.${axis}`).toBeLessThanOrEqual(c.sizeBounds.max[axis])
      }
    }
  })

  it('wall items have a defaultElevation; floor items do not need one', () => {
    for (const c of CATALOG.filter((c) => c.mount === 'wall')) {
      expect(c.defaultElevation, c.id).toBeGreaterThan(0)
    }
  })

  it('model paths and symbols are set, floor finishes resolvable', () => {
    for (const c of CATALOG) {
      expect(c.modelPath).toMatch(/^models\/[a-z0-9-]+\.glb$/)
      expect(c.symbolId.length).toBeGreaterThan(0)
    }
    expect(catalogItem('sofa-3seat')?.name).toBe('Sofa (3-seat)')
    expect(catalogItem('nope')).toBeUndefined()
    expect(FLOOR_MATERIALS.length).toBe(6)
    expect(floorFinish('oak')?.texturePath).toBe('textures/floors/oak.jpg')
    expect(floorFinish('nope')).toBeUndefined()
  })
})
