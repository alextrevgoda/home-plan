import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadFromStorage, startAutosave } from './store/persistence'
import { usePlanStore } from './store/planStore'
import App from './ui/App'
import './ui/app.css'
import { useToast } from './ui/toast'

const { plan, recovered } = loadFromStorage(localStorage)
usePlanStore.getState().loadPlan(plan)
if (recovered) {
  useToast
    .getState()
    .show('Saved plan was corrupted — started fresh. Old data kept under "home-plan.backup".')
}
startAutosave(localStorage, 500, () =>
  useToast.getState().show('Autosave failed — your browser storage may be full or blocked.'),
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
