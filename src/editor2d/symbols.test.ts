import { describe, expect, it } from 'vitest'
import { CATALOG } from '../model/catalog'
import { SYMBOL_IDS, symbolPaths } from './symbols'

describe('symbolPaths', () => {
  it('covers every catalog symbolId', () => {
    for (const c of CATALOG) expect(SYMBOL_IDS, c.symbolId).toContain(c.symbolId)
  })

  it('returns null for unknown ids', () => {
    expect(symbolPaths('nope', 10, 10)).toBeNull()
  })

  it('every symbol emits commands that stay inside its box', () => {
    for (const id of SYMBOL_IDS) {
      const cmds = symbolPaths(id, 40, 30)!
      expect(cmds.length).toBeGreaterThan(0)
      for (const c of cmds) {
        const xs = c.kind === 'rect' ? [c.x, c.x + c.w] : c.kind === 'line' ? [c.x1, c.x2] : [c.cx - c.r, c.cx + c.r]
        const ys = c.kind === 'rect' ? [c.y, c.y + c.h] : c.kind === 'line' ? [c.y1, c.y2] : [c.cy - c.r, c.cy + c.r]
        for (const x of xs) expect(Math.abs(x), id).toBeLessThanOrEqual(20.01)
        for (const y of ys) expect(Math.abs(y), id).toBeLessThanOrEqual(15.01)
      }
    }
  })
})
