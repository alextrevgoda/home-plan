import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { DoubleSide } from 'three'
import { polygonToRect } from '../model/geometry'
import type { Opening, Plan, Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { PlanFurniture } from './PlanFurniture'
import { fillForOpening, wallSegmentsForRoom } from './walls'

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
      <ambientLight intensity={0.7} />
      <directionalLight position={[width, 12, depth]} intensity={1.4} castShadow />

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
  return (
    <group>
      {rect && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[rect.x + rect.width / 2, 0.001, rect.y + rect.height / 2]}
          receiveShadow
        >
          <planeGeometry args={[rect.width, rect.height]} />
          <meshStandardMaterial color={room.color} />
        </mesh>
      )}
      {wallSegmentsForRoom(room, plan).map((piece, i) => (
        <mesh key={i} position={piece.center} rotation-y={piece.rotationY} castShadow receiveShadow>
          <boxGeometry args={piece.size} />
          <meshStandardMaterial color="#f5f5f0" />
        </mesh>
      ))}
    </group>
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
