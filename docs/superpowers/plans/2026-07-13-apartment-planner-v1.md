# Apartment Planner v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web app to plan an apartment layout: define apartment dimensions, add/move/resize/snap rectangular rooms in a PixiJS 2D editor, and view the result in a react-three-fiber 3D scene, with localStorage persistence.

**Architecture:** A single Zustand store holds the `Plan`; the 2D editor (PixiJS) dispatches actions, the 3D viewer (react-three-fiber) only reads. All geometry/snapping/serialization logic lives in pure TS modules (`src/model/`, plus pure helpers in `editor2d/` and `viewer3d/`) with unit tests; the Pixi/Three components are thin shells.

**Tech Stack:** Vite 5, React 18, TypeScript 5, PixiJS 8, three + @react-three/fiber 8 + @react-three/drei 9, Zustand 5, Zod 3, Vitest 2 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-13-apartment-planner-design.md`

## Global Constraints

- Node ≥ 20 required (uses `crypto.randomUUID` in tests/jsdom).
- Units: meters internally, all stored values rounded to cm — `roundCm(v) = Math.round(v*100)/100`.
- Coordinates: 2D is Y-down, origin (0,0) at the apartment boundary's top-left corner. 3D maps plan (x, y) → (x, z).
- Room minimum size: `MIN_ROOM_SIZE = 0.5` m per side.
- Apartment clamps: width/depth 1–100 m, wallHeight 2–5 m (default 2.7).
- Wall thickness in 3D: `WALL_THICKNESS = 0.1` m.
- Plan schema `version: 1`; colors are `#rrggbb` strings.
- localStorage keys: `home-plan.plan` (plan), `home-plan.backup` (corrupt payload preserved on recovery).
- Rooms are stored as polygons (`Vec2[]`, canonical rect order: TL, TR, BR, BL) but edited as rects.
- Rooms MAY overlap or exceed the apartment boundary — never block the interaction; tint the room as a warning instead.
- Snap thresholds are given in meters (the editor converts 10 px via `10 / viewport.scale`); edge snap beats grid snap.
- Package manager: npm. Run a single test file with `npx vitest run <path>`.

---

### Task 1: Project scaffold with test tooling

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `.gitignore`
- Create: `src/main.tsx`, `src/ui/App.tsx`, `src/ui/app.css`, `src/test-setup.ts`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running Vite app with `npm run dev`, `npm test`, `npm run build`. `App` is the default export of `src/ui/App.tsx`.

- [ ] **Step 1: Create the scaffold files**

`package.json`:

```json
{
  "name": "home-plan",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Home Plan</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`.gitignore`:

```
node_modules
dist
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './ui/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/ui/App.tsx`:

```tsx
export default function App() {
  return <h1>Home Plan</h1>
}
```

`src/ui/app.css`:

```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; font-family: system-ui, sans-serif; }
```

`src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react@18 react-dom@18 zustand@5 zod@3 pixi.js@8 three@0.166.1 @react-three/fiber@8 @react-three/drei@9
npm install -D typescript@5 vite@5 @vitejs/plugin-react@4 vitest@2 jsdom@25 @testing-library/react@16 @testing-library/dom@10 @testing-library/jest-dom@6 @types/react@18 @types/react-dom@18 @types/three@0.166.0
```

- [ ] **Step 3: Write the smoke test**

`src/ui/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import App from './App'

it('renders the app title', () => {
  render(<App />)
  expect(screen.getByText('Home Plan')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: Verify dev server manually**

Run: `npm run dev` — open http://localhost:5173, confirm "Home Plan" renders. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS app with Vitest"
```

---

### Task 2: Model types and geometry primitives

**Files:**
- Create: `src/model/types.ts`, `src/model/geometry.ts`
- Test: `src/model/geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - Types: `Vec2 {x,y}`, `Rect {x,y,width,height}`, `Apartment {width,depth,wallHeight}`, `Room {id,name,polygon: Vec2[],color}`, `Plan {version:1,id,name,apartment,rooms}`, `Mode = '2d'|'3d'`
  - `MIN_ROOM_SIZE: number` (0.5)
  - `roundCm(v: number): number`
  - `rectToPolygon(r: Rect): Vec2[]` (order TL, TR, BR, BL)
  - `polygonToRect(polygon: Vec2[]): Rect | null` (null unless 4-point axis-aligned non-degenerate rect)
  - `polygonArea(polygon: Vec2[]): number` (absolute shoelace)
  - `rectsOverlap(a: Rect, b: Rect): boolean` (strict interior overlap; touching edges is NOT overlap)
  - `rectInBounds(r: Rect, apartment: Apartment): boolean`

- [ ] **Step 1: Write the types**

`src/model/types.ts`:

```ts
export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Apartment {
  width: number
  depth: number
  wallHeight: number
}

export interface Room {
  id: string
  name: string
  polygon: Vec2[]
  color: string
}

export interface Plan {
  version: 1
  id: string
  name: string
  apartment: Apartment
  rooms: Room[]
}

export type Mode = '2d' | '3d'
```

- [ ] **Step 2: Write the failing tests**

`src/model/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MIN_ROOM_SIZE,
  polygonArea,
  polygonToRect,
  rectInBounds,
  rectsOverlap,
  rectToPolygon,
  roundCm,
} from './geometry'

describe('roundCm', () => {
  it('rounds to centimeter precision', () => {
    expect(roundCm(1.2345)).toBe(1.23)
    expect(roundCm(1.239)).toBe(1.24)
    expect(roundCm(2)).toBe(2)
  })
})

describe('rectToPolygon / polygonToRect', () => {
  it('round-trips a rect through its polygon', () => {
    const rect = { x: 1, y: 2, width: 4, height: 3 }
    expect(polygonToRect(rectToPolygon(rect))).toEqual(rect)
  })

  it('produces corners in TL, TR, BR, BL order', () => {
    expect(rectToPolygon({ x: 0, y: 0, width: 2, height: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 1 },
    ])
  })

  it('rejects non-rectangular polygons', () => {
    expect(
      polygonToRect([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBeNull()
  })

  it('rejects polygons with wrong point count or zero area', () => {
    expect(polygonToRect([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toBeNull()
    expect(
      polygonToRect([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBeNull()
  })
})

describe('polygonArea', () => {
  it('computes rect area', () => {
    expect(polygonArea(rectToPolygon({ x: 1, y: 1, width: 4, height: 3 }))).toBe(12)
  })
  it('returns 0 for collinear points', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBe(0)
  })
})

describe('rectsOverlap', () => {
  const a = { x: 0, y: 0, width: 2, height: 2 }
  it('detects interior overlap', () => {
    expect(rectsOverlap(a, { x: 1, y: 1, width: 2, height: 2 })).toBe(true)
  })
  it('does not treat touching edges as overlap', () => {
    expect(rectsOverlap(a, { x: 2, y: 0, width: 2, height: 2 })).toBe(false)
  })
  it('detects no overlap when apart', () => {
    expect(rectsOverlap(a, { x: 5, y: 5, width: 1, height: 1 })).toBe(false)
  })
})

describe('rectInBounds', () => {
  const apartment = { width: 10, depth: 8, wallHeight: 2.7 }
  it('accepts a rect fully inside', () => {
    expect(rectInBounds({ x: 0, y: 0, width: 10, height: 8 }, apartment)).toBe(true)
  })
  it('rejects a rect crossing the boundary', () => {
    expect(rectInBounds({ x: 9, y: 0, width: 2, height: 2 }, apartment)).toBe(false)
    expect(rectInBounds({ x: -0.1, y: 0, width: 2, height: 2 }, apartment)).toBe(false)
  })
})

describe('MIN_ROOM_SIZE', () => {
  it('is 0.5 m', () => {
    expect(MIN_ROOM_SIZE).toBe(0.5)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/model/geometry.test.ts`
Expected: FAIL — cannot resolve `./geometry`.

- [ ] **Step 4: Implement geometry**

`src/model/geometry.ts`:

```ts
import type { Apartment, Rect, Vec2 } from './types'

export const MIN_ROOM_SIZE = 0.5

export function roundCm(v: number): number {
  return Math.round(v * 100) / 100
}

export function rectToPolygon(r: Rect): Vec2[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ]
}

export function polygonToRect(polygon: Vec2[]): Rect | null {
  if (polygon.length !== 4) return null
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const rect: Rect = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  if (rect.width === 0 || rect.height === 0) return null
  const corners = rectToPolygon(rect)
  const matches = corners.every((c) => polygon.some((p) => p.x === c.x && p.y === c.y))
  return matches ? rect : null
}

export function polygonArea(polygon: Vec2[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

export function rectInBounds(r: Rect, apartment: Apartment): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.width <= apartment.width && r.y + r.height <= apartment.depth
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/model/geometry.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/model
git commit -m "feat: model types and geometry primitives"
```

---

### Task 3: Plan schema, serialization, default plan

**Files:**
- Create: `src/model/serialization.ts`
- Test: `src/model/serialization.test.ts`

**Interfaces:**
- Consumes: `Plan` from `./types`; `polygonArea`, `rectToPolygon` from `./geometry`.
- Produces:
  - `planSchema` (zod schema for `Plan`)
  - `createDefaultPlan(): Plan` — 10×8 m apartment, wallHeight 2.7, no rooms, `crypto.randomUUID()` id, name `'My apartment'`
  - `serializePlan(plan: Plan): string` (pretty JSON)
  - `parsePlan(json: string): Plan | null` — null on invalid JSON, schema mismatch, unknown version, or degenerate polygons

- [ ] **Step 1: Write the failing tests**

`src/model/serialization.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import { createDefaultPlan, parsePlan, serializePlan } from './serialization'

describe('createDefaultPlan', () => {
  it('creates a valid empty plan with spec defaults', () => {
    const plan = createDefaultPlan()
    expect(plan.version).toBe(1)
    expect(plan.apartment).toEqual({ width: 10, depth: 8, wallHeight: 2.7 })
    expect(plan.rooms).toEqual([])
    expect(plan.id).not.toBe('')
  })
})

describe('serializePlan / parsePlan', () => {
  it('round-trips a plan with rooms', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Bedroom',
      polygon: rectToPolygon({ x: 1, y: 1, width: 4, height: 3 }),
      color: '#8ecae6',
    })
    expect(parsePlan(serializePlan(plan))).toEqual(plan)
  })

  it('rejects invalid JSON', () => {
    expect(parsePlan('{broken')).toBeNull()
  })

  it('rejects unknown schema version', () => {
    const plan = { ...createDefaultPlan(), version: 2 }
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects out-of-range apartment dimensions', () => {
    const plan = createDefaultPlan()
    plan.apartment.width = 500
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects degenerate (zero-area) polygons', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Broken',
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      color: '#8ecae6',
    })
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects bad color strings', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Bad color',
      polygon: rectToPolygon({ x: 0, y: 0, width: 1, height: 1 }),
      color: 'blue',
    })
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/serialization.test.ts`
Expected: FAIL — cannot resolve `./serialization`.

- [ ] **Step 3: Implement serialization**

`src/model/serialization.ts`:

```ts
import { z } from 'zod'
import { polygonArea } from './geometry'
import type { Plan } from './types'

const vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() })

export const planSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string(),
  apartment: z.object({
    width: z.number().min(1).max(100),
    depth: z.number().min(1).max(100),
    wallHeight: z.number().min(2).max(5),
  }),
  rooms: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      polygon: z
        .array(vec2Schema)
        .min(3)
        .refine((poly) => polygonArea(poly) > 0, { message: 'degenerate polygon' }),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
  ),
})

export function createDefaultPlan(): Plan {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: 'My apartment',
    apartment: { width: 10, depth: 8, wallHeight: 2.7 },
    rooms: [],
  }
}

export function serializePlan(plan: Plan): string {
  return JSON.stringify(plan, null, 2)
}

export function parsePlan(json: string): Plan | null {
  try {
    const result = planSchema.safeParse(JSON.parse(json))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/model/serialization.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "feat: plan zod schema, serialization, default plan"
```

---

### Task 4: Zustand plan store

**Files:**
- Create: `src/store/planStore.ts`
- Test: `src/store/planStore.test.ts`

**Interfaces:**
- Consumes: `createDefaultPlan` from `../model/serialization`; geometry helpers; types.
- Produces `usePlanStore` (zustand hook) with state `{ plan: Plan, selectedRoomId: string | null, mode: Mode }` and actions:
  - `setMode(mode: Mode): void`
  - `selectRoom(id: string | null): void`
  - `setApartment(patch: Partial<Apartment>): void` — clamps to spec ranges, rounds to cm
  - `addRoom(): string` — adds a 3×3 room centered in the apartment, cycles palette colors, names it `Room N`, selects it, returns its id
  - `updateRoomRect(id: string, rect: Rect): void` — rounds to cm, enforces `MIN_ROOM_SIZE`, rejects degenerate results
  - `renameRoom(id: string, name: string): void`
  - `setRoomColor(id: string, color: string): void`
  - `deleteRoom(id: string): void` — clears selection if it pointed at the deleted room
  - `loadPlan(plan: Plan): void` — replaces plan, clears selection
- Test files of later tasks reset the store with `usePlanStore.setState({ plan: createDefaultPlan(), selectedRoomId: null, mode: '2d' })` in `beforeEach`.

- [ ] **Step 1: Write the failing tests**

`src/store/planStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { polygonToRect } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import { usePlanStore } from './planStore'

beforeEach(() => {
  usePlanStore.setState({ plan: createDefaultPlan(), selectedRoomId: null, mode: '2d' })
})

describe('addRoom', () => {
  it('adds a 3x3 room centered in the apartment and selects it', () => {
    const id = usePlanStore.getState().addRoom()
    const s = usePlanStore.getState()
    expect(s.plan.rooms).toHaveLength(1)
    expect(s.selectedRoomId).toBe(id)
    expect(s.plan.rooms[0].name).toBe('Room 1')
    const rect = polygonToRect(s.plan.rooms[0].polygon)
    expect(rect).toEqual({ x: 3.5, y: 2.5, width: 3, height: 3 })
  })
})

describe('updateRoomRect', () => {
  it('rounds to cm and enforces the minimum size', () => {
    const id = usePlanStore.getState().addRoom()
    usePlanStore.getState().updateRoomRect(id, { x: 1.2345, y: 2, width: 0.2, height: 3.456 })
    const rect = polygonToRect(usePlanStore.getState().plan.rooms[0].polygon)
    expect(rect).toEqual({ x: 1.23, y: 2, width: 0.5, height: 3.46 })
  })
})

describe('setApartment', () => {
  it('clamps dimensions to spec ranges and keeps unset fields', () => {
    usePlanStore.getState().setApartment({ width: 500, wallHeight: 1 })
    const a = usePlanStore.getState().plan.apartment
    expect(a).toEqual({ width: 100, depth: 8, wallHeight: 2 })
  })
})

describe('renameRoom / setRoomColor', () => {
  it('updates name and color of the targeted room only', () => {
    const id1 = usePlanStore.getState().addRoom()
    const id2 = usePlanStore.getState().addRoom()
    usePlanStore.getState().renameRoom(id1, 'Bedroom')
    usePlanStore.getState().setRoomColor(id2, '#123456')
    const rooms = usePlanStore.getState().plan.rooms
    expect(rooms.find((r) => r.id === id1)?.name).toBe('Bedroom')
    expect(rooms.find((r) => r.id === id2)?.color).toBe('#123456')
    expect(rooms.find((r) => r.id === id2)?.name).toBe('Room 2')
  })
})

describe('deleteRoom', () => {
  it('removes the room and clears its selection', () => {
    const id = usePlanStore.getState().addRoom()
    usePlanStore.getState().deleteRoom(id)
    const s = usePlanStore.getState()
    expect(s.plan.rooms).toHaveLength(0)
    expect(s.selectedRoomId).toBeNull()
  })
})

describe('loadPlan / setMode / selectRoom', () => {
  it('replaces the plan and clears selection', () => {
    usePlanStore.getState().addRoom()
    const fresh = createDefaultPlan()
    usePlanStore.getState().loadPlan(fresh)
    const s = usePlanStore.getState()
    expect(s.plan).toEqual(fresh)
    expect(s.selectedRoomId).toBeNull()
  })

  it('switches mode', () => {
    usePlanStore.getState().setMode('3d')
    expect(usePlanStore.getState().mode).toBe('3d')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/planStore.test.ts`
Expected: FAIL — cannot resolve `./planStore`.

- [ ] **Step 3: Implement the store**

`src/store/planStore.ts`:

```ts
import { create } from 'zustand'
import { MIN_ROOM_SIZE, polygonArea, rectToPolygon, roundCm } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { Apartment, Mode, Plan, Rect } from '../model/types'

const ROOM_COLORS = ['#8ecae6', '#ffb703', '#90be6d', '#f4a7b9', '#bdb2ff', '#f9c74f']

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export interface PlanState {
  plan: Plan
  selectedRoomId: string | null
  mode: Mode
  setMode: (mode: Mode) => void
  selectRoom: (id: string | null) => void
  setApartment: (patch: Partial<Apartment>) => void
  addRoom: () => string
  updateRoomRect: (id: string, rect: Rect) => void
  renameRoom: (id: string, name: string) => void
  setRoomColor: (id: string, color: string) => void
  deleteRoom: (id: string) => void
  loadPlan: (plan: Plan) => void
}

export const usePlanStore = create<PlanState>((set) => ({
  plan: createDefaultPlan(),
  selectedRoomId: null,
  mode: '2d',

  setMode: (mode) => set({ mode }),

  selectRoom: (selectedRoomId) => set({ selectedRoomId }),

  setApartment: (patch) =>
    set((s) => {
      const a = { ...s.plan.apartment, ...patch }
      const apartment: Apartment = {
        width: roundCm(clamp(a.width, 1, 100)),
        depth: roundCm(clamp(a.depth, 1, 100)),
        wallHeight: roundCm(clamp(a.wallHeight, 2, 5)),
      }
      return { plan: { ...s.plan, apartment } }
    }),

  addRoom: () => {
    const id = crypto.randomUUID()
    set((s) => {
      const { width, depth } = s.plan.apartment
      const rect: Rect = {
        x: roundCm(width / 2 - 1.5),
        y: roundCm(depth / 2 - 1.5),
        width: 3,
        height: 3,
      }
      const room = {
        id,
        name: `Room ${s.plan.rooms.length + 1}`,
        polygon: rectToPolygon(rect),
        color: ROOM_COLORS[s.plan.rooms.length % ROOM_COLORS.length],
      }
      return { plan: { ...s.plan, rooms: [...s.plan.rooms, room] }, selectedRoomId: id }
    })
    return id
  },

  updateRoomRect: (id, rect) =>
    set((s) => {
      const clamped: Rect = {
        x: roundCm(rect.x),
        y: roundCm(rect.y),
        width: roundCm(Math.max(MIN_ROOM_SIZE, rect.width)),
        height: roundCm(Math.max(MIN_ROOM_SIZE, rect.height)),
      }
      const polygon = rectToPolygon(clamped)
      if (polygonArea(polygon) === 0) return s
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.map((r) => (r.id === id ? { ...r, polygon } : r)),
        },
      }
    }),

  renameRoom: (id, name) =>
    set((s) => ({
      plan: { ...s.plan, rooms: s.plan.rooms.map((r) => (r.id === id ? { ...r, name } : r)) },
    })),

  setRoomColor: (id, color) =>
    set((s) => ({
      plan: { ...s.plan, rooms: s.plan.rooms.map((r) => (r.id === id ? { ...r, color } : r)) },
    })),

  deleteRoom: (id) =>
    set((s) => ({
      plan: { ...s.plan, rooms: s.plan.rooms.filter((r) => r.id !== id) },
      selectedRoomId: s.selectedRoomId === id ? null : s.selectedRoomId,
    })),

  loadPlan: (plan) => set({ plan, selectedRoomId: null }),
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/planStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat: zustand plan store with clamped actions"
```

---

### Task 5: Snapping engine

**Files:**
- Create: `src/model/snapping.ts`
- Test: `src/model/snapping.test.ts`

**Interfaces:**
- Consumes: `Rect`, `Apartment` from `./types`; `roundCm` from `./geometry`.
- Produces:
  - `interface SnapLines { xs: number[]; ys: number[] }`
  - `interface SnapGuide { axis: 'x' | 'y'; position: number }`
  - `interface SnapOptions { gridStep: number; gridThreshold: number; edgeThreshold: number }` (all in meters)
  - `interface ScalarSnap { value: number; guide: number | null }`
  - `interface MoveSnap { x: number; y: number; guides: SnapGuide[] }`
  - `collectSnapLines(others: Rect[], apartment: Apartment): SnapLines` — apartment boundary (0 and width/depth) plus both edges of every rect
  - `snapScalar(value: number, candidates: number[], opts: SnapOptions): ScalarSnap` — nearest candidate within `edgeThreshold` wins (returns it as `guide`); otherwise grid line within `gridThreshold` (guide null); otherwise `roundCm(value)` unchanged
  - `snapMove(rect: Rect, lines: SnapLines, opts: SnapOptions): MoveSnap` — per axis, tries snapping the leading and trailing edge; an edge snap beats a grid snap, smaller correction wins between two edge snaps

- [ ] **Step 1: Write the failing tests**

`src/model/snapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { collectSnapLines, snapMove, snapScalar } from './snapping'

const opts = { gridStep: 0.1, gridThreshold: 0.05, edgeThreshold: 0.08 }
const apartment = { width: 10, depth: 8, wallHeight: 2.7 }

describe('collectSnapLines', () => {
  it('includes apartment boundary and all rect edges', () => {
    const lines = collectSnapLines([{ x: 1, y: 2, width: 3, height: 2 }], apartment)
    expect(lines.xs).toEqual([0, 10, 1, 4])
    expect(lines.ys).toEqual([0, 8, 2, 4])
  })
})

describe('snapScalar', () => {
  it('snaps to the nearest candidate within edge threshold', () => {
    expect(snapScalar(2.03, [2, 5], opts)).toEqual({ value: 2, guide: 2 })
  })

  it('prefers an edge snap over a closer grid line', () => {
    expect(snapScalar(2.04, [2.08], opts)).toEqual({ value: 2.08, guide: 2.08 })
  })

  it('falls back to the grid when no candidate is close', () => {
    expect(snapScalar(2.52, [5], opts)).toEqual({ value: 2.5, guide: null })
  })

  it('leaves the value un-snapped (cm-rounded) outside both thresholds', () => {
    const tight = { gridStep: 0.1, gridThreshold: 0.02, edgeThreshold: 0.05 }
    expect(snapScalar(2.555, [5], tight)).toEqual({ value: 2.56, guide: null })
  })
})

describe('snapMove', () => {
  it('snaps the leading edge to a neighbouring room edge and reports a guide', () => {
    const lines = collectSnapLines([{ x: 0, y: 0, width: 2, height: 2 }], apartment)
    const res = snapMove({ x: 2.05, y: 5.32, width: 3, height: 2 }, lines, opts)
    expect(res.x).toBe(2)
    expect(res.guides).toContainEqual({ axis: 'x', position: 2 })
  })

  it('snaps the trailing edge when it is the one near a line', () => {
    const lines = collectSnapLines([], apartment)
    const res = snapMove({ x: 6.97, y: 3.33, width: 3, height: 2 }, lines, opts)
    expect(res.x).toBe(7)
    expect(res.guides).toContainEqual({ axis: 'x', position: 10 })
  })

  it('grid-snaps without guides when no edge is near', () => {
    const res = snapMove({ x: 5.02, y: 3.48, width: 1, height: 1 }, { xs: [], ys: [] }, opts)
    expect(res).toEqual({ x: 5, y: 3.5, guides: [] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/snapping.test.ts`
Expected: FAIL — cannot resolve `./snapping`.

- [ ] **Step 3: Implement snapping**

`src/model/snapping.ts`:

```ts
import { roundCm } from './geometry'
import type { Apartment, Rect } from './types'

export interface SnapLines {
  xs: number[]
  ys: number[]
}

export interface SnapGuide {
  axis: 'x' | 'y'
  position: number
}

export interface SnapOptions {
  gridStep: number
  gridThreshold: number
  edgeThreshold: number
}

export interface ScalarSnap {
  value: number
  guide: number | null
}

export interface MoveSnap {
  x: number
  y: number
  guides: SnapGuide[]
}

export function collectSnapLines(others: Rect[], apartment: Apartment): SnapLines {
  const xs = [0, apartment.width]
  const ys = [0, apartment.depth]
  for (const r of others) {
    xs.push(r.x, r.x + r.width)
    ys.push(r.y, r.y + r.height)
  }
  return { xs, ys }
}

export function snapScalar(value: number, candidates: number[], opts: SnapOptions): ScalarSnap {
  let best: number | null = null
  let bestDist = opts.edgeThreshold
  for (const c of candidates) {
    const d = Math.abs(value - c)
    if (d <= bestDist) {
      best = c
      bestDist = d
    }
  }
  if (best !== null) return { value: best, guide: best }

  const grid = Math.round(value / opts.gridStep) * opts.gridStep
  if (Math.abs(value - grid) <= opts.gridThreshold) return { value: roundCm(grid), guide: null }

  return { value: roundCm(value), guide: null }
}

function bestAxisSnap(
  start: number,
  size: number,
  candidates: number[],
  opts: SnapOptions,
): { pos: number; guide: number | null } {
  const leading = snapScalar(start, candidates, opts)
  const trailing = snapScalar(start + size, candidates, opts)
  const leadingDist = Math.abs(leading.value - start)
  const trailingDist = Math.abs(trailing.value - (start + size))

  if (leading.guide !== null && (trailing.guide === null || leadingDist <= trailingDist)) {
    return { pos: leading.value, guide: leading.guide }
  }
  if (trailing.guide !== null) {
    return { pos: roundCm(trailing.value - size), guide: trailing.guide }
  }
  return { pos: leading.value, guide: null }
}

export function snapMove(rect: Rect, lines: SnapLines, opts: SnapOptions): MoveSnap {
  const x = bestAxisSnap(rect.x, rect.width, lines.xs, opts)
  const y = bestAxisSnap(rect.y, rect.height, lines.ys, opts)
  const guides: SnapGuide[] = []
  if (x.guide !== null) guides.push({ axis: 'x', position: x.guide })
  if (y.guide !== null) guides.push({ axis: 'y', position: y.guide })
  return { x: x.pos, y: y.pos, guides }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/model/snapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "feat: snapping engine (edge beats grid, guides)"
```

---

### Task 6: Persistence helpers

**Files:**
- Create: `src/store/persistence.ts`
- Test: `src/store/persistence.test.ts`

**Interfaces:**
- Consumes: `createDefaultPlan`, `parsePlan`, `serializePlan` from `../model/serialization`; `usePlanStore` from `./planStore`.
- Produces:
  - `STORAGE_KEY = 'home-plan.plan'`, `BACKUP_KEY = 'home-plan.backup'`
  - `loadFromStorage(storage: Storage): { plan: Plan; recovered: boolean }` — empty storage → default plan, `recovered: false`; corrupt payload → copy raw payload to `BACKUP_KEY`, return default plan with `recovered: true`
  - `startAutosave(storage: Storage, debounceMs = 500): () => void` — subscribes to `usePlanStore`, writes `serializePlan(plan)` to `STORAGE_KEY` debounced; only reacts to `plan` reference changes; returns an unsubscribe/cleanup function
- Wiring into `main.tsx` happens in Task 15, not here.

- [ ] **Step 1: Write the failing tests**

`src/store/persistence.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultPlan, serializePlan } from '../model/serialization'
import { usePlanStore } from './planStore'
import { BACKUP_KEY, loadFromStorage, startAutosave, STORAGE_KEY } from './persistence'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as Storage
}

beforeEach(() => {
  usePlanStore.setState({ plan: createDefaultPlan(), selectedRoomId: null, mode: '2d' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loadFromStorage', () => {
  it('returns a default plan when storage is empty', () => {
    const res = loadFromStorage(memoryStorage())
    expect(res.recovered).toBe(false)
    expect(res.plan.rooms).toEqual([])
  })

  it('loads a stored valid plan', () => {
    const storage = memoryStorage()
    const plan = createDefaultPlan()
    storage.setItem(STORAGE_KEY, serializePlan(plan))
    expect(loadFromStorage(storage)).toEqual({ plan, recovered: false })
  })

  it('backs up corrupt data and recovers with a fresh plan', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, '{broken')
    const res = loadFromStorage(storage)
    expect(res.recovered).toBe(true)
    expect(res.plan.rooms).toEqual([])
    expect(storage.getItem(BACKUP_KEY)).toBe('{broken')
  })
})

describe('startAutosave', () => {
  it('saves plan changes after the debounce interval', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const stop = startAutosave(storage, 500)

    usePlanStore.getState().addRoom()
    expect(storage.getItem(STORAGE_KEY)).toBeNull()

    vi.advanceTimersByTime(500)
    expect(storage.getItem(STORAGE_KEY)).toContain('"Room 1"')
    stop()
  })

  it('ignores non-plan state changes', () => {
    vi.useFakeTimers()
    const storage = memoryStorage()
    const stop = startAutosave(storage, 500)

    usePlanStore.getState().setMode('3d')
    vi.advanceTimersByTime(1000)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
    stop()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/persistence.test.ts`
Expected: FAIL — cannot resolve `./persistence`.

- [ ] **Step 3: Implement persistence**

`src/store/persistence.ts`:

```ts
import { createDefaultPlan, parsePlan, serializePlan } from '../model/serialization'
import type { Plan } from '../model/types'
import { usePlanStore } from './planStore'

export const STORAGE_KEY = 'home-plan.plan'
export const BACKUP_KEY = 'home-plan.backup'

export interface LoadResult {
  plan: Plan
  recovered: boolean
}

export function loadFromStorage(storage: Storage): LoadResult {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return { plan: createDefaultPlan(), recovered: false }

  const plan = parsePlan(raw)
  if (plan) return { plan, recovered: false }

  storage.setItem(BACKUP_KEY, raw)
  return { plan: createDefaultPlan(), recovered: true }
}

export function startAutosave(storage: Storage, debounceMs = 500): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const unsubscribe = usePlanStore.subscribe((state, prev) => {
    if (state.plan === prev.plan) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      storage.setItem(STORAGE_KEY, serializePlan(usePlanStore.getState().plan))
    }, debounceMs)
  })

  return () => {
    clearTimeout(timer)
    unsubscribe()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat: localStorage persistence with backup recovery and debounced autosave"
```

---

### Task 7: UI shell — toolbar, properties panel, layout

**Files:**
- Modify: `src/ui/App.tsx` (replace), `src/ui/app.css` (replace), `src/ui/App.test.tsx` (replace)
- Create: `src/ui/Toolbar.tsx`, `src/ui/PropertiesPanel.tsx`, `src/ui/NumberField.tsx`

**Interfaces:**
- Consumes: `usePlanStore` actions; `polygonToRect` from `../model/geometry`.
- Produces:
  - `App` (default export) — layout: `Toolbar` on top; main row = canvas area + `PropertiesPanel`. Canvas area renders `<div data-testid="canvas-2d" />` when mode is `'2d'` and `<div data-testid="canvas-3d" />` when `'3d'` (placeholders replaced in Tasks 8 and 14).
  - `Toolbar` (named export) — `2D | 3D` mode toggle buttons + `+ Add room` button.
  - `PropertiesPanel` (named export) — apartment fields when nothing selected; room fields (Name, X/Y/Width/Height, Color, Delete) when a room is selected.
  - `NumberField` (named export) — `{ label: string; value: number; onCommit: (v: number) => void }`; commits on blur/Enter; non-numeric input reverts to the last store value.

- [ ] **Step 1: Write the failing tests**

Replace `src/ui/App.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { createDefaultPlan } from '../model/serialization'
import { usePlanStore } from '../store/planStore'
import App from './App'

beforeEach(() => {
  usePlanStore.setState({ plan: createDefaultPlan(), selectedRoomId: null, mode: '2d' })
})

it('renders the app title', () => {
  render(<App />)
  expect(screen.getByText('Home Plan')).toBeInTheDocument()
})

it('toggles between 2D and 3D canvas areas', () => {
  render(<App />)
  expect(screen.getByTestId('canvas-2d')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '3D' }))
  expect(screen.getByTestId('canvas-3d')).toBeInTheDocument()
})

it('adds a room from the toolbar and edits its name in the panel', () => {
  render(<App />)
  fireEvent.click(screen.getByText('+ Add room'))
  const nameInput = screen.getByLabelText('Name')
  fireEvent.change(nameInput, { target: { value: 'Bedroom' } })
  expect(usePlanStore.getState().plan.rooms[0].name).toBe('Bedroom')
})

it('shows apartment fields when nothing is selected and clamps on commit', () => {
  render(<App />)
  const width = screen.getByLabelText('Width (m)')
  fireEvent.change(width, { target: { value: '500' } })
  fireEvent.blur(width)
  expect(usePlanStore.getState().plan.apartment.width).toBe(100)
})

it('updates room geometry from the panel', () => {
  render(<App />)
  fireEvent.click(screen.getByText('+ Add room'))
  const widthField = screen.getByLabelText('Width (m)')
  fireEvent.change(widthField, { target: { value: '4.5' } })
  fireEvent.blur(widthField)
  const { polygon } = usePlanStore.getState().plan.rooms[0]
  expect(Math.max(...polygon.map((p) => p.x)) - Math.min(...polygon.map((p) => p.x))).toBe(4.5)
})

it('deletes the selected room from the panel', () => {
  render(<App />)
  fireEvent.click(screen.getByText('+ Add room'))
  fireEvent.click(screen.getByText('Delete room'))
  expect(usePlanStore.getState().plan.rooms).toHaveLength(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL — toolbar/panel elements not found.

- [ ] **Step 3: Implement the UI shell**

`src/ui/NumberField.tsx`:

```tsx
import { useEffect, useState } from 'react'

interface Props {
  label: string
  value: number
  onCommit: (v: number) => void
}

export function NumberField({ label, value, onCommit }: Props) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = () => {
    const n = Number(text)
    if (Number.isFinite(n)) onCommit(n)
    else setText(String(value))
  }

  return (
    <label className="field">
      {label}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </label>
  )
}
```

`src/ui/Toolbar.tsx`:

```tsx
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
```

`src/ui/PropertiesPanel.tsx`:

```tsx
import { polygonToRect } from '../model/geometry'
import type { Apartment, Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { NumberField } from './NumberField'

export function PropertiesPanel() {
  const plan = usePlanStore((s) => s.plan)
  const selectedRoomId = usePlanStore((s) => s.selectedRoomId)
  const room = plan.rooms.find((r) => r.id === selectedRoomId)

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
```

Replace `src/ui/App.tsx`:

```tsx
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
```

Replace `src/ui/app.css`:

```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; font-family: system-ui, sans-serif; }

.app { display: flex; flex-direction: column; height: 100%; }
.toolbar {
  display: flex; gap: 12px; align-items: center;
  padding: 8px 12px; border-bottom: 1px solid #dde1e6;
}
.toolbar button {
  padding: 6px 12px; border: 1px solid #c7ccd4; border-radius: 6px;
  background: #fff; cursor: pointer;
}
.mode-toggle { display: flex; gap: 0; }
.mode-toggle button { border-radius: 0; }
.mode-toggle button:first-child { border-radius: 6px 0 0 6px; }
.mode-toggle button:last-child { border-radius: 0 6px 6px 0; }
.mode-toggle button.active { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }

.main { display: flex; flex: 1; min-height: 0; }
.canvas-area { flex: 1; position: relative; min-width: 0; }
.panel { width: 260px; border-left: 1px solid #dde1e6; padding: 12px; overflow-y: auto; }
.panel h3 { margin-top: 0; }
.panel button { padding: 6px 12px; border: 1px solid #c7ccd4; border-radius: 6px; background: #fff; cursor: pointer; }

.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 13px; }
.field input { padding: 6px 8px; border: 1px solid #c7ccd4; border-radius: 6px; font-size: 13px; }

.toast {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: #1f2430; color: #fff; padding: 10px 16px; border-radius: 8px; z-index: 10;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Verify manually**

Run: `npm run dev` — add a room, edit its name/size in the panel, toggle 2D/3D (placeholders swap), confirm width input `500` clamps to `100`. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat: UI shell with toolbar and properties panel"
```

---

### Task 8: 2D viewport math + Pixi canvas (grid, boundary, pan/zoom)

**Files:**
- Create: `src/editor2d/viewport.ts`, `src/editor2d/render.ts`, `src/editor2d/Editor2D.tsx`
- Modify: `src/ui/App.tsx` (mount `Editor2D` for 2D mode), `src/ui/App.test.tsx` (mock `Editor2D` — jsdom has no WebGL)
- Test: `src/editor2d/viewport.test.ts`

**Interfaces:**
- Consumes: `usePlanStore`; `Apartment`, `Vec2` types.
- Produces:
  - `interface Viewport { offsetX: number; offsetY: number; scale: number }` — `scale` is px per meter
  - `worldToScreen(v: Viewport, p: Vec2): Vec2`, `screenToWorld(v: Viewport, p: Vec2): Vec2`
  - `zoomAt(v: Viewport, screenPoint: Vec2, factor: number, min = 5, max = 400): Viewport` — anchor point stays fixed
  - `fitApartment(canvasWidth: number, canvasHeight: number, apartment: Apartment, padding = 60): Viewport`
  - `render.ts`: `drawGrid(g: Graphics, viewport: Viewport, screenW: number, screenH: number)`, `drawBoundary(g: Graphics, viewport: Viewport, apartment: Apartment)`
  - `Editor2D` (named export) — Pixi canvas filling its parent; later tasks extend this file.

- [ ] **Step 1: Write the failing viewport tests**

`src/editor2d/viewport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitApartment, screenToWorld, worldToScreen, zoomAt } from './viewport'

describe('worldToScreen / screenToWorld', () => {
  it('round-trips a point', () => {
    const v = { offsetX: 50, offsetY: 20, scale: 80 }
    const p = screenToWorld(v, worldToScreen(v, { x: 3.2, y: 1.5 }))
    expect(p.x).toBeCloseTo(3.2)
    expect(p.y).toBeCloseTo(1.5)
  })

  it('maps world origin to the viewport offset', () => {
    const v = { offsetX: 100, offsetY: 40, scale: 50 }
    expect(worldToScreen(v, { x: 0, y: 0 })).toEqual({ x: 100, y: 40 })
  })
})

describe('zoomAt', () => {
  it('keeps the anchor point fixed in world space', () => {
    const v = { offsetX: 0, offsetY: 0, scale: 100 }
    const anchor = { x: 200, y: 150 }
    const before = screenToWorld(v, anchor)
    const after = screenToWorld(zoomAt(v, anchor, 1.25), anchor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps scale to min/max', () => {
    const v = { offsetX: 0, offsetY: 0, scale: 100 }
    expect(zoomAt(v, { x: 0, y: 0 }, 100).scale).toBe(400)
    expect(zoomAt(v, { x: 0, y: 0 }, 0.0001).scale).toBe(5)
  })
})

describe('fitApartment', () => {
  it('fits and centers the apartment with padding', () => {
    const v = fitApartment(1000, 800, { width: 10, depth: 8, wallHeight: 2.7 })
    expect(v.scale).toBe(85)
    expect(v.offsetX).toBe(75)
    expect(v.offsetY).toBe(60)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor2d/viewport.test.ts`
Expected: FAIL — cannot resolve `./viewport`.

- [ ] **Step 3: Implement viewport math**

`src/editor2d/viewport.ts`:

```ts
import type { Apartment, Vec2 } from '../model/types'

export interface Viewport {
  offsetX: number
  offsetY: number
  scale: number
}

export function worldToScreen(v: Viewport, p: Vec2): Vec2 {
  return { x: p.x * v.scale + v.offsetX, y: p.y * v.scale + v.offsetY }
}

export function screenToWorld(v: Viewport, p: Vec2): Vec2 {
  return { x: (p.x - v.offsetX) / v.scale, y: (p.y - v.offsetY) / v.scale }
}

export function zoomAt(v: Viewport, screenPoint: Vec2, factor: number, min = 5, max = 400): Viewport {
  const scale = Math.min(max, Math.max(min, v.scale * factor))
  const k = scale / v.scale
  return {
    scale,
    offsetX: screenPoint.x - (screenPoint.x - v.offsetX) * k,
    offsetY: screenPoint.y - (screenPoint.y - v.offsetY) * k,
  }
}

export function fitApartment(
  canvasWidth: number,
  canvasHeight: number,
  apartment: Apartment,
  padding = 60,
): Viewport {
  const scale = Math.min(
    (canvasWidth - padding * 2) / apartment.width,
    (canvasHeight - padding * 2) / apartment.depth,
  )
  return {
    scale,
    offsetX: (canvasWidth - apartment.width * scale) / 2,
    offsetY: (canvasHeight - apartment.depth * scale) / 2,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/editor2d/viewport.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement grid/boundary rendering**

`src/editor2d/render.ts`:

```ts
import { Graphics } from 'pixi.js'
import type { Apartment } from '../model/types'
import { screenToWorld, worldToScreen, type Viewport } from './viewport'

const isMajor = (v: number) => Math.abs(v - Math.round(v)) < 1e-6

export function drawGrid(g: Graphics, viewport: Viewport, screenW: number, screenH: number) {
  g.clear()
  const topLeft = screenToWorld(viewport, { x: 0, y: 0 })
  const bottomRight = screenToWorld(viewport, { x: screenW, y: screenH })

  // minor lines every 0.1 m, hidden when zoomed out
  if (viewport.scale > 40) {
    const step = 0.1
    for (let x = Math.floor(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
      if (isMajor(x)) continue
      const sx = worldToScreen(viewport, { x, y: 0 }).x
      g.moveTo(sx, 0).lineTo(sx, screenH)
    }
    for (let y = Math.floor(topLeft.y / step) * step; y <= bottomRight.y; y += step) {
      if (isMajor(y)) continue
      const sy = worldToScreen(viewport, { x: 0, y }).y
      g.moveTo(0, sy).lineTo(screenW, sy)
    }
    g.stroke({ width: 1, color: 0xe8eaee })
  }

  // major lines every 1 m
  for (let x = Math.floor(topLeft.x); x <= bottomRight.x; x += 1) {
    const sx = worldToScreen(viewport, { x, y: 0 }).x
    g.moveTo(sx, 0).lineTo(sx, screenH)
  }
  for (let y = Math.floor(topLeft.y); y <= bottomRight.y; y += 1) {
    const sy = worldToScreen(viewport, { x: 0, y }).y
    g.moveTo(0, sy).lineTo(screenW, sy)
  }
  g.stroke({ width: 1, color: 0xd0d4d9 })
}

export function drawBoundary(g: Graphics, viewport: Viewport, apartment: Apartment) {
  g.clear()
  const tl = worldToScreen(viewport, { x: 0, y: 0 })
  g.rect(tl.x, tl.y, apartment.width * viewport.scale, apartment.depth * viewport.scale).stroke({
    width: 3,
    color: 0x2b2f36,
  })
}
```

- [ ] **Step 6: Implement the Editor2D component**

`src/editor2d/Editor2D.tsx`:

```tsx
import { Application, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { usePlanStore } from '../store/planStore'
import { drawBoundary, drawGrid } from './render'
import { fitApartment, zoomAt, type Viewport } from './viewport'

function isTypingTarget(ev: KeyboardEvent) {
  const t = ev.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
}

export function Editor2D() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current!
    const app = new Application()
    let destroyed = false
    const cleanups: Array<() => void> = []

    app.init({ resizeTo: host, antialias: true, background: '#f7f8fa' }).then(() => {
      if (destroyed) {
        app.destroy(true)
        return
      }
      host.appendChild(app.canvas)

      const layers = {
        grid: new Graphics(),
        boundary: new Graphics(),
      }
      app.stage.addChild(layers.grid, layers.boundary)

      let viewport: Viewport = fitApartment(
        app.screen.width,
        app.screen.height,
        usePlanStore.getState().plan.apartment,
      )
      let dirty = true
      const markDirty = () => {
        dirty = true
      }

      cleanups.push(usePlanStore.subscribe(markDirty))
      app.renderer.on('resize', markDirty)

      let panning: { lastX: number; lastY: number } | null = null
      let spaceDown = false

      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen

      app.stage.on('pointerdown', (e) => {
        if (e.button === 1 || spaceDown) {
          panning = { lastX: e.global.x, lastY: e.global.y }
        }
      })

      app.stage.on('pointermove', (e) => {
        if (!panning) return
        viewport = {
          ...viewport,
          offsetX: viewport.offsetX + e.global.x - panning.lastX,
          offsetY: viewport.offsetY + e.global.y - panning.lastY,
        }
        panning = { lastX: e.global.x, lastY: e.global.y }
        markDirty()
      })

      const endPan = () => {
        panning = null
      }
      app.stage.on('pointerup', endPan)
      app.stage.on('pointerupoutside', endPan)

      const onWheel = (ev: WheelEvent) => {
        ev.preventDefault()
        const bounds = app.canvas.getBoundingClientRect()
        const point = { x: ev.clientX - bounds.left, y: ev.clientY - bounds.top }
        viewport = zoomAt(viewport, point, ev.deltaY < 0 ? 1.1 : 1 / 1.1)
        markDirty()
      }
      app.canvas.addEventListener('wheel', onWheel, { passive: false })
      cleanups.push(() => app.canvas.removeEventListener('wheel', onWheel))

      const onMiddleDown = (ev: PointerEvent) => {
        if (ev.button === 1) ev.preventDefault()
      }
      app.canvas.addEventListener('pointerdown', onMiddleDown)
      cleanups.push(() => app.canvas.removeEventListener('pointerdown', onMiddleDown))

      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.code === 'Space' && !isTypingTarget(ev)) {
          spaceDown = true
          ev.preventDefault()
        }
      }
      const onKeyUp = (ev: KeyboardEvent) => {
        if (ev.code === 'Space') spaceDown = false
      }
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      cleanups.push(() => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
      })

      app.ticker.add(() => {
        if (!dirty) return
        dirty = false
        drawGrid(layers.grid, viewport, app.screen.width, app.screen.height)
        drawBoundary(layers.boundary, viewport, usePlanStore.getState().plan.apartment)
      })
    })

    return () => {
      destroyed = true
      cleanups.forEach((fn) => fn())
      if (app.renderer) app.destroy(true)
    }
  }, [])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
}
```

- [ ] **Step 7: Mount it in App and mock it in tests**

In `src/ui/App.tsx`, add the import and replace the 2D placeholder:

```tsx
import { Editor2D } from '../editor2d/Editor2D'
```

```tsx
{mode === '2d' ? <Editor2D /> : <div data-testid="canvas-3d" />}
```

In `src/ui/App.test.tsx`, add below the imports (jsdom cannot init WebGL):

```tsx
import { vi } from 'vitest'

vi.mock('../editor2d/Editor2D', () => ({
  Editor2D: () => <div data-testid="canvas-2d" />,
}))
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Verify manually**

Run: `npm run dev` — confirm: grid renders; apartment boundary visible and centered; wheel zooms toward the cursor (minor grid appears when zoomed in); space-drag and middle-drag pan. Stop the server.

- [ ] **Step 10: Commit**

```bash
git add src/editor2d src/ui
git commit -m "feat: 2D Pixi canvas with grid, boundary, pan and zoom"
```

---

### Task 9: 2D interaction helpers (pure)

**Files:**
- Create: `src/editor2d/interactions.ts`
- Test: `src/editor2d/interactions.test.ts`

**Interfaces:**
- Consumes: `Rect`, `Room`, `Vec2` types; `MIN_ROOM_SIZE`, `polygonToRect`, `rectToPolygon` from `../model/geometry`; `Viewport`, `worldToScreen` from `./viewport`.
- Produces:
  - `HANDLE_IDS = ['nw','n','ne','e','se','s','sw','w'] as const`, `type HandleId = typeof HANDLE_IDS[number]`
  - `handlePositions(rect: Rect): Record<HandleId, Vec2>` — corner + edge midpoints in world coords
  - `hitRoom(rooms: Room[], world: Vec2): string | null` — topmost = last in array wins; inclusive bounds
  - `hitHandle(rect: Rect, viewport: Viewport, screen: Vec2, radius = 8): HandleId | null` — square hit test in screen px
  - `applyResize(rect: Rect, handle: HandleId, p: Vec2): Rect` — moves the handle's edge(s) to the pointer, opposite edge anchored, clamped to `MIN_ROOM_SIZE`

- [ ] **Step 1: Write the failing tests**

`src/editor2d/interactions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import type { Room } from '../model/types'
import { applyResize, handlePositions, hitHandle, hitRoom } from './interactions'

const roomAt = (x: number, y: number, w: number, h: number, id: string): Room => ({
  id,
  name: id,
  polygon: rectToPolygon({ x, y, width: w, height: h }),
  color: '#8ecae6',
})

describe('handlePositions', () => {
  it('places corner and midpoint handles', () => {
    const pos = handlePositions({ x: 1, y: 1, width: 2, height: 1 })
    expect(pos.nw).toEqual({ x: 1, y: 1 })
    expect(pos.se).toEqual({ x: 3, y: 2 })
    expect(pos.n).toEqual({ x: 2, y: 1 })
    expect(pos.w).toEqual({ x: 1, y: 1.5 })
  })
})

describe('hitRoom', () => {
  it('returns the topmost (last) room under the point', () => {
    const rooms = [roomAt(0, 0, 4, 4, 'a'), roomAt(2, 2, 4, 4, 'b')]
    expect(hitRoom(rooms, { x: 3, y: 3 })).toBe('b')
  })

  it('returns null on empty space', () => {
    expect(hitRoom([roomAt(0, 0, 1, 1, 'a')], { x: 5, y: 5 })).toBeNull()
  })
})

describe('hitHandle', () => {
  const viewport = { offsetX: 0, offsetY: 0, scale: 100 }
  const rect = { x: 1, y: 1, width: 2, height: 1 }

  it('hits the south-east handle within radius', () => {
    expect(hitHandle(rect, viewport, { x: 305, y: 195 })).toBe('se')
  })

  it('misses when outside radius', () => {
    expect(hitHandle(rect, viewport, { x: 320, y: 220 })).toBeNull()
  })
})

describe('applyResize', () => {
  const rect = { x: 1, y: 1, width: 3, height: 2 }

  it('moves the east edge and keeps x anchored', () => {
    expect(applyResize(rect, 'e', { x: 5.5, y: 0 })).toEqual({ x: 1, y: 1, width: 4.5, height: 2 })
  })

  it('moves the west edge and keeps the right edge anchored', () => {
    expect(applyResize(rect, 'w', { x: 0.5, y: 0 })).toEqual({ x: 0.5, y: 1, width: 3.5, height: 2 })
  })

  it('clamps to minimum size against the anchored edge', () => {
    expect(applyResize(rect, 'w', { x: 9, y: 0 })).toEqual({ x: 3.5, y: 1, width: 0.5, height: 2 })
  })

  it('resizes two edges from a corner handle', () => {
    expect(applyResize(rect, 'se', { x: 5, y: 4 })).toEqual({ x: 1, y: 1, width: 4, height: 3 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor2d/interactions.test.ts`
Expected: FAIL — cannot resolve `./interactions`.

- [ ] **Step 3: Implement the helpers**

`src/editor2d/interactions.ts`:

```ts
import { MIN_ROOM_SIZE, polygonToRect } from '../model/geometry'
import type { Rect, Room, Vec2 } from '../model/types'
import { worldToScreen, type Viewport } from './viewport'

export const HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type HandleId = (typeof HANDLE_IDS)[number]

export function handlePositions(rect: Rect): Record<HandleId, Vec2> {
  const { x, y, width: w, height: h } = rect
  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
  }
}

export function hitRoom(rooms: Room[], world: Vec2): string | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const rect = polygonToRect(rooms[i].polygon)
    if (
      rect &&
      world.x >= rect.x &&
      world.x <= rect.x + rect.width &&
      world.y >= rect.y &&
      world.y <= rect.y + rect.height
    ) {
      return rooms[i].id
    }
  }
  return null
}

export function hitHandle(rect: Rect, viewport: Viewport, screen: Vec2, radius = 8): HandleId | null {
  const positions = handlePositions(rect)
  for (const id of HANDLE_IDS) {
    const s = worldToScreen(viewport, positions[id])
    if (Math.abs(s.x - screen.x) <= radius && Math.abs(s.y - screen.y) <= radius) return id
  }
  return null
}

export function applyResize(rect: Rect, handle: HandleId, p: Vec2): Rect {
  let { x, y, width, height } = rect
  const right = x + width
  const bottom = y + height

  if (handle.includes('w')) {
    const nx = Math.min(p.x, right - MIN_ROOM_SIZE)
    width = right - nx
    x = nx
  }
  if (handle.includes('e')) {
    width = Math.max(MIN_ROOM_SIZE, p.x - x)
  }
  if (handle.includes('n')) {
    const ny = Math.min(p.y, bottom - MIN_ROOM_SIZE)
    height = bottom - ny
    y = ny
  }
  if (handle.includes('s')) {
    height = Math.max(MIN_ROOM_SIZE, p.y - y)
  }
  return { x, y, width, height }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/editor2d/interactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor2d
git commit -m "feat: pure 2D interaction helpers (hit tests, handles, resize)"
```

---

### Task 10: 2D rooms — render, select, delete

**Files:**
- Modify: `src/editor2d/render.ts` (add `drawRooms`, `drawHandles`), `src/editor2d/Editor2D.tsx` (rooms/handles layers, selection, Delete key)

**Interfaces:**
- Consumes: `polygonToRect`, `rectInBounds`, `rectsOverlap` from `../model/geometry`; `handlePositions`, `hitRoom` from `./interactions`; `usePlanStore` actions `selectRoom`, `deleteRoom`.
- Produces:
  - `drawRooms(container: Container, plan: Plan, selectedId: string | null, viewport: Viewport)` — filled rect + name/dimensions label per room; warning tint `#e07a5f` when out of bounds or overlapping another room; thicker blue stroke when selected
  - `drawHandles(g: Graphics, rect: Rect | null, viewport: Viewport)` — 8 white squares with blue stroke, or clears when `rect` is null
- No new unit tests: warning/hit logic was tested in Tasks 2 and 9; this task is Pixi wiring, verified manually.

- [ ] **Step 1: Add room and handle rendering to `render.ts`**

Add to imports in `src/editor2d/render.ts`:

```ts
import { Container, Graphics, Text } from 'pixi.js'
import { polygonToRect, rectInBounds, rectsOverlap } from '../model/geometry'
import type { Apartment, Plan, Rect } from '../model/types'
import { handlePositions } from './interactions'
```

(Replace the existing `Graphics`-only pixi import and `Apartment`-only types import.)

Append to `src/editor2d/render.ts`:

```ts
const WARNING_COLOR = '#e07a5f'

export function drawRooms(container: Container, plan: Plan, selectedId: string | null, viewport: Viewport) {
  for (const child of container.removeChildren()) child.destroy(true)

  const rects = plan.rooms.map((room) => ({ room, rect: polygonToRect(room.polygon) }))

  for (const { room, rect } of rects) {
    if (!rect) continue
    const overlapping = rects.some(
      (other) => other.room.id !== room.id && other.rect && rectsOverlap(rect, other.rect),
    )
    const warning = overlapping || !rectInBounds(rect, plan.apartment)
    const selected = room.id === selectedId

    const tl = worldToScreen(viewport, { x: rect.x, y: rect.y })
    const w = rect.width * viewport.scale
    const h = rect.height * viewport.scale

    const g = new Graphics()
    g.rect(tl.x, tl.y, w, h)
      .fill({ color: warning ? WARNING_COLOR : room.color, alpha: 0.55 })
      .stroke({ width: selected ? 3 : 1.5, color: selected ? 0x1d4ed8 : 0x475069 })
    container.addChild(g)

    const label = new Text({
      text: `${room.name}\n${rect.width.toFixed(2)} × ${rect.height.toFixed(2)}`,
      style: { fontSize: 13, fill: 0x1f2430, align: 'center' },
    })
    label.anchor.set(0.5)
    label.position.set(tl.x + w / 2, tl.y + h / 2)
    container.addChild(label)
  }
}

export function drawHandles(g: Graphics, rect: Rect | null, viewport: Viewport) {
  g.clear()
  if (!rect) return
  for (const pos of Object.values(handlePositions(rect))) {
    const s = worldToScreen(viewport, pos)
    g.rect(s.x - 4, s.y - 4, 8, 8).fill({ color: 0xffffff }).stroke({ width: 1.5, color: 0x1d4ed8 })
  }
}
```

- [ ] **Step 2: Wire rooms into `Editor2D.tsx`**

Update imports:

```tsx
import { Application, Container, Graphics } from 'pixi.js'
import { polygonToRect } from '../model/geometry'
import { hitRoom } from './interactions'
import { drawBoundary, drawGrid, drawHandles, drawRooms } from './render'
import { fitApartment, screenToWorld, zoomAt, type Viewport } from './viewport'
```

Replace the `layers` block and `app.stage.addChild` line:

```tsx
const layers = {
  grid: new Graphics(),
  boundary: new Graphics(),
  rooms: new Container(),
  handles: new Graphics(),
}
app.stage.addChild(layers.grid, layers.boundary, layers.rooms, layers.handles)
```

Replace the `pointerdown` stage handler:

```tsx
app.stage.on('pointerdown', (e) => {
  if (e.button === 1 || spaceDown) {
    panning = { lastX: e.global.x, lastY: e.global.y }
    return
  }
  const store = usePlanStore.getState()
  const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
  store.selectRoom(hitRoom(store.plan.rooms, world))
})
```

Extend `onKeyDown` (same function, add before the Space branch):

```tsx
if ((ev.key === 'Delete' || ev.key === 'Backspace') && !isTypingTarget(ev)) {
  const store = usePlanStore.getState()
  if (store.selectedRoomId) store.deleteRoom(store.selectedRoomId)
  return
}
```

Replace the ticker callback:

```tsx
app.ticker.add(() => {
  if (!dirty) return
  dirty = false
  const store = usePlanStore.getState()
  drawGrid(layers.grid, viewport, app.screen.width, app.screen.height)
  drawBoundary(layers.boundary, viewport, store.plan.apartment)
  drawRooms(layers.rooms, store.plan, store.selectedRoomId, viewport)
  const selected = store.plan.rooms.find((r) => r.id === store.selectedRoomId)
  drawHandles(layers.handles, selected ? polygonToRect(selected.polygon) : null, viewport)
})
```

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: PASS (no regressions; store selection already covered).

- [ ] **Step 4: Verify manually**

Run: `npm run dev` — add two rooms; confirm: fills, labels with live dimensions; click selects (blue stroke + 8 handles), click empty space deselects; Delete removes the selected room; overlapping rooms tint red-orange; a room moved outside the boundary (via panel X input, e.g. `x = 9`) tints too. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/editor2d
git commit -m "feat: render rooms with labels, selection, warnings, delete key"
```

---

### Task 11: 2D drag-move with snapping and guides

**Files:**
- Modify: `src/editor2d/render.ts` (add `drawGuides`), `src/editor2d/Editor2D.tsx` (drag state machine, move logic)

**Interfaces:**
- Consumes: `collectSnapLines`, `snapMove`, `SnapGuide`, `SnapOptions` from `../model/snapping`; `updateRoomRect` store action.
- Produces:
  - `drawGuides(g: Graphics, guides: SnapGuide[], viewport: Viewport, screenW: number, screenH: number)` — magenta full-length lines
  - In `Editor2D.tsx` a `DragState` union used and extended by Task 12:
    `{ kind: 'idle' } | { kind: 'move'; roomId: string; grabOffset: Vec2 }` (Task 12 adds `resize`)
  - Snap thresholds: `{ gridStep: 0.1, gridThreshold: 10 / viewport.scale, edgeThreshold: 10 / viewport.scale }`; holding Alt disables snapping.

- [ ] **Step 1: Add `drawGuides` to `render.ts`**

Add `SnapGuide` to imports: `import type { SnapGuide } from '../model/snapping'`. Append:

```ts
export function drawGuides(
  g: Graphics,
  guides: SnapGuide[],
  viewport: Viewport,
  screenW: number,
  screenH: number,
) {
  g.clear()
  if (guides.length === 0) return
  for (const guide of guides) {
    if (guide.axis === 'x') {
      const sx = worldToScreen(viewport, { x: guide.position, y: 0 }).x
      g.moveTo(sx, 0).lineTo(sx, screenH)
    } else {
      const sy = worldToScreen(viewport, { x: 0, y: guide.position }).y
      g.moveTo(0, sy).lineTo(screenW, sy)
    }
  }
  g.stroke({ width: 1.5, color: 0xd946ef })
}
```

- [ ] **Step 2: Add the drag state machine to `Editor2D.tsx`**

Add imports:

```tsx
import { collectSnapLines, snapMove, type SnapGuide, type SnapOptions } from '../model/snapping'
import type { Rect, Vec2 } from '../model/types'
import { drawBoundary, drawGrid, drawGuides, drawHandles, drawRooms } from './render'
```

Add a `guides` layer:

```tsx
const layers = {
  grid: new Graphics(),
  boundary: new Graphics(),
  rooms: new Container(),
  guides: new Graphics(),
  handles: new Graphics(),
}
app.stage.addChild(layers.grid, layers.boundary, layers.rooms, layers.guides, layers.handles)
```

Add state and helpers next to `panning` (keep `panning`, `spaceDown`):

```tsx
type DragState = { kind: 'idle' } | { kind: 'move'; roomId: string; grabOffset: Vec2 }
let drag: DragState = { kind: 'idle' }
let guides: SnapGuide[] = []
let altDown = false

const snapOpts = (): SnapOptions => ({
  gridStep: 0.1,
  gridThreshold: 10 / viewport.scale,
  edgeThreshold: 10 / viewport.scale,
})

const otherRects = (excludeId: string): Rect[] =>
  usePlanStore
    .getState()
    .plan.rooms.filter((r) => r.id !== excludeId)
    .map((r) => polygonToRect(r.polygon))
    .filter((r): r is Rect => r !== null)
```

Replace the stage `pointerdown` handler:

```tsx
app.stage.on('pointerdown', (e) => {
  if (e.button === 1 || spaceDown) {
    panning = { lastX: e.global.x, lastY: e.global.y }
    return
  }
  const store = usePlanStore.getState()
  const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
  const roomId = hitRoom(store.plan.rooms, world)
  store.selectRoom(roomId)
  if (roomId) {
    const rect = polygonToRect(store.plan.rooms.find((r) => r.id === roomId)!.polygon)
    if (rect) drag = { kind: 'move', roomId, grabOffset: { x: world.x - rect.x, y: world.y - rect.y } }
  }
})
```

Extend the stage `pointermove` handler (after the `panning` branch):

```tsx
app.stage.on('pointermove', (e) => {
  if (panning) {
    viewport = {
      ...viewport,
      offsetX: viewport.offsetX + e.global.x - panning.lastX,
      offsetY: viewport.offsetY + e.global.y - panning.lastY,
    }
    panning = { lastX: e.global.x, lastY: e.global.y }
    markDirty()
    return
  }
  if (drag.kind !== 'move') return

  const store = usePlanStore.getState()
  const room = store.plan.rooms.find((r) => r.id === drag.roomId)
  const rect = room ? polygonToRect(room.polygon) : null
  if (!rect) return

  const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
  const raw: Rect = { ...rect, x: world.x - drag.grabOffset.x, y: world.y - drag.grabOffset.y }

  if (altDown) {
    guides = []
    store.updateRoomRect(drag.roomId, raw)
  } else {
    const lines = collectSnapLines(otherRects(drag.roomId), store.plan.apartment)
    const snapped = snapMove(raw, lines, snapOpts())
    guides = snapped.guides
    store.updateRoomRect(drag.roomId, { ...raw, x: snapped.x, y: snapped.y })
  }
  markDirty()
})
```

Replace `endPan` with a combined end handler:

```tsx
const endInteraction = () => {
  panning = null
  if (drag.kind !== 'idle' || guides.length > 0) {
    drag = { kind: 'idle' }
    guides = []
    markDirty()
  }
}
app.stage.on('pointerup', endInteraction)
app.stage.on('pointerupoutside', endInteraction)
```

Track Alt in the existing key handlers (add to both `onKeyDown` and `onKeyUp`):

```tsx
altDown = ev.altKey
```

Add guides to the ticker callback (after `drawRooms`):

```tsx
drawGuides(layers.guides, guides, viewport, app.screen.width, app.screen.height)
```

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verify manually**

Run: `npm run dev` — add two rooms; confirm: dragging moves a room with the grab point preserved; magenta guides appear when an edge aligns with the other room or the boundary and the room sticks briefly; grid snap at 0.1 m; holding Alt drags freely; releasing clears guides; panel X/Y update live during drag. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/editor2d
git commit -m "feat: drag-move rooms with edge/grid snapping and guides"
```

---

### Task 12: 2D resize handles with snapping

**Files:**
- Modify: `src/editor2d/Editor2D.tsx` (resize branch in the drag state machine)

**Interfaces:**
- Consumes: `applyResize`, `hitHandle`, `HandleId` from `./interactions`; `snapScalar` from `../model/snapping`.
- Produces: complete v1 2D editing. `DragState` grows to:
  `{ kind: 'idle' } | { kind: 'move'; roomId: string; grabOffset: Vec2 } | { kind: 'resize'; roomId: string; handle: HandleId }`

- [ ] **Step 1: Extend the state machine**

Update imports:

```tsx
import { applyResize, hitHandle, hitRoom, type HandleId } from './interactions'
import { collectSnapLines, snapMove, snapScalar, type SnapGuide, type SnapOptions } from '../model/snapping'
```

Extend the `DragState` type:

```tsx
type DragState =
  | { kind: 'idle' }
  | { kind: 'move'; roomId: string; grabOffset: Vec2 }
  | { kind: 'resize'; roomId: string; handle: HandleId }
```

In the stage `pointerdown` handler, insert a handle check before the `hitRoom` call (handles win over room bodies):

```tsx
const selected = store.selectedRoomId
  ? store.plan.rooms.find((r) => r.id === store.selectedRoomId)
  : undefined
const selectedRect = selected ? polygonToRect(selected.polygon) : null
if (selected && selectedRect) {
  const handle = hitHandle(selectedRect, viewport, { x: e.global.x, y: e.global.y })
  if (handle) {
    drag = { kind: 'resize', roomId: selected.id, handle }
    return
  }
}
```

In the stage `pointermove` handler, replace `if (drag.kind !== 'move') return` with:

```tsx
if (drag.kind === 'idle') return
```

and add the resize branch after the move branch (wrap the existing move logic in `if (drag.kind === 'move') { ... }`):

```tsx
if (drag.kind === 'resize') {
  const store = usePlanStore.getState()
  const room = store.plan.rooms.find((r) => r.id === drag.roomId)
  const rect = room ? polygonToRect(room.polygon) : null
  if (!rect) return

  let point = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
  guides = []

  if (!altDown) {
    const lines = collectSnapLines(otherRects(drag.roomId), store.plan.apartment)
    const opts = snapOpts()
    if (drag.handle.includes('e') || drag.handle.includes('w')) {
      const sx = snapScalar(point.x, lines.xs, opts)
      point = { ...point, x: sx.value }
      if (sx.guide !== null) guides.push({ axis: 'x', position: sx.guide })
    }
    if (drag.handle.includes('n') || drag.handle.includes('s')) {
      const sy = snapScalar(point.y, lines.ys, opts)
      point = { ...point, y: sy.value }
      if (sy.guide !== null) guides.push({ axis: 'y', position: sy.guide })
    }
  }

  store.updateRoomRect(drag.roomId, applyResize(rect, drag.handle, point))
  markDirty()
}
```

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Verify manually**

Run: `npm run dev` — select a room; confirm: dragging edge handles resizes one axis, corner handles two; opposite edge stays anchored; a room can't shrink below 0.5 m; resizing an edge toward a neighbour's edge snaps with a magenta guide; Alt disables snapping; dimensions label updates live. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/editor2d
git commit -m "feat: resize rooms via handles with edge snapping"
```

---

### Task 13: 3D wall extrusion math

**Files:**
- Create: `src/viewer3d/walls.ts`
- Test: `src/viewer3d/walls.test.ts`

**Interfaces:**
- Consumes: `Vec2` from `../model/types`.
- Produces:
  - `WALL_THICKNESS = 0.1`
  - `interface WallSegment { center: [number, number, number]; length: number; rotationY: number }` — center is in 3D scene coords (plan x → x, plan y → z, wall vertical center → y); `length` includes `WALL_THICKNESS` overlap so corners close; a box of size `[length, wallHeight, WALL_THICKNESS]` rotated by `rotationY` renders the wall
  - `wallsForPolygon(polygon: Vec2[], wallHeight: number): WallSegment[]` — one segment per polygon edge (including closing edge)

- [ ] **Step 1: Write the failing tests**

`src/viewer3d/walls.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import { WALL_THICKNESS, wallsForPolygon } from './walls'

describe('wallsForPolygon', () => {
  const polygon = rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })

  it('produces one wall per edge', () => {
    expect(wallsForPolygon(polygon, 2.7)).toHaveLength(4)
  })

  it('centers walls on edge midpoints at half wall height', () => {
    const walls = wallsForPolygon(polygon, 2.7)
    expect(walls[0].center).toEqual([2, 1.35, 0]) // top edge (0,0)→(4,0)
    expect(walls[1].center).toEqual([4, 1.35, 1.5]) // right edge (4,0)→(4,3)
  })

  it('extends length by wall thickness to close corners', () => {
    const walls = wallsForPolygon(polygon, 2.7)
    expect(walls[0].length).toBeCloseTo(4 + WALL_THICKNESS)
    expect(walls[1].length).toBeCloseTo(3 + WALL_THICKNESS)
  })

  it('rotates walls to follow the edge direction', () => {
    const walls = wallsForPolygon(polygon, 2.7)
    expect(walls[0].rotationY).toBeCloseTo(0) // along +x
    expect(Math.abs(walls[1].rotationY)).toBeCloseTo(Math.PI / 2) // along z
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/viewer3d/walls.test.ts`
Expected: FAIL — cannot resolve `./walls`.

- [ ] **Step 3: Implement wall extrusion**

`src/viewer3d/walls.ts`:

```ts
import type { Vec2 } from '../model/types'

export const WALL_THICKNESS = 0.1

export interface WallSegment {
  center: [number, number, number]
  length: number
  rotationY: number
}

export function wallsForPolygon(polygon: Vec2[], wallHeight: number): WallSegment[] {
  const walls: WallSegment[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    walls.push({
      center: [(a.x + b.x) / 2, wallHeight / 2, (a.y + b.y) / 2],
      length: Math.hypot(dx, dy) + WALL_THICKNESS,
      rotationY: -Math.atan2(dy, dx),
    })
  }
  return walls
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/viewer3d/walls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/viewer3d
git commit -m "feat: 3D wall extrusion math"
```

---

### Task 14: 3D viewer scene

**Files:**
- Create: `src/viewer3d/Viewer3D.tsx`
- Modify: `src/ui/App.tsx` (mount `Viewer3D` for 3D mode), `src/ui/App.test.tsx` (mock `Viewer3D`)

**Interfaces:**
- Consumes: `usePlanStore` (read-only), `polygonToRect`, `wallsForPolygon`, `WALL_THICKNESS`.
- Produces: `Viewer3D` (named export) — r3f `Canvas` with ground plane, per-room floor slabs and extruded walls, ambient + directional light with shadows, `OrbitControls` clamped above the floor. Apartment is centered at the scene origin.

- [ ] **Step 1: Implement the scene**

`src/viewer3d/Viewer3D.tsx`:

```tsx
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { polygonToRect } from '../model/geometry'
import type { Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { WALL_THICKNESS, wallsForPolygon } from './walls'

export function Viewer3D() {
  const plan = usePlanStore((s) => s.plan)
  const { width, depth, wallHeight } = plan.apartment

  return (
    <Canvas
      shadows
      camera={{ position: [width * 0.7, Math.max(width, depth) * 0.9, depth * 1.4], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#e8ecef']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[width, 12, depth]} intensity={1.4} castShadow />

      <group position={[-width / 2, 0, -depth / 2]}>
        {/* ground plane, slightly below floors */}
        <mesh rotation-x={-Math.PI / 2} position={[width / 2, -0.01, depth / 2]} receiveShadow>
          <planeGeometry args={[width + 6, depth + 6]} />
          <meshStandardMaterial color="#cfd6dc" />
        </mesh>

        {plan.rooms.map((room) => (
          <RoomMesh key={room.id} room={room} wallHeight={wallHeight} />
        ))}
      </group>

      <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={80} />
    </Canvas>
  )
}

function RoomMesh({ room, wallHeight }: { room: Room; wallHeight: number }) {
  const rect = polygonToRect(room.polygon)
  return (
    <group>
      {rect && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[rect.x + rect.width / 2, 0.001, rect.y + rect.height / 2]}
          receiveShadow
        >
          <planeGeometry args={[rect.width, rect.height]} />
          <meshStandardMaterial color={room.color} />
        </mesh>
      )}
      {wallsForPolygon(room.polygon, wallHeight).map((wall, i) => (
        <mesh key={i} position={wall.center} rotation-y={wall.rotationY} castShadow receiveShadow>
          <boxGeometry args={[wall.length, wallHeight, WALL_THICKNESS]} />
          <meshStandardMaterial color="#f5f5f0" />
        </mesh>
      ))}
    </group>
  )
}
```

- [ ] **Step 2: Mount it in App and mock it in tests**

In `src/ui/App.tsx`:

```tsx
import { Viewer3D } from '../viewer3d/Viewer3D'
```

```tsx
{mode === '2d' ? <Editor2D /> : <Viewer3D />}
```

In `src/ui/App.test.tsx`, add next to the Editor2D mock:

```tsx
vi.mock('../viewer3d/Viewer3D', () => ({
  Viewer3D: () => <div data-testid="canvas-3d" />,
}))
```

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verify manually**

Run: `npm run dev` — lay out 2–3 snapped rooms in 2D, switch to 3D; confirm: tinted floors, white walls at correct positions/heights, shared edges read as one wall, closed corners; orbit/zoom/pan works and the camera can't go under the floor; switch back to 2D — layout intact. Change wall height in the panel (nothing selected) and confirm 3D walls change. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/viewer3d src/ui
git commit -m "feat: 3D viewer with extruded walls and orbit controls"
```

---

### Task 15: Persistence wiring, export/import, toast, README

**Files:**
- Create: `src/ui/toast.ts`, `README.md`
- Modify: `src/main.tsx` (load + autosave wiring), `src/ui/App.tsx` (toast display), `src/ui/Toolbar.tsx` (Export/Import buttons)
- Test: `src/ui/toast.test.ts`

**Interfaces:**
- Consumes: `loadFromStorage`, `startAutosave`, `STORAGE_KEY`, `BACKUP_KEY`; `parsePlan`, `serializePlan`; `loadPlan` store action.
- Produces:
  - `useToast` zustand hook: `{ message: string | null; show(message: string): void; clear(): void }` — `show` auto-clears after 5000 ms
  - Toolbar `Export` (downloads `<plan-name>.json`) and `Import` (hidden file input; invalid file → toast, plan untouched)
  - `main.tsx` boots from localStorage, shows a recovery toast when the stored plan was corrupt, starts autosave

- [ ] **Step 1: Write the failing toast test**

`src/ui/toast.test.ts`:

```ts
import { afterEach, expect, it, vi } from 'vitest'
import { useToast } from './toast'

afterEach(() => {
  vi.useRealTimers()
  useToast.setState({ message: null })
})

it('shows a message and auto-clears after 5 seconds', () => {
  vi.useFakeTimers()
  useToast.getState().show('Hello')
  expect(useToast.getState().message).toBe('Hello')
  vi.advanceTimersByTime(5000)
  expect(useToast.getState().message).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/toast.test.ts`
Expected: FAIL — cannot resolve `./toast`.

- [ ] **Step 3: Implement the toast store**

`src/ui/toast.ts`:

```ts
import { create } from 'zustand'

interface ToastState {
  message: string | null
  show: (message: string) => void
  clear: () => void
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    set({ message })
    setTimeout(() => set({ message: null }), 5000)
  },
  clear: () => set({ message: null }),
}))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/toast.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire boot-time persistence**

Replace `src/main.tsx`:

```tsx
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
startAutosave(localStorage)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 6: Show toasts in App**

In `src/ui/App.tsx`, add:

```tsx
import { useToast } from './toast'

function Toast() {
  const message = useToast((s) => s.message)
  if (!message) return null
  return <div className="toast">{message}</div>
}
```

and render `<Toast />` as the last child of the `.app` div.

- [ ] **Step 7: Add Export/Import to the Toolbar**

Replace `src/ui/Toolbar.tsx`:

```tsx
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
```

- [ ] **Step 8: Write the README**

`README.md`:

```markdown
# Home Plan

Plan your apartment layout in 2D, view it in 3D.

## Run

    npm install
    npm run dev

## Use

- **Apartment**: with nothing selected, set width/depth/wall height in the right panel (meters).
- **Rooms**: "+ Add room", then drag to move, drag handles to resize. Rooms snap to
  the 0.1 m grid, other rooms' edges, and the apartment boundary — hold **Alt** to
  disable snapping. **Delete** removes the selected room. Overlapping or
  out-of-bounds rooms tint orange as a warning.
- **Canvas**: mouse wheel zooms, space-drag or middle-drag pans.
- **3D**: toggle in the toolbar; drag to orbit, wheel to zoom.
- **Persistence**: autosaved to localStorage; Export/Import as JSON in the toolbar.

## Develop

    npm test        # vitest unit + component tests
    npm run build   # typecheck + production build

Design spec: `docs/superpowers/specs/2026-07-13-apartment-planner-design.md`.
```

- [ ] **Step 9: Run all tests and the production build**

Run: `npm test`
Expected: PASS (all suites).

Run: `npm run build`
Expected: builds without type errors.

- [ ] **Step 10: Full manual E2E check**

Run: `npm run dev` and walk through:
1. Fresh load (clear localStorage in devtools) → default 10×8 apartment.
2. Set apartment to your real dimensions; add and lay out 3 rooms with snapping.
3. Reload the page → layout restored (autosave).
4. Export → JSON downloads; clear localStorage, reload, Import the file → layout restored.
5. Import a nonsense `.txt`-renamed-`.json` file → toast "Invalid plan file", plan untouched.
6. In devtools, set `localStorage['home-plan.plan'] = '{broken'`, reload → recovery toast, fresh plan, `home-plan.backup` holds the broken payload.
7. Switch to 3D → walls and floors match the 2D layout.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: persistence wiring, export/import, recovery toast, README"
```

