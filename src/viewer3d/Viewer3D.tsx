import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { DoubleSide, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three'
import { floorFinish } from '../model/catalog'
import { polygonToRect } from '../model/geometry'
import type { Opening, Plan, Rect, Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { useToast } from '../ui/toast'
import { PlanFurniture } from './PlanFurniture'
import { fillForOpening, wallSegmentsForRoom } from './walls'

const failedTextureOnce = new Set<string>()
const textureLoader = new TextureLoader()
const textureCache = new Map<string, Promise<Texture>>()

function loadFloorTexture(path: string): Promise<Texture> {
  let p = textureCache.get(path)
  if (!p) {
    p = textureLoader.loadAsync(import.meta.env.BASE_URL + path)
    textureCache.set(path, p)
  }
  return p
}

export function Viewer3D() {
  const plan = usePlanStore((s) => s.plan)
  const { width, depth } = plan.apartment

  return (
    <Canvas
      shadows
      camera={{ position: [width * 0.7, Math.max(width, depth) * 0.9, depth * 1.4], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#e8ecef']} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#f2f6ff', '#8d8574', 1.05]} />
      <directionalLight position={[width, 12, depth]} intensity={1.25} castShadow />
      <directionalLight position={[-width * 0.4, 8, -depth * 0.4]} intensity={0.65} />

      <group position={[-width / 2, 0, -depth / 2]}>
        {/* ground plane, slightly below floors */}
        <mesh rotation-x={-Math.PI / 2} position={[width / 2, -0.01, depth / 2]} receiveShadow>
          <planeGeometry args={[width + 6, depth + 6]} />
          <meshStandardMaterial color="#cfd6dc" />
        </mesh>

        {plan.rooms.map((room) => (
          <RoomMesh key={room.id} room={room} plan={plan} />
        ))}
        {plan.openings.map((opening) => (
          <OpeningFillMesh key={opening.id} opening={opening} plan={plan} />
        ))}
        <PlanFurniture plan={plan} />
      </group>

      <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={80} />
    </Canvas>
  )
}

function RoomMesh({ room, plan }: { room: Room; plan: Plan }) {
  const rect = polygonToRect(room.polygon)
  const finish = room.floorMaterial ? floorFinish(room.floorMaterial) : undefined
  return (
    <group>
      {rect &&
        (finish ? (
          <TexturedFloor rect={rect} texturePath={finish.texturePath} fallbackColor={room.color} />
        ) : (
          <mesh
            rotation-x={-Math.PI / 2}
            position={[rect.x + rect.width / 2, 0.001, rect.y + rect.height / 2]}
            receiveShadow
          >
            <planeGeometry args={[rect.width, rect.height]} />
            <meshStandardMaterial color={room.color} />
          </mesh>
        ))}
      {wallSegmentsForRoom(room, plan).map((piece, i) => (
        <mesh key={i} position={piece.center} rotation-y={piece.rotationY} castShadow receiveShadow>
          <boxGeometry args={piece.size} />
          <meshStandardMaterial color={room.wallColor ?? '#f5f5f0'} />
        </mesh>
      ))}
    </group>
  )
}

function TexturedFloor({
  rect,
  texturePath,
  fallbackColor,
}: {
  rect: Rect
  texturePath: string
  fallbackColor: string
}) {
  const [base, setBase] = useState<Texture | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setBase(null)
    setFailed(false)
    loadFloorTexture(texturePath).then(
      (tex) => {
        if (alive) setBase(tex)
      },
      () => {
        if (!alive) return
        setFailed(true)
        if (!failedTextureOnce.has(texturePath)) {
          failedTextureOnce.add(texturePath)
          useToast.getState().show('Could not load the floor texture — showing the room color.')
        }
      },
    )
    return () => {
      alive = false
    }
  }, [texturePath])

  const texture = useMemo(() => {
    if (!base) return null
    const t = base.clone()
    t.wrapS = RepeatWrapping
    t.wrapT = RepeatWrapping
    t.repeat.set(rect.width, rect.height)
    t.colorSpace = SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [base, rect.width, rect.height])

  // Dispose only the per-room clone; the cached base texture is shared across rooms.
  useEffect(() => {
    return () => {
      texture?.dispose()
    }
  }, [texture])

  if (!texture) {
    if (!failed) return null
    return (
      <mesh
        rotation-x={-Math.PI / 2}
        position={[rect.x + rect.width / 2, 0.001, rect.y + rect.height / 2]}
        receiveShadow
      >
        <planeGeometry args={[rect.width, rect.height]} />
        <meshStandardMaterial color={fallbackColor} />
      </mesh>
    )
  }

  return (
    <mesh rotation-x={-Math.PI / 2} position={[rect.x + rect.width / 2, 0.001, rect.y + rect.height / 2]} receiveShadow>
      <planeGeometry args={[rect.width, rect.height]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  )
}

function OpeningFillMesh({ opening, plan }: { opening: Opening; plan: Plan }) {
  const fill = fillForOpening(opening, plan)
  if (!fill) return null
  return (
    <mesh position={fill.center} rotation-y={fill.rotationY} castShadow={fill.kind === 'door'}>
      <boxGeometry args={fill.size} />
      {fill.kind === 'door' ? (
        <meshStandardMaterial color="#9c6b3f" />
      ) : (
        <meshStandardMaterial color="#bfe0f2" transparent opacity={0.35} side={DoubleSide} />
      )}
    </mesh>
  )
}
