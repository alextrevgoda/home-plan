import { Editor2D } from '../editor2d/Editor2D'
import { usePlanStore } from '../store/planStore'
import { Viewer3D } from '../viewer3d/Viewer3D'
import { CatalogPanel } from './CatalogPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { Toolbar } from './Toolbar'
import { useToast } from './toast'

function Toast() {
  const message = useToast((s) => s.message)
  if (!message) return null
  return <div className="toast">{message}</div>
}

export default function App() {
  const mode = usePlanStore((s) => s.mode)
  const catalogOpen = usePlanStore((s) => s.catalogOpen)

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        {mode === '2d' && catalogOpen && <CatalogPanel />}
        <div className="canvas-area">
          {mode === '2d' ? <Editor2D /> : <Viewer3D />}
        </div>
        <PropertiesPanel />
      </div>
      <Toast />
    </div>
  )
}
