import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type { Group } from 'three'
import { catalogItem } from '../model/catalog'
import type { Plan, PlacedItem } from '../model/types'
import { useToast } from '../ui/toast'
import { floorItemTransform, wallItemTransform, type ItemTransform } from './furniture'
import { applyTint, disposeInstanceMaterials, instantiateModel, loadFurnitureModel } from './furnitureModels'

const failedOnce = new Set<string>()

function FallbackBox({ t, item }: { t: ItemTransform; item: PlacedItem }) {
  return (
    <mesh
      position={[t.position[0], t.position[1] + item.size.height / 2, t.position[2]]}
      rotation-y={t.rotationY}
      castShadow
    >
      <boxGeometry args={[item.size.width, item.size.height, item.size.depth]} />
      <meshStandardMaterial color="#9aa0a6" />
    </mesh>
  )
}

function FurnitureItem({ item, plan }: { item: PlacedItem; plan: Plan }) {
  const gl = useThree((s) => s.gl)
  const [model, setModel] = useState<Group | null>(null)
  const [failed, setFailed] = useState(false)
  const cat = catalogItem(item.catalogId)

  useEffect(() => {
    if (!cat) return
    let alive = true
    loadFurnitureModel(gl, cat).then(
      (template) => {
        if (alive) setModel(instantiateModel(template))
      },
      () => {
        if (!alive) return
        setFailed(true)
        if (!failedOnce.has(cat.modelPath)) {
          failedOnce.add(cat.modelPath)
          useToast.getState().show(`Could not load the 3D model for ${cat.name} — showing a placeholder box.`)
        }
      },
    )
    return () => {
      alive = false
    }
  }, [gl, cat])

  useEffect(() => {
    if (model) applyTint(model, cat?.recolorMaterial, item.color)
  }, [model, cat, item.color])

  useEffect(() => {
    return () => {
      if (model) disposeInstanceMaterials(model)
    }
  }, [model])

  const t = item.mount === 'floor' ? floorItemTransform(item) : wallItemTransform(item, plan)
  if (!t || !cat) return null
  if (failed) return <FallbackBox t={t} item={item} />
  if (!model) return null

  const src = model.userData.sourceSize as { width: number; height: number; depth: number }
  return (
    <group position={t.position} rotation-y={t.rotationY}>
      <primitive
        object={model}
        scale={[item.size.width / src.width, item.size.height / src.height, item.size.depth / src.depth]}
      />
    </group>
  )
}

export function PlanFurniture({ plan }: { plan: Plan }) {
  return (
    <>
      {plan.furniture.map((item) => (
        <FurnitureItem key={item.id} item={item} plan={plan} />
      ))}
    </>
  )
}
