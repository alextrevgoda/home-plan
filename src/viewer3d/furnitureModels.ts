import { Box3, Color, Group, Mesh, MeshStandardMaterial, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { CatalogItem } from '../model/catalog'
import type { Size3 } from '../model/types'

let sharedLoader: GLTFLoader | null = null

function getLoader(gl: WebGLRenderer): GLTFLoader {
  if (!sharedLoader) {
    const ktx2 = new KTX2Loader()
      .setTranscoderPath(import.meta.env.BASE_URL + 'basis/')
      .detectSupport(gl)
    sharedLoader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder)
  }
  return sharedLoader
}

const cache = new Map<string, Promise<Group>>()

export function loadFurnitureModel(gl: WebGLRenderer, cat: CatalogItem): Promise<Group> {
  let p = cache.get(cat.id)
  if (!p) {
    p = getLoader(gl)
      .loadAsync(import.meta.env.BASE_URL + cat.modelPath)
      .then((gltf) => normalize(gltf.scene, cat.modelRotationY ?? 0))
    cache.set(cat.id, p)
  }
  return p
}

function normalize(scene: Group, rotationY: number): Group {
  scene.rotation.y = rotationY
  scene.updateMatrixWorld(true)
  const box = new Box3().setFromObject(scene)
  const wrapper = new Group()
  const inner = new Group()
  inner.add(scene)
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
  wrapper.add(inner)
  const sourceSize: Size3 = {
    width: Math.max(box.max.x - box.min.x, 1e-6),
    height: Math.max(box.max.y - box.min.y, 1e-6),
    depth: Math.max(box.max.z - box.min.z, 1e-6),
  }
  wrapper.userData.sourceSize = sourceSize
  wrapper.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  return wrapper
}

export function instantiateModel(template: Group): Group {
  const clone = template.clone(true)
  clone.userData = { ...template.userData }
  clone.traverse((obj) => {
    if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
      const mat = obj.material.clone()
      mat.userData.baseColor = obj.material.color.getHex()
      obj.material = mat
    }
  })
  return clone
}

export function disposeInstanceMaterials(instance: Group): void {
  instance.traverse((obj) => {
    if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
      obj.material.dispose()
    }
  })
}

export function applyTint(instance: Group, materialName: string | undefined, color: string | undefined): void {
  if (!materialName) return
  instance.traverse((obj) => {
    if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial && obj.material.name === materialName) {
      obj.material.color = new Color(color ?? `#${(obj.material.userData.baseColor as number).toString(16).padStart(6, '0')}`)
    }
  })
}
