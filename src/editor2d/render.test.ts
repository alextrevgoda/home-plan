import { Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { symbolPaths } from './symbols'
import { drawFurnitureGhost, paintSymbol } from './render'

describe('paintSymbol', () => {
  it('replays every command kind onto a Graphics without throwing', () => {
    const g = new Graphics()
    paintSymbol(g, symbolPaths('sofa', 40, 20)!)
    paintSymbol(g, [{ kind: 'circle', cx: 0, cy: 0, r: 5 }])
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
