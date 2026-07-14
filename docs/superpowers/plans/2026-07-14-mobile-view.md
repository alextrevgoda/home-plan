# Mobile View Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executors must NOT merge to main or push.** Stop after the final commit of your task; the controlling session merges.

**Goal:** Full editing parity on phones: responsive shell (compact toolbar, bottom-sheet panels) plus touch navigation and editing in the 2D Pixi editor.

**Architecture:** One codebase, no separate mobile tree. CSS media query `(max-width: 768px)` reshapes the shell; a `useIsMobileLayout()` hook gates the few component-tree differences (bottom sheets, one-sheet-at-a-time). Touch behavior in the 2D editor is keyed per-event off `pointerType === 'touch'`, never off screen size; gesture math lives in a new pure module `src/editor2d/gestures.ts`.

**Tech Stack:** React 18, Zustand 5, Pixi.js 8, @react-three/fiber + drei, TypeScript, Vitest + @testing-library/react (jsdom), playwright-core E2E driving installed Chrome.

**Spec:** `docs/superpowers/specs/2026-07-14-mobile-view-design.md`

## Global Constraints

- Desktop at ≥769px stays pixel-identical to today (all existing tests must keep passing unmodified unless a task says otherwise).
- Layout breakpoint is exactly `(max-width: 768px)`; touch sizing is per-event `pointerType === 'touch'`, never screen width.
- Touch hit radii are exactly double the mouse defaults: handles 8→16, rotation 9→18, edge/opening 10→20 (and the wall-item drag radius 20→40).
- `src/model/` stays pure; `src/editor2d/gestures.ts` must not import Pixi/React/store.
- The Zustand store remains the single writer and never holds an invalid plan.
- Rotation always angle-snaps on touch (no Shift key on phones).
- Run tests with `npx vitest run <file>` (no `test.globals`); full suite `npm test`; typecheck+build `npm run build`.
- Commit after every task. Do not push.

## File Structure

- Create: `src/editor2d/gestures.ts` (+ test) — pure pinch/double-tap math.
- Create: `src/ui/useIsMobileLayout.ts` (+ test) — matchMedia hook.
- Modify: `src/editor2d/viewport.ts` (+ test) — `recenterViewport`.
- Modify: `src/editor2d/interactions.ts` (+ test) — `hitRadius`.
- Modify: `src/editor2d/Editor2D.tsx` — touch wiring (pan/pinch/double-tap/radii/cancel/recenter).
- Modify: `src/store/planStore.ts` (+ test) — catalog-close disarms placement; `apartmentPropsOpen`.
- Modify: `src/ui/App.tsx` (+ test) — sheet visibility rules on mobile.
- Modify: `src/ui/Toolbar.tsx` — mobile-only Apartment button.
- Modify: `src/ui/PropertiesPanel.tsx`, `src/ui/CatalogPanel.tsx` — sheet close buttons.
- Modify: `src/ui/NumberField.tsx` (+ test) — `inputMode="decimal"`.
- Modify: `src/ui/app.css` — media query, sheets, iOS fixes.
- Modify: `src/test-setup.ts` — jsdom matchMedia stub.
- Modify: `index.html` — `viewport-fit=cover`.

---

### Task 1: Viewport recentering on canvas resize

The 2D canvas already re-runs `app.resize()` when its host resizes, but the viewport offsets stay put, so after an orientation change the plan can end up off-center. Add a pure `recenterViewport` that keeps the world point at the old canvas center at the new canvas center, and wire it into the existing ResizeObserver.

**Files:**
- Modify: `src/editor2d/viewport.ts`
- Modify: `src/editor2d/Editor2D.tsx:100-105` (ResizeObserver block)
- Test: `src/editor2d/viewport.test.ts`

**Interfaces:**
- Consumes: existing `Viewport`, `screenToWorld`.
- Produces: `recenterViewport(v: Viewport, oldSize: { width: number; height: number }, newSize: { width: number; height: number }): Viewport` — later tasks do not depend on it, but Task 7's Editor2D edits assume this wiring is already present.

- [ ] **Step 1: Write the failing test**

Append to `src/editor2d/viewport.test.ts`:

```ts
describe('recenterViewport', () => {
  it('keeps the world point at the old canvas center at the new canvas center', () => {
    const v: Viewport = { offsetX: 40, offsetY: -10, scale: 50 }
    const next = recenterViewport(v, { width: 800, height: 600 }, { width: 390, height: 700 })
    const before = screenToWorld(v, { x: 400, y: 300 })
    const after = screenToWorld(next, { x: 195, y: 350 })
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(next.scale).toBe(v.scale)
  })

  it('is identity when the size does not change', () => {
    const v: Viewport = { offsetX: 12, offsetY: 34, scale: 80 }
    expect(recenterViewport(v, { width: 500, height: 400 }, { width: 500, height: 400 })).toEqual(v)
  })
})
```

Add `recenterViewport` to the existing import from `./viewport` and `describe` to the vitest import if missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/editor2d/viewport.test.ts`
Expected: FAIL — `recenterViewport` is not exported.

- [ ] **Step 3: Implement**

Append to `src/editor2d/viewport.ts`:

```ts
export interface CanvasSize {
  width: number
  height: number
}

export function recenterViewport(v: Viewport, oldSize: CanvasSize, newSize: CanvasSize): Viewport {
  return {
    ...v,
    offsetX: v.offsetX + (newSize.width - oldSize.width) / 2,
    offsetY: v.offsetY + (newSize.height - oldSize.height) / 2,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/editor2d/viewport.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into Editor2D**

In `src/editor2d/Editor2D.tsx`, add `recenterViewport` to the import from `./viewport`, then replace the ResizeObserver block (currently lines 100-104):

```ts
      let lastSize = { width: app.screen.width, height: app.screen.height }
      const resizeObserver = new ResizeObserver(() => {
        app.resize()
        const nextSize = { width: app.screen.width, height: app.screen.height }
        viewport = recenterViewport(viewport, lastSize, nextSize)
        lastSize = nextSize
        markDirty()
      })
```

(The comment above the block and `resizeObserver.observe(host)` / cleanup lines stay.)

- [ ] **Step 6: Full verification**

Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add src/editor2d/viewport.ts src/editor2d/viewport.test.ts src/editor2d/Editor2D.tsx
git commit -m "feat: keep 2D viewport centered when the canvas resizes"
```

---

### Task 2: Pure gesture math module

**Files:**
- Create: `src/editor2d/gestures.ts`
- Test: `src/editor2d/gestures.test.ts`
- Modify: `src/editor2d/interactions.ts` (add `hitRadius`)
- Test: `src/editor2d/interactions.test.ts` (append)

**Interfaces:**
- Consumes: `Viewport`, `zoomAt`, `screenToWorld` from `./viewport`; `Vec2` from `../model/types`.
- Produces (Task 7 depends on these exact signatures):
  - `pinchTransform(viewport: Viewport, before: [Vec2, Vec2], after: [Vec2, Vec2]): Viewport`
  - `interface Tap { x: number; y: number; time: number }`
  - `isDoubleTap(prev: Tap | null, next: Tap, maxDelayMs?: number, maxDistPx?: number): boolean` (defaults 300, 30)
  - `hitRadius(base: number, pointerType?: string): number` in `./interactions` — doubles for `'touch'`.

- [ ] **Step 1: Write the failing tests**

Create `src/editor2d/gestures.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../model/types'
import { isDoubleTap, pinchTransform } from './gestures'
import { screenToWorld, type Viewport } from './viewport'

describe('pinchTransform', () => {
  it('zooms by the ratio of finger distances and anchors the world point under the midpoint', () => {
    const v: Viewport = { offsetX: 0, offsetY: 0, scale: 50 }
    const before: [Vec2, Vec2] = [{ x: 100, y: 200 }, { x: 300, y: 200 }]
    const after: [Vec2, Vec2] = [{ x: 50, y: 200 }, { x: 350, y: 200 }]
    const next = pinchTransform(v, before, after)
    expect(next.scale).toBeCloseTo(75) // 300px apart / 200px apart = 1.5x
    const worldBefore = screenToWorld(v, { x: 200, y: 200 })
    const worldAfter = screenToWorld(next, { x: 200, y: 200 })
    expect(worldAfter.x).toBeCloseTo(worldBefore.x)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y)
  })

  it('pans by the midpoint delta when the distance is unchanged', () => {
    const v: Viewport = { offsetX: 10, offsetY: 20, scale: 60 }
    const before: [Vec2, Vec2] = [{ x: 100, y: 100 }, { x: 200, y: 100 }]
    const after: [Vec2, Vec2] = [{ x: 140, y: 130 }, { x: 240, y: 130 }]
    const next = pinchTransform(v, before, after)
    expect(next.scale).toBeCloseTo(60)
    expect(next.offsetX).toBeCloseTo(50)
    expect(next.offsetY).toBeCloseTo(50)
  })

  it('respects the zoom clamp and survives coincident fingers', () => {
    const v: Viewport = { offsetX: 0, offsetY: 0, scale: 350 }
    const before: [Vec2, Vec2] = [{ x: 100, y: 100 }, { x: 110, y: 100 }]
    const after: [Vec2, Vec2] = [{ x: 0, y: 100 }, { x: 400, y: 100 }]
    expect(pinchTransform(v, before, after).scale).toBe(400)
    const degenerate: [Vec2, Vec2] = [{ x: 100, y: 100 }, { x: 100, y: 100 }]
    expect(pinchTransform(v, degenerate, after).scale).toBe(350) // factor treated as 1
  })
})

describe('isDoubleTap', () => {
  it('is true for two taps within 300ms and 30px', () => {
    expect(isDoubleTap({ x: 100, y: 100, time: 1000 }, { x: 110, y: 95, time: 1250 })).toBe(true)
  })
  it('is false when too slow, too far, or there is no previous tap', () => {
    expect(isDoubleTap({ x: 100, y: 100, time: 1000 }, { x: 100, y: 100, time: 1400 })).toBe(false)
    expect(isDoubleTap({ x: 100, y: 100, time: 1000 }, { x: 200, y: 100, time: 1100 })).toBe(false)
    expect(isDoubleTap(null, { x: 100, y: 100, time: 1000 })).toBe(false)
  })
})
```

Append to `src/editor2d/interactions.test.ts` (add `hitRadius` to its `./interactions` import):

```ts
describe('hitRadius', () => {
  it('doubles the base radius for touch and keeps it otherwise', () => {
    expect(hitRadius(8, 'touch')).toBe(16)
    expect(hitRadius(8, 'mouse')).toBe(8)
    expect(hitRadius(10, 'pen')).toBe(10)
    expect(hitRadius(9, undefined)).toBe(9)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor2d/gestures.test.ts src/editor2d/interactions.test.ts`
Expected: FAIL — module `./gestures` not found; `hitRadius` not exported.

- [ ] **Step 3: Implement**

Create `src/editor2d/gestures.ts`:

```ts
import type { Vec2 } from '../model/types'
import { zoomAt, type Viewport } from './viewport'

// Pure touch-gesture math for the 2D editor. Must stay free of Pixi/React/store imports.

export interface Tap {
  x: number
  y: number
  time: number
}

export function isDoubleTap(prev: Tap | null, next: Tap, maxDelayMs = 300, maxDistPx = 30): boolean {
  if (!prev) return false
  return (
    next.time - prev.time <= maxDelayMs &&
    Math.hypot(next.x - prev.x, next.y - prev.y) <= maxDistPx
  )
}

export function pinchTransform(viewport: Viewport, before: [Vec2, Vec2], after: [Vec2, Vec2]): Viewport {
  const d0 = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y)
  const d1 = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y)
  const factor = d0 > 0 && d1 > 0 ? d1 / d0 : 1
  const m0 = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 }
  const m1 = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 }
  const zoomed = zoomAt(viewport, m0, factor)
  return { ...zoomed, offsetX: zoomed.offsetX + (m1.x - m0.x), offsetY: zoomed.offsetY + (m1.y - m0.y) }
}
```

Append to `src/editor2d/interactions.ts`:

```ts
// Finger contact patches are much larger than a mouse cursor, so every screen-space
// hit-test doubles its radius when the interacting pointer is a touch.
export function hitRadius(base: number, pointerType?: string): number {
  return pointerType === 'touch' ? base * 2 : base
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/editor2d/gestures.test.ts src/editor2d/interactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor2d/gestures.ts src/editor2d/gestures.test.ts src/editor2d/interactions.ts src/editor2d/interactions.test.ts
git commit -m "feat: pure pinch/double-tap gesture math and touch hit radii"
```

---

### Task 3: Store — catalog close disarms placement; apartment sheet flag

**Files:**
- Modify: `src/store/planStore.ts`
- Test: `src/store/planStore.test.ts`

**Interfaces:**
- Produces (Tasks 5's App/Toolbar depend on these):
  - `setCatalogOpen(open: boolean)` now clears `placingFurniture` when called with `false`.
  - `apartmentPropsOpen: boolean` (initial `false`) and `setApartmentPropsOpen(open: boolean)` on `PlanState`.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/planStore.test.ts`:

```ts
describe('setCatalogOpen', () => {
  it('clears placingFurniture when the catalog closes', () => {
    const s = usePlanStore.getState()
    s.setCatalogOpen(true)
    s.setPlacingFurniture('sofa-3seat')
    s.setCatalogOpen(false)
    expect(usePlanStore.getState().placingFurniture).toBeNull()
    expect(usePlanStore.getState().catalogOpen).toBe(false)
  })

  it('keeps placingFurniture while the catalog stays open', () => {
    const s = usePlanStore.getState()
    s.setCatalogOpen(true)
    s.setPlacingFurniture('sofa-3seat')
    s.setCatalogOpen(true)
    expect(usePlanStore.getState().placingFurniture).toBe('sofa-3seat')
  })
})

describe('apartmentPropsOpen', () => {
  it('defaults closed and toggles via the setter', () => {
    usePlanStore.setState({ apartmentPropsOpen: false })
    usePlanStore.getState().setApartmentPropsOpen(true)
    expect(usePlanStore.getState().apartmentPropsOpen).toBe(true)
    usePlanStore.getState().setApartmentPropsOpen(false)
    expect(usePlanStore.getState().apartmentPropsOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/planStore.test.ts`
Expected: FAIL — `setApartmentPropsOpen` is not a function; the clearing test fails because `placingFurniture` survives close.

- [ ] **Step 3: Implement**

In `src/store/planStore.ts`, add to the `PlanState` interface after `setCatalogOpen`:

```ts
  apartmentPropsOpen: boolean
  setApartmentPropsOpen: (open: boolean) => void
```

Replace the `setCatalogOpen` implementation (line 262) and add the new state next to it:

```ts
  // Closing the catalog also disarms furniture placement — an armed ghost with no
  // visible catalog is disorienting and was a long-standing papercut.
  setCatalogOpen: (catalogOpen) =>
    set((s) => ({ catalogOpen, placingFurniture: catalogOpen ? s.placingFurniture : null })),

  apartmentPropsOpen: false,

  setApartmentPropsOpen: (apartmentPropsOpen) => set({ apartmentPropsOpen }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/planStore.test.ts`
Expected: PASS (including all pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/planStore.ts src/store/planStore.test.ts
git commit -m "feat: catalog close disarms placement; add apartment-props sheet flag"
```

---

### Task 4: useIsMobileLayout hook

**Files:**
- Create: `src/ui/useIsMobileLayout.ts`
- Test: `src/ui/useIsMobileLayout.test.tsx`
- Modify: `src/test-setup.ts` (jsdom matchMedia stub)

**Interfaces:**
- Produces (Task 5 depends on): `useIsMobileLayout(): boolean` and `MOBILE_LAYOUT_QUERY = '(max-width: 768px)'` from `src/ui/useIsMobileLayout`.

- [ ] **Step 1: Add the jsdom matchMedia stub**

jsdom has no `window.matchMedia`; without a stub, any component rendering the hook crashes in tests. Append to `src/test-setup.ts`:

```ts
// jsdom does not implement matchMedia. Default stub: desktop layout (matches: false).
// Tests that need mobile mock window.matchMedia themselves.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
```

- [ ] **Step 2: Write the failing test**

Create `src/ui/useIsMobileLayout.test.tsx`:

```tsx
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MOBILE_LAYOUT_QUERY, useIsMobileLayout } from './useIsMobileLayout'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return matches
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
  return {
    set(value: boolean) {
      matches = value
      act(() => listeners.forEach((fn) => fn()))
    },
  }
}

it('uses the 768px breakpoint query', () => {
  expect(MOBILE_LAYOUT_QUERY).toBe('(max-width: 768px)')
})

it('reflects the current match and updates on change events', () => {
  const media = mockMatchMedia(false)
  const { result } = renderHook(() => useIsMobileLayout())
  expect(result.current).toBe(false)
  media.set(true)
  expect(result.current).toBe(true)
  media.set(false)
  expect(result.current).toBe(false)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/ui/useIsMobileLayout.test.tsx`
Expected: FAIL — module `./useIsMobileLayout` not found.

- [ ] **Step 4: Implement**

Create `src/ui/useIsMobileLayout.ts`:

```ts
import { useSyncExternalStore } from 'react'

export const MOBILE_LAYOUT_QUERY = '(max-width: 768px)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_LAYOUT_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches
}

/** True when the viewport is phone-sized. Drives component-tree differences only —
 *  visual styling reacts to the same query in CSS, and touch behavior is keyed off
 *  each event's pointerType, never off this hook. */
export function useIsMobileLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/ui/useIsMobileLayout.test.tsx` — Expected: PASS.
Run: `npm test` — Expected: all pass (stub must not break existing suites).

- [ ] **Step 6: Commit**

```bash
git add src/ui/useIsMobileLayout.ts src/ui/useIsMobileLayout.test.tsx src/test-setup.ts
git commit -m "feat: useIsMobileLayout hook with jsdom matchMedia stub"
```

---

### Task 5: Mobile shell behavior — sheets, Apartment button, close buttons

On mobile, only one sheet shows at a time: the catalog sheet wins when open; the properties sheet shows when something is selected or the Apartment toggle is on; selecting something closes the catalog. Desktop rendering is unchanged.

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/Toolbar.tsx`
- Modify: `src/ui/PropertiesPanel.tsx`
- Modify: `src/ui/CatalogPanel.tsx`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `useIsMobileLayout` (Task 4), `apartmentPropsOpen`/`setApartmentPropsOpen` and clearing `setCatalogOpen` (Task 3).
- Produces: `mobile-only` and `sheet-close` CSS class names that Task 6 styles. Buttons: toolbar "Apartment" toggle; "✕" close buttons labeled `Close panel` / `Close catalog`.

- [ ] **Step 1: Write the failing tests**

In `src/ui/App.test.tsx`, extend the `beforeEach` reset to cover the new/UI state:

```ts
beforeEach(() => {
  usePlanStore.setState({
    plan: createDefaultPlan(),
    selection: null,
    mode: '2d',
    placing: null,
    placingFurniture: null,
    catalogOpen: false,
    apartmentPropsOpen: false,
  })
})
```

Append these tests (add `vi` usage for matchMedia; `mockMobileLayout` helper at top level of the file):

```tsx
function mockMobileLayout() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(max-width: 768px)',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

it('mobile: hides the properties panel until something is selected', () => {
  mockMobileLayout()
  render(<App />)
  expect(screen.queryByRole('heading', { name: 'Apartment' })).not.toBeInTheDocument()
  act(() => {
    usePlanStore.getState().addRoom()
  })
  expect(screen.getByRole('heading', { name: 'Room' })).toBeInTheDocument()
  vi.restoreAllMocks()
})

it('mobile: the Apartment toolbar button opens apartment properties', () => {
  mockMobileLayout()
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Apartment' }))
  expect(screen.getByRole('heading', { name: 'Apartment' })).toBeInTheDocument()
  vi.restoreAllMocks()
})

it('mobile: selecting something closes the catalog sheet', () => {
  mockMobileLayout()
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))
  expect(screen.getByRole('tablist')).toBeInTheDocument()
  act(() => {
    usePlanStore.getState().addRoom() // addRoom selects the new room
  })
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Room' })).toBeInTheDocument()
  vi.restoreAllMocks()
})

it('mobile: an open catalog wins over a selection sheet', () => {
  mockMobileLayout()
  render(<App />)
  act(() => {
    usePlanStore.getState().addRoom()
  })
  fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))
  expect(screen.getByRole('tablist')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Room' })).not.toBeInTheDocument()
  vi.restoreAllMocks()
})

it('mobile: the sheet close button deselects and closes', () => {
  mockMobileLayout()
  render(<App />)
  act(() => {
    usePlanStore.getState().addRoom()
  })
  fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))
  expect(usePlanStore.getState().selection).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Room' })).not.toBeInTheDocument()
  vi.restoreAllMocks()
})

it('desktop: the properties panel is always present', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Apartment' })).toBeInTheDocument()
})
```

Note: the default test-setup matchMedia stub returns `matches: false`, so unmocked tests exercise the desktop layout.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: the new mobile tests FAIL (no Apartment button, panel always rendered); pre-existing tests still pass.

- [ ] **Step 3: Implement App.tsx**

Replace `src/ui/App.tsx` content:

```tsx
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
```

- [ ] **Step 4: Implement Toolbar Apartment button**

In `src/ui/Toolbar.tsx`, add selectors inside `Toolbar()`:

```ts
  const apartmentPropsOpen = usePlanStore((s) => s.apartmentPropsOpen)
  const setApartmentPropsOpen = usePlanStore((s) => s.setApartmentPropsOpen)
```

and insert after the Furniture button (before Export):

```tsx
      <button
        className={apartmentPropsOpen ? 'mobile-only active' : 'mobile-only'}
        onClick={() => setApartmentPropsOpen(!apartmentPropsOpen)}
      >
        Apartment
      </button>
```

- [ ] **Step 5: Implement sheet close buttons**

In `src/ui/PropertiesPanel.tsx`, add selectors in `PropertiesPanel()`:

```ts
  const selectRoom = usePlanStore((s) => s.selectRoom)
  const setApartmentPropsOpen = usePlanStore((s) => s.setApartmentPropsOpen)
```

and make the close button the first child of the `<aside className="panel">`:

```tsx
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
```

In `src/ui/CatalogPanel.tsx`, add `const setCatalogOpen = usePlanStore((s) => s.setCatalogOpen)` and make this the first child of `<aside className="catalog">`:

```tsx
      <button className="sheet-close mobile-only" aria-label="Close catalog" onClick={() => setCatalogOpen(false)}>
        ✕
      </button>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: PASS — new mobile tests and all pre-existing tests. Note: `Close panel`/`Close catalog` buttons render on desktop too (CSS hides them in Task 6); if any pre-existing test uses an ambiguous button query that now matches, fix the query to be exact.

Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/App.tsx src/ui/App.test.tsx src/ui/Toolbar.tsx src/ui/PropertiesPanel.tsx src/ui/CatalogPanel.tsx
git commit -m "feat: mobile one-sheet-at-a-time shell behavior"
```

---

### Task 6: Mobile styles and iOS specifics

Pure presentation: media query turning panels into bottom sheets, compact scrollable toolbar, dvh heights, safe-area padding, overscroll and tap-delay fixes, numeric keyboard, `viewport-fit=cover`.

**Files:**
- Modify: `src/ui/app.css`
- Modify: `index.html:5` (viewport meta)
- Modify: `src/ui/NumberField.tsx`
- Test: `src/ui/NumberField.test.tsx` (append)

**Interfaces:**
- Consumes: `mobile-only` / `sheet-close` class names from Task 5.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/NumberField.test.tsx` (match the file's existing render conventions):

```tsx
it('hints the decimal keyboard for touch devices', () => {
  render(<NumberField label="Width (m)" value={2} onCommit={() => {}} />)
  expect(screen.getByLabelText('Width (m)')).toHaveAttribute('inputmode', 'decimal')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/NumberField.test.tsx`
Expected: FAIL — attribute missing.

- [ ] **Step 3: Implement NumberField**

In `src/ui/NumberField.tsx`, add `inputMode="decimal"` to the `<input>`:

```tsx
      <input
        inputMode="decimal"
        value={text}
        ...
```

- [ ] **Step 4: Update index.html viewport meta**

Replace line 5 of `index.html`:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

(`viewport-fit=cover` is required for `env(safe-area-inset-bottom)` to be non-zero on iPhones. If the line meanwhile contains other attributes or a favicon link exists nearby, change only this meta tag.)

- [ ] **Step 5: Add the CSS**

Append to `src/ui/app.css`:

```css
/* ---------- mobile (breakpoint must match MOBILE_LAYOUT_QUERY) ---------- */

.mobile-only { display: none; }

button, input, select { touch-action: manipulation; }
body { overscroll-behavior: none; }

/* iOS Safari: 100% of the layout viewport leaves a dead zone under the collapsing
   address bar; dvh tracks the visible viewport. */
@supports (height: 100dvh) {
  html, body, #root { height: 100dvh; }
}

@media (max-width: 768px) {
  .mobile-only { display: inline-block; }

  .toolbar { overflow-x: auto; gap: 8px; }
  .toolbar strong { display: none; }
  .toolbar button { padding: 10px 12px; flex-shrink: 0; }

  .panel,
  .catalog {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    border: none;
    border-top: 1px solid #dde1e6;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.12);
    background: #fff;
    z-index: 5;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
  .panel {
    max-height: 40vh;
    max-height: 40dvh;
    overflow-y: auto;
    padding-top: 36px; /* room for the floating close button */
  }
  .catalog {
    max-height: 55vh;
    max-height: 55dvh;
  }
  .catalog .catalog-tabs { padding-right: 44px; }
  .catalog-items { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
  .catalog-items button,
  .catalog-tabs button { min-height: 44px; }
  .panel .field input,
  .panel button { min-height: 40px; }

  .sheet-close {
    position: absolute;
    top: 4px;
    right: 8px;
    border: none;
    background: transparent;
    font-size: 18px;
    padding: 8px 10px;
  }
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/ui/NumberField.test.tsx` — Expected: PASS.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/app.css index.html src/ui/NumberField.tsx src/ui/NumberField.test.tsx
git commit -m "feat: mobile bottom-sheet styles, compact toolbar, iOS viewport fixes"
```

---

### Task 7: Editor2D touch wiring

Wire touch into the Pixi editor: one-finger pan on empty canvas, pinch-zoom/pan, double-tap refit, second-finger drag cancel, doubled touch radii, always-snap rotation, `touch-action: none`. Mouse paths must be byte-for-byte unchanged in behavior.

**Files:**
- Modify: `src/editor2d/Editor2D.tsx`

**Interfaces:**
- Consumes: `pinchTransform`, `isDoubleTap`, `type Tap` from `./gestures` (Task 2); `hitRadius` from `./interactions` (Task 2); `fitApartment`, `recenterViewport` wiring from Task 1.
- Produces: nothing later tasks import; Task 8 verifies behavior end-to-end.

There is no jsdom test for this task (WebGL is unavailable; Editor2D is mocked in App tests). All decision math was TDD'd in Tasks 1-2; this task is wiring, verified by typecheck, the full existing suite, and Task 8's E2E.

- [ ] **Step 1: Add imports and touch state**

In `src/editor2d/Editor2D.tsx` add imports:

```ts
import { isDoubleTap, pinchTransform, type Tap } from './gestures'
```

add `hitRadius` to the existing `./interactions` import list.

After `let drag: DragState = { kind: 'idle' }` (around line 118), add:

```ts
      // touch gesture state: active touch contacts, whether a two-finger pinch is
      // running, and the previous tap for double-tap detection
      const touchPoints = new Map<number, Vec2>()
      let pinching = false
      let lastTap: Tap | null = null
```

Right after `host.appendChild(app.canvas)` add:

```ts
      app.canvas.style.touchAction = 'none' // the editor owns all gestures on the canvas
```

- [ ] **Step 2: pointerdown — track contacts, enter pinch, pan/double-tap on empty**

At the very top of the `app.stage.on('pointerdown', (e) => {` handler (before the `e.button === 1 || spaceDown` check), insert:

```ts
        if (e.pointerType === 'touch') {
          touchPoints.set(e.pointerId, { x: e.global.x, y: e.global.y })
          if (touchPoints.size === 2) {
            // Second finger: abandon any one-finger interaction and navigate instead.
            // Reverting here doubles as the touch equivalent of Escape-cancel.
            revertDragIfColliding()
            drag = { kind: 'idle' }
            guides = []
            panning = null
            pinching = true
            markDirty()
            return
          }
          if (touchPoints.size > 2) return
        }
```

Note: `revertDragIfColliding` is declared with `const` *after* the handlers today (line ~379). Move its declaration up, directly above the `app.stage.on('pointerdown', ...)` registration, so it is in scope here (it only closes over `drag`, which is already declared).

Replace the hit-test radii in the same handler with pointer-aware ones:

- `nearestEdge(store.plan, viewport, screen)` (opening placement, line ~152) → `nearestEdge(store.plan, viewport, screen, hitRadius(10, e.pointerType))`
- `nearestEdge(store.plan, viewport, screen)` (wall furniture placement, line ~170) → same replacement
- `hitRotationHandle(selFurniture, viewport, screen)` → `hitRotationHandle(selFurniture, viewport, screen, hitRadius(9, e.pointerType))`
- `hitOpening(store.plan, viewport, screen)` → `hitOpening(store.plan, viewport, screen, hitRadius(8, e.pointerType))`
- `hitFurniture(store.plan, viewport, screen)` → `hitFurniture(store.plan, viewport, screen, hitRadius(8, e.pointerType))`
- `hitHandle(selectedRect, viewport, screen)` → `hitHandle(selectedRect, viewport, screen, hitRadius(8, e.pointerType))`

Replace the tail of the handler (currently):

```ts
        const roomId = hitRoom(store.plan.rooms, world)
        store.selectRoom(roomId)
        if (roomId) {
          const rect = polygonToRect(store.plan.rooms.find((r) => r.id === roomId)!.polygon)
          if (rect) drag = { kind: 'move', roomId, grabOffset: { x: world.x - rect.x, y: world.y - rect.y } }
        }
```

with:

```ts
        const roomId = hitRoom(store.plan.rooms, world)
        store.selectRoom(roomId)
        if (roomId) {
          const rect = polygonToRect(store.plan.rooms.find((r) => r.id === roomId)!.polygon)
          if (rect) drag = { kind: 'move', roomId, grabOffset: { x: world.x - rect.x, y: world.y - rect.y } }
        } else if (e.pointerType === 'touch') {
          // empty canvas: one finger pans; a quick second tap refits the whole apartment
          const tap: Tap = { x: e.global.x, y: e.global.y, time: performance.now() }
          if (isDoubleTap(lastTap, tap)) {
            viewport = fitApartment(app.screen.width, app.screen.height, store.plan.apartment)
            lastTap = null
            markDirty()
            return
          }
          lastTap = tap
          panning = { lastX: e.global.x, lastY: e.global.y }
        }
```

- [ ] **Step 3: floor-furniture placement must work from a tap**

Today the armed floor-furniture branch places from `ghost`, which only exists after a `pointermove` — so a touch tap (no hover) places nothing. Compute the placement from the pointer-down point directly; for mouse this is identical to the old behavior (the ghost always sat under the cursor).

In the `pointerdown` handler, replace the floor branch of the `store.placingFurniture` block (currently `if (cat?.mount === 'floor') { if (ghost?.valid) { ... } }`) with:

```ts
          if (cat?.mount === 'floor') {
            const snap = altDown ? null : snapFloorItemToWall(world, cat.defaultSize, store.plan)
            const position = snap?.position ?? world
            const rotation = snap?.rotation ?? 0
            const candidate = { position, rotation, size: cat.defaultSize }
            const valid =
              floorItemInBounds(candidate, store.plan.apartment) &&
              (cat.layer !== 'solid' || !floorItemCollides(candidate, store.plan))
            if (valid) {
              store.placeFurniture(cat.id, { mount: 'floor', position, rotation })
              ghost = null
            }
          } else if (cat) {
```

(`snapFloorItemToWall`, `floorItemInBounds`, and `floorItemCollides` are already imported at the top of the file. The wall-item `else if (cat)` branch is unchanged.)

- [ ] **Step 4: pointermove — pinch transform before everything else**

At the very top of the `app.stage.on('pointermove', (e) => {` handler, insert:

```ts
        if (e.pointerType === 'touch' && touchPoints.has(e.pointerId)) {
          if (pinching && touchPoints.size === 2) {
            const ids = [...touchPoints.keys()] as [number, number]
            const before: [Vec2, Vec2] = [touchPoints.get(ids[0])!, touchPoints.get(ids[1])!]
            touchPoints.set(e.pointerId, { x: e.global.x, y: e.global.y })
            const after: [Vec2, Vec2] = [touchPoints.get(ids[0])!, touchPoints.get(ids[1])!]
            viewport = pinchTransform(viewport, before, after)
            markDirty()
            return
          }
          touchPoints.set(e.pointerId, { x: e.global.x, y: e.global.y })
        }
```

In the `rotateFurniture` branch, replace the snap argument:

```ts
          store.rotateFurniture(
            activeDrag.itemId,
            rotationFromPointer(
              item,
              viewport,
              { x: e.global.x, y: e.global.y },
              e.pointerType === 'touch' ? true : !shiftDown,
            ),
          )
```

In the `moveWallItem` branch, replace the fixed radius:

```ts
          const hit = nearestEdge(store.plan, viewport, { x: e.global.x, y: e.global.y }, hitRadius(20, e.pointerType))
```

- [ ] **Step 5: pointerup — release contacts, downgrade pinch to pan**

Replace the current registration:

```ts
      app.stage.on('pointerup', endInteraction)
      app.stage.on('pointerupoutside', endInteraction)
```

with:

```ts
      const endPointer = (e: { pointerType: string; pointerId: number }) => {
        if (e.pointerType === 'touch') {
          touchPoints.delete(e.pointerId)
          if (pinching) {
            if (touchPoints.size === 1) {
              // one finger lifted mid-pinch: keep navigating with the remaining finger
              const rest = [...touchPoints.values()][0]
              panning = { lastX: rest.x, lastY: rest.y }
              pinching = false
              return
            }
            pinching = touchPoints.size > 1
          }
        }
        endInteraction()
      }
      app.stage.on('pointerup', endPointer)
      app.stage.on('pointerupoutside', endPointer)
      app.stage.on('pointercancel', endPointer)
```

(`endInteraction` itself is unchanged. iOS fires `pointercancel` when the system steals a gesture; treating it as pointerup keeps the contact map honest.)

- [ ] **Step 6: Verify**

Run: `npm test` — Expected: all pass (no jsdom coverage of this file, but nothing may regress).
Run: `npm run build` — Expected: clean typecheck (this is the real gate for the wiring).

Quick manual sanity check in a desktop browser (mouse must behave exactly as before): `npm run dev`, drag/resize a room, wheel-zoom, middle-pan, place a door.

- [ ] **Step 7: Commit**

```bash
git add src/editor2d/Editor2D.tsx
git commit -m "feat: touch gestures in 2D editor — pan, pinch-zoom, double-tap refit, touch radii"
```

---

### Task 8: E2E mobile verification

Drive the app in headless Chrome with an iPhone-sized touch context, exercising every mobile flow with screenshots. Fix anything found (small fixes inline in this task; structural problems go back to the owning task's approach).

**Files:**
- Create: E2E script *outside the repo* in the session scratchpad (do not commit it), e.g. `$SCRATCHPAD/mobile-e2e.mjs`
- No repo changes expected unless bugs are found.

**Interfaces:**
- Consumes: the deployed behavior of Tasks 1-7; `window.__planStore` (exposed in DEV by `src/main.tsx`).

- [ ] **Step 1: Start the dev server and install playwright-core in the scratchpad**

```bash
cd <worktree> && npm run dev &   # port 5173
mkdir -p $SCRATCHPAD/e2e && cd $SCRATCHPAD/e2e && npm init -y && npm install playwright-core
```

(macOS note from prior runs: no `timeout` command, no chromium CLI — always `channel: 'chrome'`, headless.)

- [ ] **Step 2: Write the E2E script**

Create `$SCRATCHPAD/e2e/mobile-e2e.mjs`:

```js
import { chromium } from 'playwright-core'

const URL = 'http://localhost:5173'
const shots = process.env.SHOTS ?? '.'
let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()
const cdp = await context.newCDPSession(page)

// Return only plain-data slices — getState() also holds functions, which
// cannot cross page.evaluate's serialization boundary.
const state = () =>
  page.evaluate(() => {
    const s = window.__planStore.getState()
    return {
      plan: s.plan,
      selection: s.selection,
      placingFurniture: s.placingFurniture,
      catalogOpen: s.catalogOpen,
    }
  })
const canvasBox = async () => (await page.locator('.canvas-area canvas').boundingBox())

// Synthetic one-finger drag via CDP (Playwright's touchscreen only taps).
async function touchDrag(x1, y1, x2, y2, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }],
  })
  for (let i = 1; i <= steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps
    const y = y1 + ((y2 - y1) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

await page.goto(URL)
await page.waitForSelector('.canvas-area canvas')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForSelector('.canvas-area canvas')

// 1. Shell: no side panels, toolbar present
await page.screenshot({ path: `${shots}/01-shell.png` })
check('properties hidden with no selection', !(await page.getByRole('heading', { name: 'Apartment' }).isVisible().catch(() => false)))
check('Apartment button visible on mobile', await page.getByRole('button', { name: 'Apartment' }).isVisible())

// 2. Add a room, drag it by touch
await page.getByRole('button', { name: '+ Add room' }).tap()
let s = await state()
check('room added and selected', s.plan.rooms.length === 1 && s.selection?.kind === 'room')
await page.screenshot({ path: `${shots}/02-room-selected-sheet.png` })
check('room sheet visible', await page.getByRole('heading', { name: 'Room' }).isVisible())

const box = await canvasBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
const before = JSON.stringify((await state()).plan.rooms[0].polygon)
await touchDrag(cx, cy, cx + 80, cy + 60)
const after = JSON.stringify((await state()).plan.rooms[0].polygon)
check('touch drag moved the room', before !== after)
await page.screenshot({ path: `${shots}/03-room-dragged.png` })

// 3. Close the sheet, one-finger pan on empty canvas, pinch zoom, double-tap refit
await page.getByRole('button', { name: 'Close panel' }).tap()
check('deselected via close button', (await state()).selection === null)
const shotBeforePan = await page.locator('.canvas-area').screenshot()
await touchDrag(box.x + 30, box.y + 30, box.x + 150, box.y + 200) // empty corner: pans
const shotAfterPan = await page.locator('.canvas-area').screenshot()
check('one-finger pan changed the canvas', !shotBeforePan.equals(shotAfterPan))

await cdp.send('Input.synthesizePinchGesture', { x: cx, y: cy, scaleFactor: 2, gestureSourceType: 'touch' })
const shotAfterPinch = await page.locator('.canvas-area').screenshot()
check('pinch zoom changed the canvas', !shotAfterPan.equals(shotAfterPinch))
await page.screenshot({ path: `${shots}/04-pinched.png` })

await page.touchscreen.tap(box.x + 40, box.y + 40)
await page.touchscreen.tap(box.x + 42, box.y + 42) // double tap = refit
const shotAfterFit = await page.locator('.canvas-area').screenshot()
check('double-tap refit changed the canvas', !shotAfterPinch.equals(shotAfterFit))
await page.screenshot({ path: `${shots}/05-refit.png` })

// 4. Furniture from the catalog sheet
await page.getByRole('button', { name: 'Furniture' }).tap()
await page.screenshot({ path: `${shots}/06-catalog-sheet.png` })
check('catalog sheet open', await page.getByRole('tablist').isVisible())
await page.getByRole('tab', { name: 'Living' }).tap()
await page.getByRole('button', { name: /Sofa/ }).first().tap()
check('placement armed', (await state()).placingFurniture !== null)
await page.touchscreen.tap(cx, cy - 100) // tap inside the room to place
s = await state()
check('furniture placed by tap', s.plan.furniture.length === 1)
check('catalog closed after placement selection', s.catalogOpen === false || !(await page.getByRole('tablist').isVisible().catch(() => false)))
await page.screenshot({ path: `${shots}/07-furniture-placed.png` })

// 5. Edit a property in the sheet (numeric keyboard hint asserted in unit tests)
await page.getByLabel('Rotation (°)').fill('45')
await page.getByLabel('Rotation (°)').press('Enter')
check('rotation committed from sheet', (await state()).plan.furniture[0].rotation === 45)

// 6. Apartment sheet via toolbar
await page.getByRole('button', { name: 'Close panel' }).tap()
await page.getByRole('button', { name: 'Apartment' }).tap()
check('apartment sheet opens', await page.getByRole('heading', { name: 'Apartment' }).isVisible())
await page.getByRole('button', { name: 'Apartment' }).tap() // toggle off

// 7. 3D: orbit + pinch by touch
await page.getByRole('button', { name: '3D' }).tap()
await page.waitForTimeout(1500) // let models/textures settle
const shot3dBefore = await page.locator('.canvas-area').screenshot()
await touchDrag(cx, cy, cx + 120, cy - 40)
await page.waitForTimeout(300)
const shot3dAfter = await page.locator('.canvas-area').screenshot()
check('touch orbit changed the 3D view', !shot3dBefore.equals(shot3dAfter))
await page.screenshot({ path: `${shots}/08-3d-orbit.png` })

await browser.close()
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 3: Run it**

```bash
cd $SCRATCHPAD/e2e && SHOTS=$SCRATCHPAD/e2e node mobile-e2e.mjs
```

Expected: `ALL PASS` and 8 screenshots. **Look at every screenshot** — automated diffs prove pixels changed, not that the layout is right. Verify: toolbar fits and scrolls, sheets sit above the home-indicator area, canvas fills the screen, catalog grid is finger-sized.

- [ ] **Step 4: Fix what's broken**

Any failure: diagnose with the systematic-debugging skill, fix in the owning file, add/adjust a unit test when the bug is in pure logic, re-run `npm test` and the E2E until green. Commit fixes with descriptive messages.

- [ ] **Step 5: Desktop regression pass**

Re-run the E2E ideas manually at desktop size (or simply: `npm test && npm run build`, then a quick mouse-driven sanity check via `npm run dev`): drag, wheel-zoom, panels docked at the sides, no `mobile-only` buttons visible.

- [ ] **Step 6: Final commit**

```bash
git add -A && git status   # confirm only intended fixes are staged
git commit -m "test: E2E-verified mobile flows; fixes from mobile verification"
```

(Skip the commit if Step 4 produced no changes. Do NOT merge or push — the controller handles integration.)
