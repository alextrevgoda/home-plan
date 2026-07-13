import { useRef } from 'react'
import { parsePlan, serializePlan } from '../model/serialization'
import { usePlanStore } from '../store/planStore'
import { useToast } from './toast'

function exportPlan() {
  const plan = usePlanStore.getState().plan
  const blob = new Blob([serializePlan(plan)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${plan.name.trim().replace(/\s+/g, '-').toLowerCase() || 'plan'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function Toolbar() {
  const mode = usePlanStore((s) => s.mode)
  const setMode = usePlanStore((s) => s.setMode)
  const addRoom = usePlanStore((s) => s.addRoom)
  const placing = usePlanStore((s) => s.placing)
  const setPlacing = usePlanStore((s) => s.setPlacing)
  const hasRooms = usePlanStore((s) => s.plan.rooms.length > 0)
  const fileRef = useRef<HTMLInputElement>(null)

  const onImportFile = async (file: File) => {
    const plan = parsePlan(await file.text())
    if (plan) usePlanStore.getState().loadPlan(plan)
    else useToast.getState().show('Invalid plan file — import cancelled.')
  }

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
      <button
        className={placing === 'door' ? 'active' : ''}
        disabled={!hasRooms}
        onClick={() => setPlacing(placing === 'door' ? null : 'door')}
      >
        + Door
      </button>
      <button
        className={placing === 'window' ? 'active' : ''}
        disabled={!hasRooms}
        onClick={() => setPlacing(placing === 'window' ? null : 'window')}
      >
        + Window
      </button>
      <button onClick={exportPlan}>Export</button>
      <button onClick={() => fileRef.current?.click()}>Import</button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onImportFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
