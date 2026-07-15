import { Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { Opening, Plan } from '../model/types'
import { symbolPaths } from './symbols'
import { drawFurnitureGhost, drawOpenings, paintSymbol } from './render'

const planWithDoor = (patch: Partial<Opening>): Plan => ({
  ...createDefaultPlan(),
  rooms: [
    { id: 'A', name: 'A', color: '#8ecae6', polygon: rectToPolygon({ x: 0, y: 0, width: 4, height: 3 }) },
  ],
  openings: [
    {
      id: 'o1',
      kind: 'door',
      roomId: 'A',
      edgeIndex: 0,
      offset: 2,
      width: 1,
      height: 2.1,
      sillHeight: 0,
      hinge: 'start',
      swing: 'in',
      open: false,
      ...patch,
    },
  ],
})

describe('paintSymbol', () => {
  it('replays every command kind onto a Graphics without throwing', () => {
    const g = new Graphics()
    paintSymbol(g, symbolPaths('sofa', 40, 20)!)
    paintSymbol(g, [{ kind: 'circle', cx: 0, cy: 0, r: 5 }])
    expect(g).toBeTruthy()
  })
})

describe('drawOpenings door swing', () => {
  const viewport = { scale: 50, offsetX: 0, offsetY: 0 }
  it('renders closed, open, and selected doors without throwing', () => {
    const g = new Graphics()
    drawOpenings(g, planWithDoor({ open: false }), null, viewport)
    drawOpenings(g, planWithDoor({ open: true }), null, viewport)
    drawOpenings(g, planWithDoor({ open: true, hinge: 'end', swing: 'out' }), { kind: 'opening', id: 'o1' }, viewport)
    expect(g).toBeTruthy()
  })
})

describe('drawFurnitureGhost', () => {
  const viewport = { scale: 50, offsetX: 0, offsetY: 0 }
  it('handles null, valid and invalid ghosts', () => {
    const g = new Graphics()
    drawFurnitureGhost(g, null, viewport)
    drawFurnitureGhost(g, { catalogId: 'sofa-3seat', position: { x: 2, y: 2 }, rotation: 90, valid: true }, viewport)
    drawFurnitureGhost(g, { catalogId: 'sofa-3seat', position: { x: 2, y: 2 }, rotation: 0, valid: false }, viewport)
    expect(g).toBeTruthy()
  })
})
