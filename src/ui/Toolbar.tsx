import { usePlanStore } from '../store/planStore'

export function Toolbar() {
  const mode = usePlanStore((s) => s.mode)
  const setMode = usePlanStore((s) => s.setMode)
  const addRoom = usePlanStore((s) => s.addRoom)

  return (
    <div className="toolbar">
      <strong>Home Plan</strong>
      <div className="mode-toggle">
        <button className={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>
          2D
        </button>
        <button className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>
          3D
        </button>
      </div>
      <button onClick={() => addRoom()}>+ Add room</button>
    </div>
  )
}
