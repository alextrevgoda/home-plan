import { Editor2D } from '../editor2d/Editor2D'
import { usePlanStore } from '../store/planStore'
import { Viewer3D } from '../viewer3d/Viewer3D'
import { PropertiesPanel } from './PropertiesPanel'
import { Toolbar } from './Toolbar'

export default function App() {
  const mode = usePlanStore((s) => s.mode)

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <div className="canvas-area">
          {mode === '2d' ? <Editor2D /> : <Viewer3D />}
        </div>
        <PropertiesPanel />
      </div>
    </div>
  )
}
