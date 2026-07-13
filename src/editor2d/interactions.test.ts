import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import type { Room } from '../model/types'
import { applyResize, handlePositions, hitHandle, hitRoom } from './interactions'

const roomAt = (x: number, y: number, w: number, h: number, id: string): Room => ({
  id,
  name: id,
  polygon: rectToPolygon({ x, y, width: w, height: h }),
  color: '#8ecae6',
})

describe('handlePositions', () => {
  it('places corner and midpoint handles', () => {
    const pos = handlePositions({ x: 1, y: 1, width: 2, height: 1 })
    expect(pos.nw).toEqual({ x: 1, y: 1 })
    expect(pos.se).toEqual({ x: 3, y: 2 })
    expect(pos.n).toEqual({ x: 2, y: 1 })
    expect(pos.w).toEqual({ x: 1, y: 1.5 })
  })
})

describe('hitRoom', () => {
  it('returns the topmost (last) room under the point', () => {
    const rooms = [roomAt(0, 0, 4, 4, 'a'), roomAt(2, 2, 4, 4, 'b')]
    expect(hitRoom(rooms, { x: 3, y: 3 })).toBe('b')
  })

  it('returns null on empty space', () => {
    expect(hitRoom([roomAt(0, 0, 1, 1, 'a')], { x: 5, y: 5 })).toBeNull()
  })
})

describe('hitHandle', () => {
  const viewport = { offsetX: 0, offsetY: 0, scale: 100 }
  const rect = { x: 1, y: 1, width: 2, height: 1 }

  it('hits the south-east handle within radius', () => {
    expect(hitHandle(rect, viewport, { x: 305, y: 195 })).toBe('se')
  })

  it('misses when outside radius', () => {
    expect(hitHandle(rect, viewport, { x: 320, y: 220 })).toBeNull()
  })
})

describe('applyResize', () => {
  const rect = { x: 1, y: 1, width: 3, height: 2 }

  it('moves the east edge and keeps x anchored', () => {
    expect(applyResize(rect, 'e', { x: 5.5, y: 0 })).toEqual({ x: 1, y: 1, width: 4.5, height: 2 })
  })

  it('moves the west edge and keeps the right edge anchored', () => {
    expect(applyResize(rect, 'w', { x: 0.5, y: 0 })).toEqual({ x: 0.5, y: 1, width: 3.5, height: 2 })
  })

  it('clamps to minimum size against the anchored edge', () => {
    expect(applyResize(rect, 'w', { x: 9, y: 0 })).toEqual({ x: 3.5, y: 1, width: 0.5, height: 2 })
  })

  it('resizes two edges from a corner handle', () => {
    expect(applyResize(rect, 'se', { x: 5, y: 4 })).toEqual({ x: 1, y: 1, width: 4, height: 3 })
  })
})
