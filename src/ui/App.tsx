import { useEffect, useRef } from 'react'
import { Editor2D } from '../editor2d/Editor2D'
import { usePlanStore } from '../store/planStore'
import { Viewer3D } from '../viewer3d/Viewer3D'
import { CatalogPanel } from './CatalogPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { Toolbar } from './Toolbar'
import { useToast } from './toast'
import { useIsMobileLayout } from './useIsMobileLayout'

function Toast() {
  const message = useToast((s) => s.message)
  if (!message) return null
  return <div className="toast">{message}</div>
}

export default function App() {
  const mode = usePlanStore((s) => s.mode)
  const catalogOpen = usePlanStore((s) => s.catalogOpen)
  const selection = usePlanStore((s) => s.selection)
  const apartmentPropsOpen = usePlanStore((s) => s.apartmentPropsOpen)
  const setCatalogOpen = usePlanStore((s) => s.setCatalogOpen)
  const isMobile = useIsMobileLayout()

  // Mobile shows one bottom sheet at a time: a FRESH selection dismisses the catalog,
  // but opening the catalog over an existing selection must win — so react only to
  // selection changes (the store creates a new selection object on every select).
  const prevSelection = useRef(selection)
  useEffect(() => {
    const changed = selection !== prevSelection.current
    prevSelection.current = selection
    if (isMobile && selection && changed && catalogOpen) setCatalogOpen(false)
  }, [isMobile, selection, catalogOpen, setCatalogOpen])

  const showCatalog = mode === '2d' && catalogOpen
  const showProperties = isMobile
    ? (selection !== null || apartmentPropsOpen) && !showCatalog
    : true

  return (
    <div className="app">
      <Toolbar />
      <div className="main">
        {showCatalog && <CatalogPanel />}
        <div className="canvas-area">
          {mode === '2d' ? <Editor2D /> : <Viewer3D />}
        </div>
        {showProperties && <PropertiesPanel />}
      </div>
      <Toast />
    </div>
  )
}
