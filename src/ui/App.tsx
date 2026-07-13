import { usePlanStore } from '../store/planStore'
import { PropertiesPanel } from './PropertiesPanel'
import { Toolbar } from './Toolbar'

export default function App() {
  const mode = usePlanStore((s) => s.mode)

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        <div className="canvas-area">
          {mode === '2d' ? <div data-testid="canvas-2d" /> : <div data-testid="canvas-3d" />}
        </div>
        <PropertiesPanel />
      </div>
    </div>
  )
}
