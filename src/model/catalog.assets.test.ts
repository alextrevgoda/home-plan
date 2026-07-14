import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG, FLOOR_MATERIALS } from './catalog'

const pub = join(process.cwd(), 'public')

describe('bundled assets', () => {
  it('every catalog model exists and is ≤ 2 MB', () => {
    for (const c of CATALOG) {
      const p = join(pub, c.modelPath)
      expect(existsSync(p), c.modelPath).toBe(true)
      expect(statSync(p).size, c.modelPath).toBeLessThanOrEqual(2 * 1024 * 1024)
    }
  })
  it('every floor texture exists and is ≤ 500 KB', () => {
    for (const m of FLOOR_MATERIALS) {
      const p = join(pub, m.texturePath)
      expect(existsSync(p), m.texturePath).toBe(true)
      expect(statSync(p).size, m.texturePath).toBeLessThanOrEqual(500 * 1024)
    }
  })
  it('basis transcoder is committed', () => {
    expect(existsSync(join(pub, 'basis/basis_transcoder.js'))).toBe(true)
    expect(existsSync(join(pub, 'basis/basis_transcoder.wasm'))).toBe(true)
  })
})
