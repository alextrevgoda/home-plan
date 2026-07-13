import { polygonToRect } from '../model/geometry'
import type { Apartment, Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { NumberField } from './NumberField'

export function PropertiesPanel() {
  const plan = usePlanStore((s) => s.plan)
  const selection = usePlanStore((s) => s.selection)
  const room =
    selection?.kind === 'room' ? plan.rooms.find((r) => r.id === selection.id) : undefined

  return (
    <aside className="panel">
      {room ? <RoomProps room={room} /> : <ApartmentProps apartment={plan.apartment} />}
    </aside>
  )
}

function ApartmentProps({ apartment }: { apartment: Apartment }) {
  const setApartment = usePlanStore((s) => s.setApartment)
  return (
    <>
      <h3>Apartment</h3>
      <NumberField label="Width (m)" value={apartment.width} onCommit={(v) => setApartment({ width: v })} />
      <NumberField label="Depth (m)" value={apartment.depth} onCommit={(v) => setApartment({ depth: v })} />
      <NumberField
        label="Wall height (m)"
        value={apartment.wallHeight}
        onCommit={(v) => setApartment({ wallHeight: v })}
      />
    </>
  )
}

function RoomProps({ room }: { room: Room }) {
  const updateRoomRect = usePlanStore((s) => s.updateRoomRect)
  const renameRoom = usePlanStore((s) => s.renameRoom)
  const setRoomColor = usePlanStore((s) => s.setRoomColor)
  const deleteRoom = usePlanStore((s) => s.deleteRoom)

  const rect = polygonToRect(room.polygon)
  if (!rect) return null

  return (
    <>
      <h3>Room</h3>
      <label className="field">
        Name
        <input value={room.name} onChange={(e) => renameRoom(room.id, e.target.value)} />
      </label>
      <NumberField label="X (m)" value={rect.x} onCommit={(v) => updateRoomRect(room.id, { ...rect, x: v })} />
      <NumberField label="Y (m)" value={rect.y} onCommit={(v) => updateRoomRect(room.id, { ...rect, y: v })} />
      <NumberField
        label="Width (m)"
        value={rect.width}
        onCommit={(v) => updateRoomRect(room.id, { ...rect, width: v })}
      />
      <NumberField
        label="Height (m)"
        value={rect.height}
        onCommit={(v) => updateRoomRect(room.id, { ...rect, height: v })}
      />
      <label className="field">
        Color
        <input type="color" value={room.color} onChange={(e) => setRoomColor(room.id, e.target.value)} />
      </label>
      <button onClick={() => deleteRoom(room.id)}>Delete room</button>
    </>
  )
}
