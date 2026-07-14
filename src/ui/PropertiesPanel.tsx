import { polygonToRect } from '../model/geometry'
import { catalogItem, FLOOR_MATERIALS } from '../model/catalog'
import type { Apartment, Opening, PlacedItem, Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { NumberField } from './NumberField'

export function PropertiesPanel() {
  const plan = usePlanStore((s) => s.plan)
  const selection = usePlanStore((s) => s.selection)
  const selectRoom = usePlanStore((s) => s.selectRoom)
  const setApartmentPropsOpen = usePlanStore((s) => s.setApartmentPropsOpen)
  const furniture =
    selection?.kind === 'furniture' ? plan.furniture.find((f) => f.id === selection.id) : undefined
  const room =
    selection?.kind === 'room' ? plan.rooms.find((r) => r.id === selection.id) : undefined
  const opening =
    selection?.kind === 'opening' ? plan.openings.find((o) => o.id === selection.id) : undefined

  return (
    <aside className="panel">
      <button
        className="sheet-close mobile-only"
        aria-label="Close panel"
        onClick={() => {
          selectRoom(null)
          setApartmentPropsOpen(false)
        }}
      >
        ✕
      </button>
      {furniture ? (
        <FurnitureProps item={furniture} />
      ) : opening ? (
        <OpeningProps opening={opening} />
      ) : room ? (
        <RoomProps room={room} />
      ) : (
        <ApartmentProps apartment={plan.apartment} />
      )}
    </aside>
  )
}

function FurnitureProps({ item }: { item: PlacedItem }) {
  const cat = catalogItem(item.catalogId)
  const resizeFurniture = usePlanStore((s) => s.resizeFurniture)
  const rotateFurniture = usePlanStore((s) => s.rotateFurniture)
  const moveFloorItem = usePlanStore((s) => s.moveFloorItem)
  const updateWallItem = usePlanStore((s) => s.updateWallItem)
  const recolorFurniture = usePlanStore((s) => s.recolorFurniture)
  const deleteFurniture = usePlanStore((s) => s.deleteFurniture)
  if (!cat) return null

  return (
    <>
      <h3>{cat.name}</h3>
      <NumberField label="Width (m)" value={item.size.width} onCommit={(v) => resizeFurniture(item.id, { width: v })} />
      <NumberField label="Depth (m)" value={item.size.depth} onCommit={(v) => resizeFurniture(item.id, { depth: v })} />
      <NumberField label="Height (m)" value={item.size.height} onCommit={(v) => resizeFurniture(item.id, { height: v })} />
      {item.mount === 'floor' ? (
        <>
          <NumberField label="X (m)" value={item.position.x} onCommit={(v) => moveFloorItem(item.id, { x: v, y: item.position.y })} />
          <NumberField label="Y (m)" value={item.position.y} onCommit={(v) => moveFloorItem(item.id, { x: item.position.x, y: v })} />
          <NumberField label="Rotation (°)" value={item.rotation} onCommit={(v) => rotateFurniture(item.id, v)} />
        </>
      ) : (
        <>
          <NumberField label="Offset (m)" value={item.offset} onCommit={(v) => updateWallItem(item.id, { offset: v })} />
          <NumberField label="Elevation (m)" value={item.elevation} onCommit={(v) => updateWallItem(item.id, { elevation: v })} />
        </>
      )}
      {cat.recolorMaterial && (
        <label className="field">
          Color
          <span className="color-row">
            <input type="color" value={item.color ?? '#8a8f98'} onChange={(e) => recolorFurniture(item.id, e.target.value)} />
            <button onClick={() => recolorFurniture(item.id, undefined)}>Reset</button>
          </span>
        </label>
      )}
      <button onClick={() => deleteFurniture(item.id)}>Delete {cat.name.toLowerCase()}</button>
    </>
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
  const setRoomFloorMaterial = usePlanStore((s) => s.setRoomFloorMaterial)
  const setRoomWallColor = usePlanStore((s) => s.setRoomWallColor)
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
      <div className="field">
        Floor
        <div className="swatches">
          <button className={!room.floorMaterial ? 'active' : ''} onClick={() => setRoomFloorMaterial(room.id, undefined)}>
            None
          </button>
          {FLOOR_MATERIALS.map((m) => (
            <button
              key={m.id}
              aria-label={m.name}
              title={m.name}
              className={room.floorMaterial === m.id ? 'active swatch' : 'swatch'}
              style={{ background: m.tint }}
              onClick={() => setRoomFloorMaterial(room.id, m.id)}
            />
          ))}
        </div>
      </div>
      <label className="field">
        Wall color
        <span className="color-row">
          <input type="color" value={room.wallColor ?? '#f5f5f0'} onChange={(e) => setRoomWallColor(room.id, e.target.value)} />
          <button onClick={() => setRoomWallColor(room.id, undefined)}>Reset</button>
        </span>
      </label>
      <button onClick={() => deleteRoom(room.id)}>Delete room</button>
    </>
  )
}

function OpeningProps({ opening }: { opening: Opening }) {
  const updateOpening = usePlanStore((s) => s.updateOpening)
  const deleteOpening = usePlanStore((s) => s.deleteOpening)

  return (
    <>
      <h3>{opening.kind === 'door' ? 'Door' : 'Window'}</h3>
      <NumberField
        label="Width (m)"
        value={opening.width}
        onCommit={(v) => updateOpening(opening.id, { width: v })}
      />
      <NumberField
        label="Height (m)"
        value={opening.height}
        onCommit={(v) => updateOpening(opening.id, { height: v })}
      />
      {opening.kind === 'window' && (
        <NumberField
          label="Sill height (m)"
          value={opening.sillHeight}
          onCommit={(v) => updateOpening(opening.id, { sillHeight: v })}
        />
      )}
      <NumberField
        label="Offset (m)"
        value={opening.offset}
        onCommit={(v) => updateOpening(opening.id, { offset: v })}
      />
      <button onClick={() => deleteOpening(opening.id)}>
        Delete {opening.kind === 'door' ? 'door' : 'window'}
      </button>
    </>
  )
}
