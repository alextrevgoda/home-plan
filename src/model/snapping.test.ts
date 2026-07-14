import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import type { Room } from './types'
import { collectSnapLines, snapMove, snapScalar } from './snapping'

const opts = { gridStep: 0.1, gridThreshold: 0.05, edgeThreshold: 0.08 }
const apartment = { width: 10, depth: 8, wallHeight: 2.7 }

const roomFromRect = (x: number, y: number, width: number, height: number, id = 'r'): Room => ({
  id,
  name: id,
  color: '#8ecae6',
  polygon: rectToPolygon({ x, y, width, height }),
})

describe('collectSnapLines', () => {
  it('includes apartment boundary and all rect edges', () => {
    const lines = collectSnapLines([roomFromRect(1, 2, 3, 2)], apartment)
    expect(lines.xs.sort((a, b) => a - b)).toEqual([0, 1, 4, 10])
    expect(lines.ys.sort((a, b) => a - b)).toEqual([0, 2, 4, 8])
  })

  it('collects lines from every rectilinear edge plus apartment bounds', () => {
    const lRoom: Room = {
      id: 'r1',
      name: 'A',
      color: '#8ecae6',
      polygon: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    }
    const lines = collectSnapLines([lRoom], apartment)
    expect(lines.xs.sort((a, b) => a - b)).toEqual([0, 0, 2, 4, 10])
    expect(lines.ys.sort((a, b) => a - b)).toEqual([0, 0, 1, 3, 8])
  })
})

describe('snapScalar', () => {
  it('snaps to the nearest candidate within edge threshold', () => {
    expect(snapScalar(2.03, [2, 5], opts)).toEqual({ value: 2, guide: 2 })
  })

  it('prefers an edge snap over a closer grid line', () => {
    // grid line 2.0 is 0.03 away; edge candidate 2.08 is 0.05 away — edge still wins
    expect(snapScalar(2.03, [2.08], opts)).toEqual({ value: 2.08, guide: 2.08 })
  })

  it('falls back to the grid when no candidate is close', () => {
    expect(snapScalar(2.52, [5], opts)).toEqual({ value: 2.5, guide: null })
  })

  it('leaves the value un-snapped (cm-rounded) outside both thresholds', () => {
    const tight = { gridStep: 0.1, gridThreshold: 0.02, edgeThreshold: 0.05 }
    expect(snapScalar(2.555, [5], tight)).toEqual({ value: 2.56, guide: null })
  })
})

describe('snapMove', () => {
  it('snaps the leading edge to a neighbouring room edge and reports a guide', () => {
    const lines = collectSnapLines([roomFromRect(0, 0, 2, 2)], apartment)
    const res = snapMove({ x: 2.05, y: 5.32, width: 3, height: 2 }, lines, opts)
    expect(res.x).toBe(2)
    expect(res.guides).toContainEqual({ axis: 'x', position: 2 })
  })

  it('snaps the trailing edge when it is the one near a line', () => {
    const lines = collectSnapLines([], apartment)
    const res = snapMove({ x: 6.97, y: 3.33, width: 3, height: 2 }, lines, opts)
    expect(res.x).toBe(7)
    expect(res.guides).toContainEqual({ axis: 'x', position: 10 })
  })

  it('grid-snaps without guides when no edge is near', () => {
    const res = snapMove({ x: 5.02, y: 3.48, width: 1, height: 1 }, { xs: [], ys: [] }, opts)
    expect(res).toEqual({ x: 5, y: 3.5, guides: [] })
  })

  it('picks the edge with the smaller correction when both edges match candidates', () => {
    // leading edge 2.05 is 0.05 from candidate 2; trailing edge 5.05 is 0.03 from candidate 5.02
    const res = snapMove({ x: 2.05, y: 3.33, width: 3, height: 2 }, { xs: [2, 5.02], ys: [] }, opts)
    expect(res.x).toBe(2.02)
    expect(res.guides).toContainEqual({ axis: 'x', position: 5.02 })
  })
})
