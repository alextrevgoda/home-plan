import { Mesh, MeshStandardMaterial, PlaneGeometry, WebGLRenderer } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogItem } from '../model/catalog'

// loadFurnitureModel wraps GLTFLoader.loadAsync — a real WebGLRenderer/GLTFLoader needs a
// WebGL context jsdom can't provide, so we mock the loader classes to exercise the cache/retry
// logic (the part of furnitureModels.ts that is meaningfully unit-testable in this environment).
// Lighting and per-face wall materials in Viewer3D.tsx render via @react-three/fiber and are
// verified visually (see PR notes) rather than by unit test, for the same jsdom/WebGL reason.
const loadAsync = vi.fn()

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setKTX2Loader() {
      return this
    }
    setMeshoptDecoder() {
      return this
    }
    loadAsync(...args: unknown[]) {
      return loadAsync(...args)
    }
  },
}))

vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({
  KTX2Loader: class {
    setTranscoderPath() {
      return this
    }
    detectSupport() {
      return this
    }
  },
}))

vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({
  MeshoptDecoder: {},
}))

const cat = (id: string): CatalogItem => ({
  id,
  name: id,
  category: 'living',
  mount: 'floor',
  layer: 'solid',
  defaultSize: { width: 1, height: 1, depth: 1 },
  sizeBounds: { min: { width: 1, height: 1, depth: 1 }, max: { width: 1, height: 1, depth: 1 } },
  modelPath: `models/${id}.glb`,
  symbolId: id,
})

function fakeGltfScene() {
  const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial())
  return { scene: mesh }
}

describe('loadFurnitureModel caching and retry', () => {
  beforeEach(() => {
    loadAsync.mockReset()
    vi.resetModules()
  })

  it('caches a resolved load: a second call does not hit the loader again', async () => {
    const { loadFurnitureModel } = await import('./furnitureModels')
    loadAsync.mockResolvedValue(fakeGltfScene())
    const gl = {} as WebGLRenderer
    const item = cat('resolved-item')

    await loadFurnitureModel(gl, item)
    await loadFurnitureModel(gl, item)

    expect(loadAsync).toHaveBeenCalledTimes(1)
  })

  it('does not cache a rejection forever: the next call retries the loader', async () => {
    const { loadFurnitureModel } = await import('./furnitureModels')
    const gl = {} as WebGLRenderer
    const item = cat('flaky-item')

    loadAsync.mockRejectedValueOnce(new Error('network blip'))
    await expect(loadFurnitureModel(gl, item)).rejects.toThrow('network blip')

    loadAsync.mockResolvedValueOnce(fakeGltfScene())
    await expect(loadFurnitureModel(gl, item)).resolves.toBeTruthy()

    expect(loadAsync).toHaveBeenCalledTimes(2)
  })

  it('keeps retrying on repeated failures instead of caching the rejection', async () => {
    const { loadFurnitureModel } = await import('./furnitureModels')
    const gl = {} as WebGLRenderer
    const item = cat('always-flaky-item')

    loadAsync.mockRejectedValueOnce(new Error('first failure'))
    await expect(loadFurnitureModel(gl, item)).rejects.toThrow('first failure')

    loadAsync.mockRejectedValueOnce(new Error('second failure'))
    await expect(loadFurnitureModel(gl, item)).rejects.toThrow('second failure')

    expect(loadAsync).toHaveBeenCalledTimes(2)
  })
})
