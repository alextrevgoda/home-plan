import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { DoubleSide, RepeatWrapping, Shape, SRGBColorSpace, Texture, TextureLoader } from 'three'
import { floorFinish } from '../model/catalog'
import type { Opening, Plan, Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { useToast } from '../ui/toast'
import { floorShape } from './floorShape'
import { PlanFurniture } from './PlanFurniture'
import { fillForOpening, wallSegmentsForRoom } from './walls'

const NEUTRAL_WALL_COLOR = '#f5f5f0'

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
  const shape = useMemo(() => floorShape(room.polygon), [room.polygon])
  const finish = room.floorMaterial ? floorFinish(room.floorMaterial) : undefined
  return (
    <group>
      {finish ? (
        <TexturedFloor shape={shape} texturePath={finish.texturePath} fallbackColor={room.color} />
      ) : (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color={room.color} />
        </mesh>
      )}
      {wallSegmentsForRoom(room, plan).map((piece, i) =>
        room.wallColor ? (
          <mesh key={i} position={piece.center} rotation-y={piece.rotationY} castShadow receiveShadow>
            <boxGeometry args={piece.size} />
            {/* Box face order is +x,-x,+y,-y,+z,-z (material-0..5). Given wallSegmentsForRoom's
                rotationY (derived from the room polygon's winding), the box's local +z face
                (material-4) is the one facing into the room for every edge — verified by
                screenshot (loud wallColor, orbit outside the room: exterior stays neutral). */}
            <meshStandardMaterial attach="material-0" color={NEUTRAL_WALL_COLOR} />
            <meshStandardMaterial attach="material-1" color={NEUTRAL_WALL_COLOR} />
            <meshStandardMaterial attach="material-2" color={NEUTRAL_WALL_COLOR} />
            <meshStandardMaterial attach="material-3" color={NEUTRAL_WALL_COLOR} />
            <meshStandardMaterial attach="material-4" color={room.wallColor} />
            <meshStandardMaterial attach="material-5" color={NEUTRAL_WALL_COLOR} />
          </mesh>
        ) : (
          <mesh key={i} position={piece.center} rotation-y={piece.rotationY} castShadow receiveShadow>
            <boxGeometry args={piece.size} />
            <meshStandardMaterial color={NEUTRAL_WALL_COLOR} />
          </mesh>
        ),
      )}
    </group>
  )
}

function TexturedFloor({
  shape,
  texturePath,
  fallbackColor,
}: {
  shape: Shape
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
    t.repeat.set(1, 1)
    t.colorSpace = SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [base])

  // Dispose only the per-room clone; the cached base texture is shared across rooms.
  useEffect(() => {
    return () => {
      texture?.dispose()
    }
  }, [texture])

  if (!texture) {
    if (!failed) return null
    return (
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color={fallbackColor} />
      </mesh>
    )
  }

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
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
