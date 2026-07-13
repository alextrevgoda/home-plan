import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { polygonToRect } from '../model/geometry'
import type { Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { WALL_THICKNESS, wallsForPolygon } from './walls'

export function Viewer3D() {
  const plan = usePlanStore((s) => s.plan)
  const { width, depth, wallHeight } = plan.apartment

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
          <RoomMesh key={room.id} room={room} wallHeight={wallHeight} />
        ))}
      </group>

      <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={80} />
    </Canvas>
  )
}

function RoomMesh({ room, wallHeight }: { room: Room; wallHeight: number }) {
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
      {wallsForPolygon(room.polygon, wallHeight).map((wall, i) => (
        <mesh key={i} position={wall.center} rotation-y={wall.rotationY} castShadow receiveShadow>
          <boxGeometry args={[wall.length, wallHeight, WALL_THICKNESS]} />
          <meshStandardMaterial color="#f5f5f0" />
        </mesh>
      ))}
    </group>
  )
}
