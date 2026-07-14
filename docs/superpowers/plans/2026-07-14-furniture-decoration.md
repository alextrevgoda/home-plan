# Furniture & Decoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Placeable furniture and decor from a bundled CC0 GLTF catalog — placed, moved, rotated, wall-snapped and resized in the 2D editor with architectural symbols, rendered as real models in 3D — plus per-room floor materials and wall colors, persisted via a v3 schema.

**Architecture:** A static catalog (`src/model/catalog.ts`) describes each item type (real-world default size, size bounds, mount/layer class, model path, 2D symbol). Plans store only instances: `plan.furniture: PlacedItem[]`, a discriminated union of floor items (position + rotation) and wall items (roomId + edgeIndex + offset + elevation, reusing the openings edge-attachment scheme). Pure geometry (oriented footprints, SAT collision, wall snapping) lives in `src/model/furniture.ts`. The store stays the single writer; 2D symbols are renderer-agnostic path commands painted by Pixi and mirrored as SVG icons in the catalog panel; 3D lazy-loads GLB models with meshopt+KTX2, normalizes them at load, and scales per instance.

**Tech Stack:** unchanged runtime — Vite 5, React 18, TS 5, PixiJS 8, three 0.166 + @react-three/fiber 8 + drei 9, Zustand 5, Zod 3, Vitest 2 + Testing Library. New dev tooling: `@gltf-transform/cli` for one-time model preprocessing.

**Spec:** `docs/superpowers/specs/2026-07-14-furniture-decoration-design.md`

## Global Constraints

- Work on branch `feature/furniture-decoration` off `main`. Do NOT push during tasks (Pages auto-deploys from main); pushing happens at finish.
- Plan schema bumps to `version: 3`. `parsePlan` = parse → migrate (1→2→3) → zod validate → `normalizePlan` clamp. v2 payloads migrate by adding `furniture: []`. Unknown versions reject.
- Rotation is stored in **degrees, normalized to [0, 360)**, 0 = catalog orientation. Footprint local frame: width along +x, depth along +y, **front = +y local, back = −y local**. World rotation = standard CCW matrix `(x cosθ − y sinθ, x sinθ + y cosθ)` (plan coords, y down). 3D: `rotationY = -rotation * Math.PI / 180`; plan y maps to 3D z; model front faces +Z at rotation 0.
- Room polygon edges (from `rectToPolygon` order) have **inward normal `(-uy, ux)`** for edge unit vector `(ux, uy)`.
- Constants: `WALL_SNAP_THRESHOLD = 0.15` m; `ROTATION_SNAP_DEG = 15`; furniture wall-item hit radius 8 px; rotation handle 24 px above footprint top-center, hit radius 9 px; overlap EPS `1e-9` (touching footprints do NOT collide).
- Collision applies only between **floor-mounted items whose catalog layer is `'solid'`**. Underlay (rug) and overlay/wall items never collide. Colliding solids render `0xe07a5f`; selected `0x1d4ed8`; normal outline `0x39414f`.
- Live drags write to the store (transient collisions allowed, like overlapping rooms); the **drop rule** is enforced by the editor: on pointerup of a colliding solid, revert to the pre-drag position/rotation. `placeFurniture` rejects colliding/out-of-bounds drops outright.
- All runtime asset URLs are prefixed with `import.meta.env.BASE_URL` (Vite base is `/home-plan/` in builds).
- Model GLBs: ≤ 2.0 MB each, meshopt-compressed, KTX2 textures ≤ 1024 px, committed under `public/models/`. Floor textures: tileable 1K **JPEG** under `public/textures/floors/` (spec amended: JPEG, not KTX2, for reliable RepeatWrapping). Basis transcoder committed under `public/basis/`.
- Meters internally, cm rounding via `roundCm`; degrees rounded to 0.1 via `roundDeg(v) = Math.round(v * 10) / 10`. Store never holds an invalid plan.
- npm; run one test file with `npx vitest run <path>`; full suite `npm test`; typecheck+build `npm run build`.

---

### Task 1: Schema v3 — types, catalog module, migration, validation

**Files:**
- Modify: `src/model/types.ts`
- Create: `src/model/catalog.ts`
- Create: `src/model/catalog.test.ts`
- Modify: `src/model/serialization.ts`
- Test: `src/model/serialization.test.ts` (update + extend)

**Interfaces:**
- Consumes: existing `Plan`, `Vec2`, `roundCm`, `clampOffset`, `roomEdge`.
- Produces (used by every later task):
  - `interface Size3 { width: number; depth: number; height: number }`
  - `interface FloorItem { id: string; catalogId: string; mount: 'floor'; position: Vec2; rotation: number; size: Size3; color?: string }`
  - `interface WallItem { id: string; catalogId: string; mount: 'wall'; roomId: string; edgeIndex: number; offset: number; elevation: number; size: Size3; color?: string }`
  - `type PlacedItem = FloorItem | WallItem`
  - `Room` gains `floorMaterial?: string; wallColor?: string`
  - `Plan` gains `version: 3` and `furniture: PlacedItem[]`; `Selection['kind']` gains `'furniture'`
  - `type Category = 'bedroom' | 'living' | 'kitchen' | 'bathroom' | 'decor'`; `type Mount = 'floor' | 'wall'`; `type Layer = 'solid' | 'underlay' | 'overlay'`
  - `interface CatalogItem { id: string; name: string; category: Category; mount: Mount; layer: Layer; defaultSize: Size3; sizeBounds: { min: Size3; max: Size3 }; defaultElevation?: number; modelPath: string; symbolId: string; recolorMaterial?: string; modelRotationY?: number }`
  - `CATALOG: CatalogItem[]` (24 entries), `catalogItem(id: string): CatalogItem | undefined`
  - `interface FloorFinish { id: string; name: string; texturePath: string; tint: string }`, `FLOOR_MATERIALS: FloorFinish[]` (6 entries), `floorFinish(id: string): FloorFinish | undefined`
  - `createDefaultPlan()` returns v3 with `furniture: []`; `parsePlan` migrates v2→v3, rejects unknown `catalogId`/`floorMaterial`/room refs, and clamps sizes/positions/offsets/elevations/rotation via exported `normalizePlan(plan: Plan): Plan`
  - `normalizeDeg(d: number): number` (→ [0, 360)), `roundDeg(d: number): number` exported from `src/model/geometry.ts`

- [ ] **Step 1: Add types**

In `src/model/types.ts`: add `Size3`, `FloorItem`, `WallItem`, `PlacedItem` exactly as in Interfaces above; add `floorMaterial?: string` and `wallColor?: string` to `Room`; change `Plan` to `version: 3` plus `furniture: PlacedItem[]`; change `Selection` to `{ kind: 'room' | 'opening' | 'furniture'; id: string }`.

In `src/model/geometry.ts` add:

```ts
export function normalizeDeg(d: number): number {
  return ((d % 360) + 360) % 360
}

export function roundDeg(d: number): number {
  return Math.round(d * 10) / 10
}
```

- [ ] **Step 2: Write the catalog module**

Create `src/model/catalog.ts` with the `Category`/`Mount`/`Layer` types and `CatalogItem`/`FloorFinish` interfaces from the Interfaces block, then the data (bounds are min/max per axis; `recolorMaterial` and `modelRotationY` are filled in during Task 11):

```ts
import type { Size3 } from './types'

// … type + interface declarations from the Interfaces block …

const b = (min: Size3, max: Size3) => ({ min, max })
const s = (width: number, depth: number, height: number): Size3 => ({ width, depth, height })

export const CATALOG: CatalogItem[] = [
  // bedroom
  { id: 'bed-double', name: 'Double bed', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(1.6, 2.0, 0.5), sizeBounds: b(s(1.2, 1.9, 0.35), s(2.0, 2.2, 0.7)), modelPath: 'models/bed-double.glb', symbolId: 'bed-double' },
  { id: 'bed-single', name: 'Single bed', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(0.9, 2.0, 0.5), sizeBounds: b(s(0.8, 1.8, 0.35), s(1.2, 2.2, 0.7)), modelPath: 'models/bed-single.glb', symbolId: 'bed-single' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(1.5, 0.6, 2.2), sizeBounds: b(s(0.8, 0.5, 1.8), s(3.0, 0.8, 2.6)), modelPath: 'models/wardrobe.glb', symbolId: 'wardrobe' },
  { id: 'nightstand', name: 'Nightstand', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(0.45, 0.4, 0.55), sizeBounds: b(s(0.35, 0.3, 0.4), s(0.6, 0.5, 0.7)), modelPath: 'models/nightstand.glb', symbolId: 'nightstand' },
  { id: 'dresser', name: 'Dresser', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(1.0, 0.45, 0.8), sizeBounds: b(s(0.6, 0.35, 0.6), s(1.6, 0.6, 1.1)), modelPath: 'models/dresser.glb', symbolId: 'dresser' },
  // living room
  { id: 'sofa-3seat', name: 'Sofa (3-seat)', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(2.2, 0.95, 0.85), sizeBounds: b(s(1.6, 0.8, 0.7), s(2.8, 1.1, 1.0)), modelPath: 'models/sofa-3seat.glb', symbolId: 'sofa' },
  { id: 'armchair', name: 'Armchair', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(0.85, 0.85, 0.85), sizeBounds: b(s(0.7, 0.7, 0.7), s(1.1, 1.1, 1.0)), modelPath: 'models/armchair.glb', symbolId: 'armchair' },
  { id: 'coffee-table', name: 'Coffee table', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(1.1, 0.6, 0.45), sizeBounds: b(s(0.6, 0.4, 0.3), s(1.5, 0.9, 0.6)), modelPath: 'models/coffee-table.glb', symbolId: 'coffee-table' },
  { id: 'tv-stand', name: 'TV stand', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(1.6, 0.4, 0.5), sizeBounds: b(s(1.0, 0.3, 0.4), s(2.4, 0.6, 0.7)), modelPath: 'models/tv-stand.glb', symbolId: 'tv-stand' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(0.9, 0.3, 1.9), sizeBounds: b(s(0.6, 0.25, 1.2), s(1.6, 0.45, 2.4)), modelPath: 'models/bookshelf.glb', symbolId: 'bookshelf' },
  // kitchen & dining
  { id: 'dining-table', name: 'Dining table', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(1.6, 0.9, 0.75), sizeBounds: b(s(1.0, 0.7, 0.7), s(2.4, 1.2, 0.8)), modelPath: 'models/dining-table.glb', symbolId: 'dining-table' },
  { id: 'dining-chair', name: 'Dining chair', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(0.45, 0.5, 0.9), sizeBounds: b(s(0.4, 0.4, 0.8), s(0.55, 0.6, 1.1)), modelPath: 'models/dining-chair.glb', symbolId: 'chair' },
  { id: 'kitchen-counter', name: 'Kitchen counter', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(1.8, 0.6, 0.9), sizeBounds: b(s(0.6, 0.55, 0.85), s(3.6, 0.7, 0.95)), modelPath: 'models/kitchen-counter.glb', symbolId: 'counter' },
  { id: 'fridge', name: 'Fridge', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(0.7, 0.7, 1.8), sizeBounds: b(s(0.55, 0.6, 1.4), s(0.95, 0.8, 2.1)), modelPath: 'models/fridge.glb', symbolId: 'fridge' },
  { id: 'washing-machine', name: 'Washing machine', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(0.6, 0.6, 0.85), sizeBounds: b(s(0.55, 0.55, 0.8), s(0.7, 0.7, 0.9)), modelPath: 'models/washing-machine.glb', symbolId: 'washer' },
  // bathroom
  { id: 'toilet', name: 'Toilet', category: 'bathroom', mount: 'floor', layer: 'solid', defaultSize: s(0.4, 0.65, 0.8), sizeBounds: b(s(0.35, 0.55, 0.7), s(0.5, 0.75, 0.9)), modelPath: 'models/toilet.glb', symbolId: 'toilet' },
  { id: 'sink-vanity', name: 'Sink vanity', category: 'bathroom', mount: 'floor', layer: 'solid', defaultSize: s(0.8, 0.5, 0.85), sizeBounds: b(s(0.5, 0.4, 0.75), s(1.4, 0.6, 0.95)), modelPath: 'models/sink-vanity.glb', symbolId: 'sink' },
  { id: 'bathtub', name: 'Bathtub', category: 'bathroom', mount: 'floor', layer: 'solid', defaultSize: s(1.7, 0.75, 0.6), sizeBounds: b(s(1.4, 0.7, 0.5), s(1.9, 0.9, 0.65)), modelPath: 'models/bathtub.glb', symbolId: 'bathtub' },
  { id: 'shower', name: 'Shower stall', category: 'bathroom', mount: 'floor', layer: 'solid', defaultSize: s(0.9, 0.9, 2.0), sizeBounds: b(s(0.75, 0.75, 1.9), s(1.2, 1.2, 2.2)), modelPath: 'models/shower.glb', symbolId: 'shower' },
  // decor
  { id: 'rug-rect', name: 'Rug', category: 'decor', mount: 'floor', layer: 'underlay', defaultSize: s(2.0, 1.4, 0.01), sizeBounds: b(s(0.8, 0.5, 0.01), s(4.0, 3.0, 0.02)), modelPath: 'models/rug-rect.glb', symbolId: 'rug' },
  { id: 'plant-potted', name: 'Potted plant', category: 'decor', mount: 'floor', layer: 'solid', defaultSize: s(0.4, 0.4, 1.2), sizeBounds: b(s(0.25, 0.25, 0.5), s(0.7, 0.7, 2.0)), modelPath: 'models/plant-potted.glb', symbolId: 'plant' },
  { id: 'floor-lamp', name: 'Floor lamp', category: 'decor', mount: 'floor', layer: 'solid', defaultSize: s(0.35, 0.35, 1.6), sizeBounds: b(s(0.25, 0.25, 1.2), s(0.5, 0.5, 1.9)), modelPath: 'models/floor-lamp.glb', symbolId: 'floor-lamp' },
  { id: 'wall-art', name: 'Wall art', category: 'decor', mount: 'wall', layer: 'overlay', defaultSize: s(0.8, 0.05, 0.6), sizeBounds: b(s(0.3, 0.02, 0.2), s(1.6, 0.08, 1.2)), defaultElevation: 1.4, modelPath: 'models/wall-art.glb', symbolId: 'wall-art' },
  { id: 'wall-shelf', name: 'Wall shelf', category: 'decor', mount: 'wall', layer: 'overlay', defaultSize: s(0.8, 0.25, 0.05), sizeBounds: b(s(0.4, 0.15, 0.03), s(1.6, 0.35, 0.08)), defaultElevation: 1.5, modelPath: 'models/wall-shelf.glb', symbolId: 'wall-shelf' },
]

const byId = new Map(CATALOG.map((c) => [c.id, c]))
export const catalogItem = (id: string): CatalogItem | undefined => byId.get(id)

export const FLOOR_MATERIALS: FloorFinish[] = [
  { id: 'oak', name: 'Oak', texturePath: 'textures/floors/oak.jpg', tint: '#c8a06a' },
  { id: 'walnut', name: 'Walnut', texturePath: 'textures/floors/walnut.jpg', tint: '#8a5f3e' },
  { id: 'tile-light', name: 'Light tile', texturePath: 'textures/floors/tile-light.jpg', tint: '#d9d9d2' },
  { id: 'tile-dark', name: 'Dark tile', texturePath: 'textures/floors/tile-dark.jpg', tint: '#6d6d68' },
  { id: 'carpet', name: 'Carpet', texturePath: 'textures/floors/carpet.jpg', tint: '#b9b3a6' },
  { id: 'concrete', name: 'Concrete', texturePath: 'textures/floors/concrete.jpg', tint: '#a3a3a0' },
]

const finishById = new Map(FLOOR_MATERIALS.map((m) => [m.id, m]))
export const floorFinish = (id: string): FloorFinish | undefined => finishById.get(id)
```

- [ ] **Step 3: Write catalog integrity tests**

Create `src/model/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CATALOG, catalogItem, FLOOR_MATERIALS, floorFinish } from './catalog'

describe('catalog integrity', () => {
  it('has unique ids', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length)
  })

  it('every defaultSize lies within its bounds', () => {
    for (const c of CATALOG) {
      for (const axis of ['width', 'depth', 'height'] as const) {
        expect(c.defaultSize[axis], `${c.id}.${axis}`).toBeGreaterThanOrEqual(c.sizeBounds.min[axis])
        expect(c.defaultSize[axis], `${c.id}.${axis}`).toBeLessThanOrEqual(c.sizeBounds.max[axis])
      }
    }
  })

  it('wall items have a defaultElevation; floor items do not need one', () => {
    for (const c of CATALOG.filter((c) => c.mount === 'wall')) {
      expect(c.defaultElevation, c.id).toBeGreaterThan(0)
    }
  })

  it('model paths and symbols are set, floor finishes resolvable', () => {
    for (const c of CATALOG) {
      expect(c.modelPath).toMatch(/^models\/[a-z0-9-]+\.glb$/)
      expect(c.symbolId.length).toBeGreaterThan(0)
    }
    expect(catalogItem('sofa-3seat')?.name).toBe('Sofa (3-seat)')
    expect(catalogItem('nope')).toBeUndefined()
    expect(FLOOR_MATERIALS.length).toBe(6)
    expect(floorFinish('oak')?.texturePath).toBe('textures/floors/oak.jpg')
    expect(floorFinish('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run catalog tests** — `npx vitest run src/model/catalog.test.ts` — expected: PASS.

- [ ] **Step 5: Extend serialization — failing tests first**

In `src/model/serialization.test.ts`, update version-sensitive assertions (`plan.version` is now `3`, default plan has `furniture: []`) and add:

```ts
describe('v3 furniture', () => {
  const floorItem = {
    id: 'f1', catalogId: 'sofa-3seat', mount: 'floor',
    position: { x: 2, y: 2 }, rotation: 90, size: { width: 2.2, depth: 0.95, height: 0.85 },
  }

  it('migrates v2 to v3 by adding empty furniture', () => {
    const v2 = { ...createDefaultPlan(), version: 2 } as unknown as Record<string, unknown>
    delete v2.furniture
    const plan = parsePlan(JSON.stringify(v2))
    expect(plan?.version).toBe(3)
    expect(plan?.furniture).toEqual([])
  })

  it('migrates v1 all the way to v3', () => {
    const v1 = { ...createDefaultPlan(), version: 1 } as unknown as Record<string, unknown>
    delete v1.openings
    delete v1.furniture
    const plan = parsePlan(JSON.stringify(v1))
    expect(plan?.version).toBe(3)
    expect(plan?.openings).toEqual([])
    expect(plan?.furniture).toEqual([])
  })

  it('round-trips a valid floor item', () => {
    const plan = { ...createDefaultPlan(), furniture: [floorItem] }
    expect(parsePlan(serializePlan(plan as Plan))?.furniture).toHaveLength(1)
  })

  it('rejects unknown catalogId', () => {
    const plan = { ...createDefaultPlan(), furniture: [{ ...floorItem, catalogId: 'nope' }] }
    expect(parsePlan(serializePlan(plan as unknown as Plan))).toBeNull()
  })

  it('rejects wall items referencing unknown rooms or bad edges', () => {
    const wallItem = {
      id: 'w1', catalogId: 'wall-art', mount: 'wall', roomId: 'nope', edgeIndex: 0,
      offset: 1, elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 },
    }
    const plan = { ...createDefaultPlan(), furniture: [wallItem] }
    expect(parsePlan(serializePlan(plan as unknown as Plan))).toBeNull()
  })

  it('rejects unknown floorMaterial and bad wallColor on rooms', () => {
    const base = createDefaultPlan()
    const room = { id: 'r1', name: 'A', polygon: rectToPolygon({ x: 0, y: 0, width: 3, height: 3 }), color: '#8ecae6' }
    expect(parsePlan(serializePlan({ ...base, rooms: [{ ...room, floorMaterial: 'nope' }] } as Plan))).toBeNull()
    expect(parsePlan(serializePlan({ ...base, rooms: [{ ...room, wallColor: 'red' }] } as unknown as Plan))).toBeNull()
    expect(parsePlan(serializePlan({ ...base, rooms: [{ ...room, floorMaterial: 'oak', wallColor: '#aabbcc' }] } as Plan))).not.toBeNull()
  })

  it('clamps size to catalog bounds and normalizes rotation on import', () => {
    const plan = {
      ...createDefaultPlan(),
      furniture: [{ ...floorItem, rotation: -270, size: { width: 99, depth: 0.01, height: 0.85 } }],
    }
    const parsed = parsePlan(serializePlan(plan as Plan))
    const item = parsed?.furniture[0] as FloorItem | undefined
    expect(item?.rotation).toBe(90)
    expect(item?.size.width).toBe(2.8) // max width for sofa-3seat
    expect(item?.size.depth).toBe(0.8) // min depth
  })

  it('clamps floor positions into the apartment', () => {
    const plan = { ...createDefaultPlan(), furniture: [{ ...floorItem, position: { x: -50, y: 2 } }] }
    const parsed = parsePlan(serializePlan(plan as Plan))
    const item = parsed?.furniture[0] as FloorItem | undefined
    expect(item?.position.x).toBeGreaterThanOrEqual(0)
  })
})
```

Add the needed imports (`rectToPolygon` from `./geometry`, `Plan` and `FloorItem` types). NOTE: the position-clamp test needs `clampFloorItemPosition` from Task 2 — for THIS task implement a simpler interim clamp in `normalizePlan` (clamp the CENTER into `[0, apartment.width] × [0, apartment.depth]`); Task 2 upgrades it to footprint-aware clamping. Write the test against the center-clamp behavior shown above (it only asserts `>= 0`).

- [ ] **Step 6: Run to verify failures** — `npx vitest run src/model/serialization.test.ts` — expected: FAIL (v3 fields unknown).

- [ ] **Step 7: Implement schema v3**

In `src/model/serialization.ts`:

```ts
import { z } from 'zod'
import { catalogItem, floorFinish } from './catalog'
import { normalizeDeg, polygonArea, roundCm, roundDeg } from './geometry'
import { clampOffset, roomEdge } from './openings'
import type { Plan, PlacedItem } from './types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const size3Schema = z.object({
  width: z.number().finite().positive(),
  depth: z.number().finite().positive(),
  height: z.number().finite().positive(),
})

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const knownCatalogId = z.string().min(1).refine((id) => !!catalogItem(id), { message: 'unknown catalog id' })

const floorItemSchema = z.object({
  id: z.string().min(1),
  catalogId: knownCatalogId,
  mount: z.literal('floor'),
  position: vec2Schema,
  rotation: z.number().finite(),
  size: size3Schema,
  color: hexColor.optional(),
})

const wallItemSchema = z.object({
  id: z.string().min(1),
  catalogId: knownCatalogId,
  mount: z.literal('wall'),
  roomId: z.string().min(1),
  edgeIndex: z.number().int().min(0),
  offset: z.number().finite().min(0),
  elevation: z.number().finite().min(0),
  size: size3Schema,
  color: hexColor.optional(),
})

const placedItemSchema = z.discriminatedUnion('mount', [floorItemSchema, wallItemSchema])
```

Update `planSchema`: `version: z.literal(3)`, the room object gains `floorMaterial: z.string().refine((id) => !!floorFinish(id)).optional()` and `wallColor: hexColor.optional()`, plus `furniture: z.array(placedItemSchema)`. Extend the existing `superRefine` with wall-item checks mirroring the opening checks:

```ts
plan.furniture.forEach((item, i) => {
  if (item.mount !== 'wall') return
  const room = plan.rooms.find((r) => r.id === item.roomId)
  if (!room) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['furniture', i, 'roomId'], message: 'wall item references unknown room' })
  } else if (item.edgeIndex >= room.polygon.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['furniture', i, 'edgeIndex'], message: 'edge index out of range for room polygon' })
  }
})
```

Add migration + normalization:

```ts
function migrate(raw: unknown): unknown {
  let out = raw
  if (out !== null && typeof out === 'object' && (out as { version?: unknown }).version === 1) {
    out = { ...(out as object), version: 2, openings: [] }
  }
  if (out !== null && typeof out === 'object' && (out as { version?: unknown }).version === 2) {
    out = { ...(out as object), version: 3, furniture: [] }
  }
  return out
}

export function normalizePlan(plan: Plan): Plan {
  const furniture = plan.furniture.map((item): PlacedItem => {
    const cat = catalogItem(item.catalogId)!
    const size = {
      width: roundCm(clamp(item.size.width, cat.sizeBounds.min.width, cat.sizeBounds.max.width)),
      depth: roundCm(clamp(item.size.depth, cat.sizeBounds.min.depth, cat.sizeBounds.max.depth)),
      height: roundCm(clamp(item.size.height, cat.sizeBounds.min.height, cat.sizeBounds.max.height)),
    }
    if (item.mount === 'floor') {
      return {
        ...item,
        size,
        rotation: roundDeg(normalizeDeg(item.rotation)),
        position: {
          x: roundCm(clamp(item.position.x, 0, plan.apartment.width)),
          y: roundCm(clamp(item.position.y, 0, plan.apartment.depth)),
        },
      }
    }
    const room = plan.rooms.find((r) => r.id === item.roomId)
    const edge = room ? roomEdge(room, item.edgeIndex) : null
    return {
      ...item,
      size,
      offset: edge ? clampOffset(item.offset, size.width, edge.length) : item.offset,
      elevation: roundCm(clamp(item.elevation, 0, Math.max(0, plan.apartment.wallHeight - size.height))),
    }
  })
  return { ...plan, furniture }
}
```

`createDefaultPlan` returns `version: 3` + `furniture: []`. `parsePlan` becomes:

```ts
export function parsePlan(json: string): Plan | null {
  try {
    const result = planSchema.safeParse(migrate(JSON.parse(json)))
    return result.success ? normalizePlan(result.data) : null
  } catch {
    return null
  }
}
```

- [ ] **Step 8: Run tests** — `npx vitest run src/model/serialization.test.ts src/model/catalog.test.ts` — expected: PASS. Then run `npm test`; fix any store/persistence tests that assert `version: 2` (update them to 3 — the plan-shape changes are additive elsewhere). Run `npx tsc --noEmit`; the compile will surface every site that must acknowledge the new Selection kind — fix only what's needed to compile (exhaustive switches etc.), leaving behavior changes to later tasks.

- [ ] **Step 9: Commit**

```bash
git add src/model docs
git commit -m "feat: schema v3 — furniture catalog, placed items, room finishes"
```

---

### Task 2: Furniture geometry — footprints, SAT collision, bounds

**Files:**
- Create: `src/model/furniture.ts`
- Test: `src/model/furniture.test.ts`
- Modify: `src/model/serialization.ts` (swap interim position clamp for `clampFloorItemPosition`)

**Interfaces:**
- Consumes: `Vec2`, `Size3`, `FloorItem`, `WallItem`, `PlacedItem`, `Plan`, `Apartment`, `Room` from types; `roundCm` from geometry; `roomEdge` from openings; `catalogItem` from catalog.
- Produces (used by store, editor, viewer):
  - `footprintCorners(position: Vec2, rotationDeg: number, size: Size3): Vec2[]` — 4 corners, local frame width→x depth→y, CCW rotation
  - `convexOverlap(a: Vec2[], b: Vec2[]): boolean` — SAT; touching (≤ 1e-9 separation) is NOT overlap
  - `pointInConvexPolygon(p: Vec2, poly: Vec2[]): boolean`
  - `isSolidFloorItem(item: PlacedItem): item is FloorItem` — floor mount AND catalog layer `'solid'`
  - `floorItemCollides(candidate: { position: Vec2; rotation: number; size: Size3 }, plan: Plan, ignoreId?: string): boolean` — vs existing solids
  - `collidingFurnitureIds(plan: Plan): Set<string>` — pairwise solid collisions
  - `floorItemInBounds(candidate: { position: Vec2; rotation: number; size: Size3 }, apartment: Apartment): boolean`
  - `clampFloorItemPosition(position: Vec2, rotationDeg: number, size: Size3, apartment: Apartment): Vec2` — clamps center so the rotated footprint's AABB fits (center of apartment axis if it can't fit)
  - `wallItemSpan(item: WallItem, room: Room): { a: Vec2; b: Vec2 } | null` — like `openingSpan`

- [ ] **Step 1: Write failing tests**

Create `src/model/furniture.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  clampFloorItemPosition, collidingFurnitureIds, convexOverlap, floorItemCollides,
  floorItemInBounds, footprintCorners, isSolidFloorItem, pointInConvexPolygon, wallItemSpan,
} from './furniture'
import { createDefaultPlan } from './serialization'
import type { FloorItem, Plan, Size3, WallItem } from './types'

const size: Size3 = { width: 2, depth: 1, height: 0.8 }
const sofa = (x: number, y: number, rotation = 0, id = 'a'): FloorItem => ({
  id, catalogId: 'sofa-3seat', mount: 'floor', position: { x, y }, rotation, size,
})
const rug = (x: number, y: number): FloorItem => ({
  id: 'r', catalogId: 'rug-rect', mount: 'floor', position: { x, y }, rotation: 0,
  size: { width: 2, depth: 1.4, height: 0.01 },
})
const planWith = (...furniture: FloorItem[]): Plan => ({ ...createDefaultPlan(), furniture })

describe('footprintCorners', () => {
  it('unrotated: axis-aligned box around the center', () => {
    const c = footprintCorners({ x: 5, y: 4 }, 0, size)
    expect(c).toEqual([
      { x: 4, y: 3.5 }, { x: 6, y: 3.5 }, { x: 6, y: 4.5 }, { x: 4, y: 4.5 },
    ])
  })
  it('90°: width and depth swap', () => {
    const c = footprintCorners({ x: 0, y: 0 }, 90, size)
    const xs = c.map((p) => p.x), ys = c.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2)
  })
})

describe('convexOverlap (SAT)', () => {
  const box = (x: number, y: number) => footprintCorners({ x, y }, 0, size)
  it('detects overlap', () => expect(convexOverlap(box(0, 0), box(1, 0.5))).toBe(true))
  it('separated boxes do not overlap', () => expect(convexOverlap(box(0, 0), box(5, 0))).toBe(false))
  it('touching edges do not overlap', () => expect(convexOverlap(box(0, 0), box(2, 0))).toBe(false))
  it('rotated: diagonal neighbor overlaps only when turned', () => {
    const a = footprintCorners({ x: 0, y: 0 }, 0, size)
    const turned = footprintCorners({ x: 1.4, y: 0.9 }, 45, size)
    const straight = footprintCorners({ x: 1.4, y: 0.9 }, 0, size)
    expect(convexOverlap(a, straight)).toBe(true)
    expect(convexOverlap(a, turned)).toBe(true)
    expect(convexOverlap(a, footprintCorners({ x: 2.3, y: 1.6 }, 45, size))).toBe(false)
  })
})

describe('collision + layers', () => {
  it('solid vs solid collides', () => {
    expect(floorItemCollides(sofa(1, 1), planWith(sofa(1.5, 1, 0, 'b')))).toBe(true)
  })
  it('ignores the candidate itself via ignoreId', () => {
    expect(floorItemCollides(sofa(1, 1), planWith(sofa(1, 1, 0, 'a')), 'a')).toBe(false)
  })
  it('rugs never collide', () => {
    expect(isSolidFloorItem(rug(1, 1))).toBe(false)
    expect(floorItemCollides(sofa(1, 1), planWith(rug(1, 1)))).toBe(false)
    expect(collidingFurnitureIds(planWith(sofa(1, 1), rug(1, 1)))).toEqual(new Set())
  })
  it('collidingFurnitureIds flags both solids of a pair', () => {
    expect(collidingFurnitureIds(planWith(sofa(1, 1, 0, 'a'), sofa(1.5, 1, 0, 'b')))).toEqual(new Set(['a', 'b']))
  })
})

describe('bounds', () => {
  const apartment = createDefaultPlan().apartment // 10 × 8
  it('inside is in bounds, straddling the boundary is not', () => {
    expect(floorItemInBounds(sofa(5, 4), apartment)).toBe(true)
    expect(floorItemInBounds(sofa(0.5, 4), apartment)).toBe(false) // width 2 → needs x ≥ 1
  })
  it('rotation widens the required margin', () => {
    expect(floorItemInBounds(sofa(1, 4, 0), apartment)).toBe(true)
    expect(floorItemInBounds(sofa(1, 4, 90), apartment)).toBe(true) // depth 1 → needs x ≥ 0.5
    expect(floorItemInBounds(sofa(0.4, 4, 90), apartment)).toBe(false) // depth/2 = 0.5 margin
  })
  it('clampFloorItemPosition pulls a stranded item back in', () => {
    expect(clampFloorItemPosition({ x: -3, y: 4 }, 0, size, apartment)).toEqual({ x: 1, y: 4 })
    expect(clampFloorItemPosition({ x: 5, y: 100 }, 0, size, apartment)).toEqual({ x: 5, y: 7.5 })
  })
})

describe('wallItemSpan', () => {
  it('resolves like openingSpan', () => {
    const room = { id: 'r1', name: 'A', color: '#8ecae6', polygon: [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ] }
    const art: WallItem = { id: 'w', catalogId: 'wall-art', mount: 'wall', roomId: 'r1',
      edgeIndex: 0, offset: 2, elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 } }
    expect(wallItemSpan(art, room)).toEqual({ a: { x: 1.6, y: 0 }, b: { x: 2.4, y: 0 } })
    expect(wallItemSpan({ ...art, edgeIndex: 9 }, room)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/model/furniture.test.ts` — expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/model/furniture.ts`:

```ts
import { catalogItem } from './catalog'
import { roundCm } from './geometry'
import { roomEdge } from './openings'
import type { Apartment, FloorItem, Plan, PlacedItem, Room, Size3, Vec2, WallItem } from './types'

export const WALL_SNAP_THRESHOLD = 0.15
export const ROTATION_SNAP_DEG = 15

const OVERLAP_EPS = 1e-9

export interface Footprint {
  position: Vec2
  rotation: number
  size: Size3
}

export function footprintCorners(position: Vec2, rotationDeg: number, size: Size3): Vec2[] {
  const t = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const hw = size.width / 2
  const hd = size.depth / 2
  const local: Vec2[] = [
    { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd },
  ]
  return local.map((p) => ({
    x: position.x + p.x * cos - p.y * sin,
    y: position.y + p.x * sin + p.y * cos,
  }))
}

function projectOntoAxis(poly: Vec2[], ax: number, ay: number): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of poly) {
    const d = p.x * ax + p.y * ay
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

export function convexOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const ax = -(q.y - p.y)
      const ay = q.x - p.x
      const [minA, maxA] = projectOntoAxis(a, ax, ay)
      const [minB, maxB] = projectOntoAxis(b, ax, ay)
      if (maxA <= minB + OVERLAP_EPS || maxB <= minA + OVERLAP_EPS) return false
    }
  }
  return true
}

export function pointInConvexPolygon(p: Vec2, poly: Vec2[]): boolean {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (cross === 0) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

export function isSolidFloorItem(item: PlacedItem): item is FloorItem {
  return item.mount === 'floor' && catalogItem(item.catalogId)?.layer === 'solid'
}

export function floorItemCollides(candidate: Footprint, plan: Plan, ignoreId?: string): boolean {
  const corners = footprintCorners(candidate.position, candidate.rotation, candidate.size)
  return plan.furniture.some(
    (f) =>
      f.id !== ignoreId &&
      isSolidFloorItem(f) &&
      convexOverlap(corners, footprintCorners(f.position, f.rotation, f.size)),
  )
}

export function collidingFurnitureIds(plan: Plan): Set<string> {
  const solids = plan.furniture.filter(isSolidFloorItem)
  const corners = solids.map((f) => footprintCorners(f.position, f.rotation, f.size))
  const ids = new Set<string>()
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      if (convexOverlap(corners[i], corners[j])) {
        ids.add(solids[i].id)
        ids.add(solids[j].id)
      }
    }
  }
  return ids
}

function aabbHalfExtents(rotationDeg: number, size: Size3): Vec2 {
  const t = (rotationDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(t))
  const sin = Math.abs(Math.sin(t))
  return {
    x: (size.width * cos + size.depth * sin) / 2,
    y: (size.width * sin + size.depth * cos) / 2,
  }
}

export function floorItemInBounds(candidate: Footprint, apartment: Apartment): boolean {
  return footprintCorners(candidate.position, candidate.rotation, candidate.size).every(
    (c) => c.x >= 0 && c.y >= 0 && c.x <= apartment.width && c.y <= apartment.depth,
  )
}

export function clampFloorItemPosition(
  position: Vec2,
  rotationDeg: number,
  size: Size3,
  apartment: Apartment,
): Vec2 {
  const e = aabbHalfExtents(rotationDeg, size)
  const clampAxis = (v: number, extent: number, max: number) =>
    extent * 2 > max ? max / 2 : Math.min(max - extent, Math.max(extent, v))
  return {
    x: roundCm(clampAxis(position.x, e.x, apartment.width)),
    y: roundCm(clampAxis(position.y, e.y, apartment.depth)),
  }
}

export function wallItemSpan(item: WallItem, room: Room): { a: Vec2; b: Vec2 } | null {
  const edge = roomEdge(room, item.edgeIndex)
  if (!edge) return null
  const s = item.offset - item.size.width / 2
  const e = item.offset + item.size.width / 2
  return {
    a: { x: edge.a.x + edge.ux * s, y: edge.a.y + edge.uy * s },
    b: { x: edge.a.x + edge.ux * e, y: edge.a.y + edge.uy * e },
  }
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/model/furniture.test.ts` — expected: PASS.

- [ ] **Step 5: Upgrade the import clamp**

In `src/model/serialization.ts` `normalizePlan`, replace the interim center clamp for floor items with:

```ts
position: clampFloorItemPosition(item.position, item.rotation, size, plan.apartment),
```

(after the rotation normalization; pass the normalized rotation). Import from `./furniture`.

- [ ] **Step 6: Run model suite** — `npx vitest run src/model` — expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/model
git commit -m "feat: furniture footprint geometry, SAT collision, bounds clamping"
```

---

### Task 3: Wall snapping for floor items

**Files:**
- Modify: `src/model/furniture.ts`
- Test: `src/model/furniture.test.ts` (extend)

**Interfaces:**
- Consumes: `roomEdge`, `projectOntoEdge` from openings; `roundCm`, `normalizeDeg`, `roundDeg` from geometry.
- Produces (used by the editor's ghost + drag):
  - `interface WallSnap { position: Vec2; rotation: number }`
  - `snapFloorItemToWall(position: Vec2, size: Size3, plan: Plan, threshold?: number): WallSnap | null` — nearest room edge whose line the item's center projects onto (strictly inside the edge extent) and sits on the room-inward side, where `|distToEdge − depth/2| ≤ threshold` (default `WALL_SNAP_THRESHOLD`); result puts the item flush against the wall, back to the wall, rotation aligned to the edge angle.

- [ ] **Step 1: Write failing tests**

Append to `src/model/furniture.test.ts` (add `snapFloorItemToWall` and `rectToPolygon` imports, plus a room helper):

```ts
import { rectToPolygon } from './geometry'
import { snapFloorItemToWall } from './furniture'

describe('snapFloorItemToWall', () => {
  const room = { id: 'r1', name: 'A', color: '#8ecae6', polygon: rectToPolygon({ x: 1, y: 1, width: 4, height: 3 }) }
  const plan: Plan = { ...createDefaultPlan(), rooms: [room] }
  const sofaSize: Size3 = { width: 2, depth: 1, height: 0.8 }

  it('snaps flush to the top wall, rotation 0', () => {
    // top edge at y=1; flush center y = 1 + depth/2 = 1.5; item hovering at y=1.55
    const snap = snapFloorItemToWall({ x: 3, y: 1.55 }, sofaSize, plan)
    expect(snap).toEqual({ position: { x: 3, y: 1.5 }, rotation: 0 })
  })

  it('snaps to the left wall with rotation 270', () => {
    // left edge at x=1 (edge 3, direction -y, inward +x); flush center x = 1.5
    const snap = snapFloorItemToWall({ x: 1.6, y: 2.5 }, sofaSize, plan)
    expect(snap).toEqual({ position: { x: 1.5, y: 2.5 }, rotation: 270 })
  })

  it('returns null away from walls or outside the room side', () => {
    expect(snapFloorItemToWall({ x: 3, y: 2.5 }, sofaSize, plan)).toBeNull() // room middle
    expect(snapFloorItemToWall({ x: 3, y: 0.5 }, sofaSize, plan)).toBeNull() // outside the room
  })

  it('ignores edges whose extent the center does not project into', () => {
    expect(snapFloorItemToWall({ x: 8, y: 1.55 }, sofaSize, plan)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/model/furniture.test.ts` — expected: FAIL (`snapFloorItemToWall` not exported).

- [ ] **Step 3: Implement**

Append to `src/model/furniture.ts` (import `projectOntoEdge` from `./openings`, `normalizeDeg`, `roundDeg` from `./geometry`):

```ts
export interface WallSnap {
  position: Vec2
  rotation: number
}

export function snapFloorItemToWall(
  position: Vec2,
  size: Size3,
  plan: Plan,
  threshold = WALL_SNAP_THRESHOLD,
): WallSnap | null {
  let best: WallSnap | null = null
  let bestScore = threshold
  for (const room of plan.rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const edge = roomEdge(room, i)
      if (!edge) continue
      const nx = -edge.uy
      const ny = edge.ux
      const t = projectOntoEdge(edge, position)
      if (t <= 0 || t >= edge.length) continue
      const side = (position.x - edge.a.x) * nx + (position.y - edge.a.y) * ny
      if (side < 0) continue // wrong side of the wall (outside the room)
      const score = Math.abs(side - size.depth / 2)
      if (score < bestScore) {
        bestScore = score
        best = {
          position: {
            x: roundCm(edge.a.x + edge.ux * t + nx * (size.depth / 2)),
            y: roundCm(edge.a.y + edge.uy * t + ny * (size.depth / 2)),
          },
          rotation: roundDeg(normalizeDeg((Math.atan2(edge.uy, edge.ux) * 180) / Math.PI)),
        }
      }
    }
  }
  return best
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/model/furniture.test.ts` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "feat: wall snapping for floor furniture"
```

---

### Task 4: Store — furniture state and actions

**Files:**
- Modify: `src/store/planStore.ts`
- Test: `src/store/planStore.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 1–3; `clampOffset`, `roomEdge` from openings.
- Produces (the ONLY write API later tasks may use):
  - State: `placingFurniture: string | null`, `catalogOpen: boolean`
  - `setCatalogOpen(open: boolean): void`
  - `setPlacingFurniture(catalogId: string | null): void` — clears `placing` (openings) and `selection`; `setPlacing` symmetrically clears `placingFurniture`
  - `selectFurniture(id: string): void`
  - `type Placement = { mount: 'floor'; position: Vec2; rotation: number } | { mount: 'wall'; roomId: string; edgeIndex: number; offset: number }`
  - `placeFurniture(catalogId: string, placement: Placement): string` — `''` when rejected (unknown catalog id, mount mismatch, non-finite input, solid collision, out of bounds, bad room/edge); on success item gets catalog `defaultSize`, wall items get `defaultElevation ?? 1.2`; selects the new item and clears `placingFurniture`
  - `moveFloorItem(id: string, position: Vec2, rotation?: number): void` — cm-rounds, clamps into apartment via `clampFloorItemPosition`; transient collisions allowed
  - `moveWallItem(id: string, roomId: string, edgeIndex: number, offset: number): void` — re-parents to any valid room edge, clamps offset
  - `updateWallItem(id: string, patch: Partial<Pick<WallItem, 'offset' | 'elevation'>>): void`
  - `rotateFurniture(id: string, rotation: number): void` — floor items only; normalizes to [0,360), rounds 0.1°, re-clamps position
  - `resizeFurniture(id: string, patch: Partial<Size3>): void` — clamps to catalog `sizeBounds`, re-clamps position/offset/elevation
  - `recolorFurniture(id: string, color: string | undefined): void` — only when the catalog entry has `recolorMaterial`; validates `#rrggbb`
  - `deleteFurniture(id: string): void`
  - `setRoomFloorMaterial(roomId: string, materialId: string | undefined): void` — validates against `FLOOR_MATERIALS`
  - `setRoomWallColor(roomId: string, color: string | undefined): void` — validates `#rrggbb`
  - Cascades: `deleteRoom` also removes that room's wall items (and clears their selection); `updateRoomRect` re-clamps wall-item offsets on that room; `setApartment` re-clamps every floor item's position and every wall item's elevation.

- [ ] **Step 1: Write failing tests**

Append to `src/store/planStore.test.ts` (the file already resets the store between tests — follow its existing pattern):

```ts
import { catalogItem } from '../model/catalog'

const placeSofa = (x: number, y: number, rotation = 0) =>
  usePlanStore.getState().placeFurniture('sofa-3seat', { mount: 'floor', position: { x, y }, rotation })

describe('furniture actions', () => {
  it('places a floor item with defaults and selects it', () => {
    const id = placeSofa(5, 4)
    const s = usePlanStore.getState()
    expect(id).not.toBe('')
    const item = s.plan.furniture[0]
    expect(item).toMatchObject({ catalogId: 'sofa-3seat', mount: 'floor', rotation: 0 })
    expect(item.size).toEqual(catalogItem('sofa-3seat')!.defaultSize)
    expect(s.selection).toEqual({ kind: 'furniture', id })
    expect(s.placingFurniture).toBeNull()
  })

  it('rejects colliding and out-of-bounds placements', () => {
    expect(placeSofa(5, 4)).not.toBe('')
    expect(placeSofa(5.5, 4)).toBe('') // overlaps the first sofa
    expect(placeSofa(0.2, 4)).toBe('') // footprint outside the apartment
    expect(usePlanStore.getState().plan.furniture).toHaveLength(1)
  })

  it('places rugs on top of solids (underlay exempt from collision)', () => {
    expect(placeSofa(5, 4)).not.toBe('')
    const rugId = usePlanStore.getState().placeFurniture('rug-rect', { mount: 'floor', position: { x: 5, y: 4 }, rotation: 0 })
    expect(rugId).not.toBe('')
  })

  it('moves with clamping, rotates normalized, resizes within bounds', () => {
    const id = placeSofa(5, 4)
    const st = () => usePlanStore.getState()
    st().moveFloorItem(id, { x: -10, y: 4 })
    expect((st().plan.furniture[0] as FloorItem).position.x).toBe(1.1) // half of width 2.2
    st().rotateFurniture(id, -90)
    expect((st().plan.furniture[0] as FloorItem).rotation).toBe(270)
    st().resizeFurniture(id, { width: 99 })
    expect(st().plan.furniture[0].size.width).toBe(2.8)
    st().recolorFurniture(id, '#ff0000')
    // sofa has no recolorMaterial until Task 11 → color must NOT be set
    expect(st().plan.furniture[0].color).toBeUndefined()
    st().deleteFurniture(id)
    expect(st().plan.furniture).toHaveLength(0)
    expect(st().selection).toBeNull()
  })

  it('places, slides and updates wall items; deleteRoom cascades', () => {
    const st = () => usePlanStore.getState()
    const roomId = st().addRoom()
    const artId = st().placeFurniture('wall-art', { mount: 'wall', roomId, edgeIndex: 0, offset: 1 })
    expect(artId).not.toBe('')
    const art = () => st().plan.furniture.find((f) => f.id === artId) as WallItem
    expect(art().elevation).toBe(1.4)
    st().moveWallItem(artId, roomId, 1, 0)
    expect(art().edgeIndex).toBe(1)
    expect(art().offset).toBe(0.4) // clamped to width/2
    st().updateWallItem(artId, { elevation: 99 })
    expect(art().elevation).toBe(2.7 - 0.6) // wallHeight − item height
    st().deleteRoom(roomId)
    expect(st().plan.furniture).toHaveLength(0)
  })

  it('setApartment re-clamps stranded floor items', () => {
    const id = placeSofa(8.5, 4) // valid pre-shrink: right edge 9.6 < 10
    usePlanStore.getState().setApartment({ width: 5 })
    const item = usePlanStore.getState().plan.furniture[0] as FloorItem
    expect(item.position.x).toBeLessThanOrEqual(5 - 1.1)
  })

  it('room finishes validate', () => {
    const st = () => usePlanStore.getState()
    const roomId = st().addRoom()
    st().setRoomFloorMaterial(roomId, 'oak')
    st().setRoomWallColor(roomId, '#aabbcc')
    let room = st().plan.rooms[0]
    expect(room.floorMaterial).toBe('oak')
    expect(room.wallColor).toBe('#aabbcc')
    st().setRoomFloorMaterial(roomId, 'nope')
    st().setRoomWallColor(roomId, 'red')
    room = st().plan.rooms[0]
    expect(room.floorMaterial).toBe('oak') // unchanged
    expect(room.wallColor).toBe('#aabbcc')
    st().setRoomFloorMaterial(roomId, undefined)
    expect(st().plan.rooms[0].floorMaterial).toBeUndefined()
  })

  it('placing modes are mutually exclusive', () => {
    const st = () => usePlanStore.getState()
    st().setPlacing('door')
    st().setPlacingFurniture('sofa-3seat')
    expect(st().placing).toBeNull()
    expect(st().placingFurniture).toBe('sofa-3seat')
    st().setPlacing('window')
    expect(st().placingFurniture).toBeNull()
  })
})
```

Add `FloorItem`, `WallItem` to the type imports.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/store/planStore.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement**

In `src/store/planStore.ts`, add imports:

```ts
import { catalogItem, floorFinish } from '../model/catalog'
import {
  clampFloorItemPosition, floorItemCollides, floorItemInBounds, isSolidFloorItem,
} from '../model/furniture'
import { normalizeDeg, roundDeg } from '../model/geometry'
import type { FloorItem, PlacedItem, Size3, Vec2, WallItem } from '../model/types'
```

Add to `PlanState` the signatures from the Interfaces block, plus:

```ts
export type Placement =
  | { mount: 'floor'; position: Vec2; rotation: number }
  | { mount: 'wall'; roomId: string; edgeIndex: number; offset: number }
```

Implementation (add to the `create` body; `HEX = /^#[0-9a-fA-F]{6}$/`):

```ts
placingFurniture: null,
catalogOpen: false,

setCatalogOpen: (catalogOpen) => set({ catalogOpen }),

setPlacingFurniture: (placingFurniture) =>
  set({ placingFurniture, placing: null, selection: null }),

selectFurniture: (id) => set({ selection: { kind: 'furniture', id } }),

placeFurniture: (catalogId, placement) => {
  const id = crypto.randomUUID()
  let created = false
  set((s) => {
    const cat = catalogItem(catalogId)
    if (!cat || cat.mount !== placement.mount) return s
    const size: Size3 = { ...cat.defaultSize }
    let item: PlacedItem
    if (placement.mount === 'floor') {
      if (!Number.isFinite(placement.position.x) || !Number.isFinite(placement.position.y) || !Number.isFinite(placement.rotation)) return s
      const rotation = roundDeg(normalizeDeg(placement.rotation))
      const position = {
        x: roundCm(placement.position.x),
        y: roundCm(placement.position.y),
      }
      const candidate = { position, rotation, size }
      if (!floorItemInBounds(candidate, s.plan.apartment)) return s
      if (cat.layer === 'solid' && floorItemCollides(candidate, s.plan)) return s
      item = { id, catalogId, mount: 'floor', position, rotation, size }
    } else {
      if (!Number.isFinite(placement.offset)) return s
      const room = s.plan.rooms.find((r) => r.id === placement.roomId)
      const edge = room ? roomEdge(room, placement.edgeIndex) : null
      if (!edge) return s
      const wallHeight = s.plan.apartment.wallHeight
      item = {
        id, catalogId, mount: 'wall',
        roomId: placement.roomId, edgeIndex: placement.edgeIndex,
        offset: clampOffset(placement.offset, size.width, edge.length),
        elevation: roundCm(clamp(cat.defaultElevation ?? 1.2, 0, Math.max(0, wallHeight - size.height))),
        size,
      }
    }
    created = true
    return {
      plan: { ...s.plan, furniture: [...s.plan.furniture, item] },
      selection: { kind: 'furniture', id } as Selection,
      placingFurniture: null,
    }
  })
  return created ? id : ''
},

moveFloorItem: (id, position, rotation) =>
  set((s) => {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return s
    if (rotation !== undefined && !Number.isFinite(rotation)) return s
    const item = s.plan.furniture.find((f) => f.id === id)
    if (!item || item.mount !== 'floor') return s
    const nextRotation = rotation === undefined ? item.rotation : roundDeg(normalizeDeg(rotation))
    const next: FloorItem = {
      ...item,
      rotation: nextRotation,
      position: clampFloorItemPosition(position, nextRotation, item.size, s.plan.apartment),
    }
    return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
  }),

moveWallItem: (id, roomId, edgeIndex, offset) =>
  set((s) => {
    if (!Number.isFinite(offset)) return s
    const item = s.plan.furniture.find((f) => f.id === id)
    if (!item || item.mount !== 'wall') return s
    const room = s.plan.rooms.find((r) => r.id === roomId)
    const edge = room ? roomEdge(room, edgeIndex) : null
    if (!edge) return s
    const next: WallItem = { ...item, roomId, edgeIndex, offset: clampOffset(offset, item.size.width, edge.length) }
    return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
  }),

updateWallItem: (id, patch) =>
  set((s) => {
    for (const v of Object.values(patch)) if (v !== undefined && !Number.isFinite(v)) return s
    const item = s.plan.furniture.find((f) => f.id === id)
    if (!item || item.mount !== 'wall') return s
    const room = s.plan.rooms.find((r) => r.id === item.roomId)
    const edge = room ? roomEdge(room, item.edgeIndex) : null
    if (!edge) return s
    const wallHeight = s.plan.apartment.wallHeight
    const next: WallItem = {
      ...item,
      offset: clampOffset(patch.offset ?? item.offset, item.size.width, edge.length),
      elevation: roundCm(clamp(patch.elevation ?? item.elevation, 0, Math.max(0, wallHeight - item.size.height))),
    }
    return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
  }),

rotateFurniture: (id, rotation) =>
  set((s) => {
    if (!Number.isFinite(rotation)) return s
    const item = s.plan.furniture.find((f) => f.id === id)
    if (!item || item.mount !== 'floor') return s
    const deg = roundDeg(normalizeDeg(rotation))
    const next: FloorItem = {
      ...item,
      rotation: deg,
      position: clampFloorItemPosition(item.position, deg, item.size, s.plan.apartment),
    }
    return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
  }),

resizeFurniture: (id, patch) =>
  set((s) => {
    for (const v of Object.values(patch)) if (v !== undefined && !Number.isFinite(v)) return s
    const item = s.plan.furniture.find((f) => f.id === id)
    const cat = item ? catalogItem(item.catalogId) : undefined
    if (!item || !cat) return s
    const size: Size3 = {
      width: roundCm(clamp(patch.width ?? item.size.width, cat.sizeBounds.min.width, cat.sizeBounds.max.width)),
      depth: roundCm(clamp(patch.depth ?? item.size.depth, cat.sizeBounds.min.depth, cat.sizeBounds.max.depth)),
      height: roundCm(clamp(patch.height ?? item.size.height, cat.sizeBounds.min.height, cat.sizeBounds.max.height)),
    }
    let next: PlacedItem
    if (item.mount === 'floor') {
      next = { ...item, size, position: clampFloorItemPosition(item.position, item.rotation, size, s.plan.apartment) }
    } else {
      const room = s.plan.rooms.find((r) => r.id === item.roomId)
      const edge = room ? roomEdge(room, item.edgeIndex) : null
      const wallHeight = s.plan.apartment.wallHeight
      next = {
        ...item,
        size,
        offset: edge ? clampOffset(item.offset, size.width, edge.length) : item.offset,
        elevation: roundCm(clamp(item.elevation, 0, Math.max(0, wallHeight - size.height))),
      }
    }
    return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
  }),

recolorFurniture: (id, color) =>
  set((s) => {
    const item = s.plan.furniture.find((f) => f.id === id)
    const cat = item ? catalogItem(item.catalogId) : undefined
    if (!item || !cat?.recolorMaterial) return s
    if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) return s
    const next = { ...item, color }
    return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
  }),

deleteFurniture: (id) =>
  set((s) => ({
    plan: { ...s.plan, furniture: s.plan.furniture.filter((f) => f.id !== id) },
    selection: s.selection?.kind === 'furniture' && s.selection.id === id ? null : s.selection,
  })),

setRoomFloorMaterial: (roomId, materialId) =>
  set((s) => {
    if (materialId !== undefined && !floorFinish(materialId)) return s
    return {
      plan: {
        ...s.plan,
        rooms: s.plan.rooms.map((r) => (r.id === roomId ? { ...r, floorMaterial: materialId } : r)),
      },
    }
  }),

setRoomWallColor: (roomId, color) =>
  set((s) => {
    if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) return s
    return {
      plan: {
        ...s.plan,
        rooms: s.plan.rooms.map((r) => (r.id === roomId ? { ...r, wallColor: color } : r)),
      },
    }
  }),
```

Then wire the cascades into EXISTING actions:

- `setPlacing`: `set({ placing, placingFurniture: null, selection: null })`
- `loadPlan`: also reset `placingFurniture: null`
- `deleteRoom`: filter `furniture: s.plan.furniture.filter((f) => f.mount !== 'wall' || f.roomId !== id)`; extend the orphan-selection check to cover wall furniture on the deleted room.
- `updateRoomRect`: after re-clamping openings, re-clamp wall furniture on that room the same way (`offset: clampOffset(f.offset, f.size.width, edge.length)`).
- `setApartment`: after computing the new apartment, map furniture — floor items get `position: clampFloorItemPosition(f.position, f.rotation, f.size, apartment)`, wall items get `elevation: roundCm(clamp(f.elevation, 0, Math.max(0, apartment.wallHeight - f.size.height)))`.

- [ ] **Step 4: Run tests** — `npx vitest run src/store/planStore.test.ts` — expected: PASS. Then `npm test` and `npx tsc --noEmit` — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/store src/model
git commit -m "feat: store actions for furniture placement, editing, and room finishes"
```

---

### Task 5: 2D symbols — renderer-agnostic path commands

**Files:**
- Create: `src/editor2d/symbols.ts`
- Test: `src/editor2d/symbols.test.ts`

**Interfaces:**
- Consumes: `CATALOG` from catalog (test only — the module itself is dependency-free).
- Produces (painted by Pixi in Task 8, rendered as SVG icons in Task 6):
  - `type SymbolCmd = { kind: 'rect'; x: number; y: number; w: number; h: number } | { kind: 'line'; x1: number; y1: number; x2: number; y2: number } | { kind: 'circle'; cx: number; cy: number; r: number }`
  - `symbolPaths(symbolId: string, w: number, h: number): SymbolCmd[] | null` — architectural top-view outline drawn in a `w × h` box centered on the origin, **back of the item at −h/2** (the wall side), front at +h/2; `null` for unknown ids.
  - `SYMBOL_IDS: string[]`

- [ ] **Step 1: Write failing tests**

Create `src/editor2d/symbols.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CATALOG } from '../model/catalog'
import { SYMBOL_IDS, symbolPaths } from './symbols'

describe('symbolPaths', () => {
  it('covers every catalog symbolId', () => {
    for (const c of CATALOG) expect(SYMBOL_IDS, c.symbolId).toContain(c.symbolId)
  })

  it('returns null for unknown ids', () => {
    expect(symbolPaths('nope', 10, 10)).toBeNull()
  })

  it('every symbol emits commands that stay inside its box', () => {
    for (const id of SYMBOL_IDS) {
      const cmds = symbolPaths(id, 40, 30)!
      expect(cmds.length).toBeGreaterThan(0)
      for (const c of cmds) {
        const xs = c.kind === 'rect' ? [c.x, c.x + c.w] : c.kind === 'line' ? [c.x1, c.x2] : [c.cx - c.r, c.cx + c.r]
        const ys = c.kind === 'rect' ? [c.y, c.y + c.h] : c.kind === 'line' ? [c.y1, c.y2] : [c.cy - c.r, c.cy + c.r]
        for (const x of xs) expect(Math.abs(x), id).toBeLessThanOrEqual(20.01)
        for (const y of ys) expect(Math.abs(y), id).toBeLessThanOrEqual(15.01)
      }
    }
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/editor2d/symbols.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/editor2d/symbols.ts`:

```ts
export type SymbolCmd =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }

const rect = (x: number, y: number, w: number, h: number): SymbolCmd => ({ kind: 'rect', x, y, w, h })
const line = (x1: number, y1: number, x2: number, y2: number): SymbolCmd => ({ kind: 'line', x1, y1, x2, y2 })
const circle = (cx: number, cy: number, r: number): SymbolCmd => ({ kind: 'circle', cx, cy, r })
const box = (w: number, h: number) => rect(-w / 2, -h / 2, w, h)

type SymbolFn = (w: number, h: number) => SymbolCmd[]

// back (wall side) at −h/2, front at +h/2
const SYMBOLS: Record<string, SymbolFn> = {
  'bed-double': (w, h) => [
    box(w, h),
    rect(-w * 0.42, -h * 0.45, w * 0.36, h * 0.18), // pillows at the headboard
    rect(w * 0.06, -h * 0.45, w * 0.36, h * 0.18),
    line(-w / 2, -h * 0.15, w / 2, -h * 0.15), // blanket fold
  ],
  'bed-single': (w, h) => [
    box(w, h),
    rect(-w * 0.35, -h * 0.45, w * 0.7, h * 0.18),
    line(-w / 2, -h * 0.15, w / 2, -h * 0.15),
  ],
  wardrobe: (w, h) => [box(w, h), line(-w / 2, 0, w / 2, 0), line(0, -h / 4, 0, h / 4)],
  nightstand: (w, h) => [box(w, h), circle(0, 0, Math.min(w, h) * 0.15)],
  dresser: (w, h) => [box(w, h), circle(-w * 0.2, 0, Math.min(w, h) * 0.08), circle(w * 0.2, 0, Math.min(w, h) * 0.08)],
  sofa: (w, h) => [
    box(w, h),
    rect(-w / 2, -h / 2, w, h * 0.22), // back rest
    rect(-w / 2, -h / 2, w * 0.12, h), // arms
    rect(w / 2 - w * 0.12, -h / 2, w * 0.12, h),
    line(0, -h / 2 + h * 0.22, 0, h / 2), // cushion split
  ],
  armchair: (w, h) => [
    box(w, h),
    rect(-w / 2, -h / 2, w, h * 0.22),
    rect(-w / 2, -h / 2, w * 0.15, h),
    rect(w / 2 - w * 0.15, -h / 2, w * 0.15, h),
  ],
  'coffee-table': (w, h) => [box(w, h), rect(-w * 0.4, -h * 0.35, w * 0.8, h * 0.7)],
  'tv-stand': (w, h) => [box(w, h), rect(-w * 0.35, -h * 0.2, w * 0.7, h * 0.25)],
  bookshelf: (w, h) => [box(w, h), line(-w / 6, -h / 2, -w / 6, h / 2), line(w / 6, -h / 2, w / 6, h / 2)],
  'dining-table': (w, h) => [box(w, h), rect(-w * 0.42, -h * 0.38, w * 0.84, h * 0.76)],
  chair: (w, h) => [box(w, h), rect(-w / 2, -h / 2, w, h * 0.18)],
  counter: (w, h) => [box(w, h), line(-w / 2, -h / 2 + h * 0.25, w / 2, -h / 2 + h * 0.25)],
  fridge: (w, h) => [box(w, h), line(-w / 2, h * 0.3, w / 2, h * 0.3)],
  washer: (w, h) => [box(w, h), circle(0, 0, Math.min(w, h) * 0.32)],
  toilet: (w, h) => [rect(-w / 2, -h / 2, w, h * 0.3), circle(0, h * 0.15, Math.min(w, h * 0.7) * 0.42)],
  sink: (w, h) => [box(w, h), circle(0, 0, Math.min(w, h) * 0.28), circle(0, -h * 0.3, Math.min(w, h) * 0.06)],
  bathtub: (w, h) => [box(w, h), rect(-w * 0.42, -h * 0.32, w * 0.84, h * 0.64), circle(-w * 0.32, 0, Math.min(w, h) * 0.08)],
  shower: (w, h) => [box(w, h), line(-w / 2, -h / 2, w / 2, h / 2), line(-w / 2, h / 2, w / 2, -h / 2)],
  rug: (w, h) => [box(w, h), rect(-w * 0.42, -h * 0.42, w * 0.84, h * 0.84)],
  plant: (w, h) => [
    circle(0, 0, Math.min(w, h) * 0.48),
    line(0, 0, 0, -h * 0.4), line(0, 0, w * 0.34, h * 0.2), line(0, 0, -w * 0.34, h * 0.2),
  ],
  'floor-lamp': (w, h) => [
    circle(0, 0, Math.min(w, h) * 0.48),
    line(-w * 0.3, -h * 0.3, w * 0.3, h * 0.3), line(-w * 0.3, h * 0.3, w * 0.3, -h * 0.3),
  ],
  'wall-art': (w, h) => [box(w, h), rect(-w * 0.4, -h * 0.3, w * 0.8, h * 0.6)],
  'wall-shelf': (w, h) => [box(w, h), line(-w / 2, 0, w / 2, 0)],
}

export const SYMBOL_IDS = Object.keys(SYMBOLS)

export function symbolPaths(symbolId: string, w: number, h: number): SymbolCmd[] | null {
  const fn = SYMBOLS[symbolId]
  return fn ? fn(w, h) : null
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/editor2d/symbols.test.ts` — expected: PASS (the bounds test tolerates ±0.01; adjust geometry, not the tolerance, if something leaks out).

- [ ] **Step 5: Commit**

```bash
git add src/editor2d
git commit -m "feat: renderer-agnostic 2D furniture symbols"
```

---

### Task 6: Catalog panel UI

**Files:**
- Create: `src/ui/CatalogPanel.tsx`
- Modify: `src/ui/Toolbar.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/app.css`
- Test: `src/ui/CatalogPanel.test.tsx`

**Interfaces:**
- Consumes: `CATALOG`, `Category` from catalog; `symbolPaths` from symbols; store `placingFurniture` / `setPlacingFurniture` / `catalogOpen` / `setCatalogOpen`.
- Produces: `<CatalogPanel />` — left-side panel, category tabs, item buttons with inline-SVG symbol icons; clicking an item toggles placement mode for it. Toolbar gains a "Furniture" toggle. Panel renders only in 2D mode with `catalogOpen`.

- [ ] **Step 1: Write failing component tests**

Create `src/ui/CatalogPanel.test.tsx` (follow the render/reset patterns in `src/ui/App.test.tsx`):

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { CatalogPanel } from './CatalogPanel'

describe('CatalogPanel', () => {
  beforeEach(() => {
    usePlanStore.setState({ placingFurniture: null, placing: null, selection: null })
  })

  it('shows bedroom items by default and switches categories', () => {
    render(<CatalogPanel />)
    expect(screen.getByRole('button', { name: /double bed/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /bathroom/i }))
    expect(screen.getByRole('button', { name: /bathtub/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /double bed/i })).not.toBeInTheDocument()
  })

  it('clicking an item arms placement; clicking again disarms', () => {
    render(<CatalogPanel />)
    const bed = screen.getByRole('button', { name: /double bed/i })
    fireEvent.click(bed)
    expect(usePlanStore.getState().placingFurniture).toBe('bed-double')
    fireEvent.click(bed)
    expect(usePlanStore.getState().placingFurniture).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/ui/CatalogPanel.test.tsx` — expected: FAIL.

- [ ] **Step 3: Implement the panel**

Create `src/ui/CatalogPanel.tsx`:

```tsx
import { useState } from 'react'
import { CATALOG, type CatalogItem, type Category } from '../model/catalog'
import { symbolPaths } from '../editor2d/symbols'
import { usePlanStore } from '../store/planStore'

const CATEGORIES: Array<[Category, string]> = [
  ['bedroom', 'Bedroom'],
  ['living', 'Living'],
  ['kitchen', 'Kitchen'],
  ['bathroom', 'Bathroom'],
  ['decor', 'Decor'],
]

function SymbolIcon({ item }: { item: CatalogItem }) {
  const scale = 36 / Math.max(item.defaultSize.width, item.defaultSize.depth)
  const w = item.defaultSize.width * scale
  const h = item.defaultSize.depth * scale
  const cmds = symbolPaths(item.symbolId, w, h) ?? []
  return (
    <svg viewBox="-22 -22 44 44" width={44} height={44} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth={1.4}>
        {cmds.map((c, i) =>
          c.kind === 'rect' ? (
            <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} />
          ) : c.kind === 'line' ? (
            <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} />
          ) : (
            <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
          ),
        )}
      </g>
    </svg>
  )
}

export function CatalogPanel() {
  const [category, setCategory] = useState<Category>('bedroom')
  const placingFurniture = usePlanStore((s) => s.placingFurniture)
  const setPlacingFurniture = usePlanStore((s) => s.setPlacingFurniture)

  return (
    <aside className="catalog">
      <div className="catalog-tabs" role="tablist">
        {CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={category === id}
            className={category === id ? 'active' : ''}
            onClick={() => setCategory(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="catalog-items">
        {CATALOG.filter((c) => c.category === category).map((item) => (
          <button
            key={item.id}
            className={placingFurniture === item.id ? 'active' : ''}
            onClick={() => setPlacingFurniture(placingFurniture === item.id ? null : item.id)}
          >
            <SymbolIcon item={item} />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
```

In `src/ui/Toolbar.tsx`, after the "+ Window" button add:

```tsx
<button
  className={catalogOpen ? 'active' : ''}
  disabled={mode !== '2d'}
  onClick={() => setCatalogOpen(!catalogOpen)}
>
  Furniture
</button>
```

with `const catalogOpen = usePlanStore((s) => s.catalogOpen)` and `const setCatalogOpen = usePlanStore((s) => s.setCatalogOpen)`.

In `src/ui/App.tsx`, render the panel inside `.main`, before `.canvas-area`:

```tsx
{mode === '2d' && catalogOpen && <CatalogPanel />}
```

(`const catalogOpen = usePlanStore((s) => s.catalogOpen)`.)

In `src/ui/app.css` add:

```css
.catalog {
  width: 190px;
  overflow-y: auto;
  border-right: 1px solid #d8dce1;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.catalog-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px;
  border-bottom: 1px solid #e3e6ea;
}
.catalog-tabs button {
  font-size: 11px;
  padding: 3px 7px;
}
.catalog-items {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 8px;
}
.catalog-items button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  padding: 6px 2px;
}
.catalog button.active {
  outline: 2px solid #1d4ed8;
}
```

(Match the existing button styling conventions in `app.css` — reuse its `button` base rules.)

- [ ] **Step 4: Run tests** — `npx vitest run src/ui/CatalogPanel.test.tsx` and `npx vitest run src/ui/App.test.tsx` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat: furniture catalog panel with category tabs and symbol icons"
```

---

### Task 7: 2D placement mode — ghost, validity, click-to-place

**Files:**
- Modify: `src/editor2d/Editor2D.tsx`
- Modify: `src/editor2d/render.ts`
- Test: `src/editor2d/render.test.ts` (create — pure paint helpers only)

**Interfaces:**
- Consumes: store `placingFurniture` / `placeFurniture` / `setPlacingFurniture`; `catalogItem`; `snapFloorItemToWall`, `floorItemCollides`, `floorItemInBounds`; `nearestEdge` (existing); `symbolPaths`.
- Produces:
  - In `render.ts`: `paintSymbol(g: Graphics, cmds: SymbolCmd[]): void` and `drawFurnitureGhost(g: Graphics, ghost: FurnitureGhost | null, viewport: Viewport): void` with `interface FurnitureGhost { catalogId: string; position: Vec2; rotation: number; valid: boolean }`
  - Editor behavior: with `placingFurniture` set — floor items: ghost follows cursor (wall-snapped unless Alt), red when invalid, valid click places and exits mode, invalid click no-op; wall items: reuse the green edge highlight, click attaches to the nearest edge; Escape exits placement mode. Cursor is crosshair in either placement mode.

- [ ] **Step 1: Write tests for the pure paint helpers**

Create `src/editor2d/render.test.ts`:

```ts
import { Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { symbolPaths } from './symbols'
import { drawFurnitureGhost, paintSymbol } from './render'

describe('paintSymbol', () => {
  it('replays every command kind onto a Graphics without throwing', () => {
    const g = new Graphics()
    paintSymbol(g, symbolPaths('sofa', 40, 20)!)
    paintSymbol(g, [{ kind: 'circle', cx: 0, cy: 0, r: 5 }])
    expect(g).toBeTruthy()
  })
})

describe('drawFurnitureGhost', () => {
  const viewport = { scale: 50, offsetX: 0, offsetY: 0 }
  it('handles null, valid and invalid ghosts', () => {
    const g = new Graphics()
    drawFurnitureGhost(g, null, viewport)
    drawFurnitureGhost(g, { catalogId: 'sofa-3seat', position: { x: 2, y: 2 }, rotation: 90, valid: true }, viewport)
    drawFurnitureGhost(g, { catalogId: 'sofa-3seat', position: { x: 2, y: 2 }, rotation: 0, valid: false }, viewport)
    expect(g).toBeTruthy()
  })
})
```

(Smoke-level by design: Pixi Graphics builds paths without a renderer in jsdom; visual checks happen in Task 14's E2E.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/editor2d/render.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement paint helpers**

In `src/editor2d/render.ts` add:

```ts
import { symbolPaths, type SymbolCmd } from './symbols'
import { catalogItem } from '../model/catalog'

export function paintSymbol(g: Graphics, cmds: SymbolCmd[]) {
  for (const c of cmds) {
    if (c.kind === 'rect') g.rect(c.x, c.y, c.w, c.h)
    else if (c.kind === 'line') g.moveTo(c.x1, c.y1).lineTo(c.x2, c.y2)
    else g.circle(c.cx, c.cy, c.r)
  }
}

export interface FurnitureGhost {
  catalogId: string
  position: Vec2
  rotation: number
  valid: boolean
}

const GHOST_VALID = 0x1d4ed8
const GHOST_INVALID = 0xe07a5f

export function drawFurnitureGhost(g: Graphics, ghost: FurnitureGhost | null, viewport: Viewport) {
  g.clear()
  g.rotation = 0
  g.position.set(0, 0)
  if (!ghost) return
  const cat = catalogItem(ghost.catalogId)
  if (!cat) return
  const w = cat.defaultSize.width * viewport.scale
  const h = cat.defaultSize.depth * viewport.scale
  const cmds = symbolPaths(cat.symbolId, w, h)
  if (!cmds) return
  const color = ghost.valid ? GHOST_VALID : GHOST_INVALID
  const s = worldToScreen(viewport, ghost.position)
  g.position.set(s.x, s.y)
  g.rotation = (ghost.rotation * Math.PI) / 180
  g.rect(-w / 2, -h / 2, w, h).fill({ color, alpha: 0.12 })
  paintSymbol(g, cmds)
  g.stroke({ width: 1.5, color, alpha: 0.8 })
}
```

Add `Vec2` to the type imports.

- [ ] **Step 4: Run tests** — `npx vitest run src/editor2d/render.test.ts` — expected: PASS.

- [ ] **Step 5: Wire placement mode into Editor2D**

In `src/editor2d/Editor2D.tsx`:

1. New imports: `catalogItem` from `../model/catalog`; `floorItemCollides`, `floorItemInBounds`, `snapFloorItemToWall` from `../model/furniture`; `drawFurnitureGhost`, and (existing line) extend with `type FurnitureGhost` from `./render`.
2. Add a `ghost` layer: `ghost: new Graphics()` in the `layers` object, added to the stage between `edgeHighlight` and `guides`.
3. Local state next to `hoverEdge`: `let ghost: FurnitureGhost | null = null`.
4. In `pointermove`, BEFORE the `hoverStore.placing` block, handle furniture placement:

```ts
if (hoverStore.placingFurniture) {
  const cat = catalogItem(hoverStore.placingFurniture)
  if (cat?.mount === 'floor') {
    const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
    const snap = altDown ? null : snapFloorItemToWall(world, cat.defaultSize, hoverStore.plan)
    const position = snap?.position ?? world
    const rotation = snap?.rotation ?? 0
    const candidate = { position, rotation, size: cat.defaultSize }
    const valid =
      floorItemInBounds(candidate, hoverStore.plan.apartment) &&
      (cat.layer !== 'solid' || !floorItemCollides(candidate, hoverStore.plan))
    ghost = { catalogId: cat.id, position, rotation, valid }
    hoverEdge = null
  } else if (cat) {
    ghost = null
    hoverEdge = nearestEdge(hoverStore.plan, viewport, { x: e.global.x, y: e.global.y })
  }
  markDirty()
  return
}
```

5. In `pointerdown`, AFTER the `store.placing` block, add:

```ts
if (store.placingFurniture) {
  const cat = catalogItem(store.placingFurniture)
  if (cat?.mount === 'floor') {
    if (ghost?.valid) {
      store.placeFurniture(cat.id, { mount: 'floor', position: ghost.position, rotation: ghost.rotation })
      ghost = null
    }
  } else if (cat) {
    const hit = nearestEdge(store.plan, viewport, screen)
    if (hit) {
      store.placeFurniture(cat.id, { mount: 'wall', roomId: hit.roomId, edgeIndex: hit.edgeIndex, offset: hit.offset })
      hoverEdge = null
    }
  }
  markDirty()
  return
}
```

6. Escape handler: extend the placement-cancel branch — `if (store.placing || store.placingFurniture) { store.setPlacing(null); store.setPlacingFurniture(null); ghost = null } else store.selectRoom(null)`.
7. Ticker: `drawFurnitureGhost(layers.ghost, store.placingFurniture ? ghost : null, viewport)`; edge highlight becomes `drawEdgeHighlight(layers.edgeHighlight, store.placing || store.placingFurniture ? hoverEdge : null, store.plan, viewport)`; cursor line becomes `store.placing || store.placingFurniture ? 'crosshair' : 'default'`.
8. `setPlacingFurniture(null)` transitions leave a stale ghost — also clear `ghost = null` inside the `placing`-armed click-cancel path and when placement succeeds (shown above).

- [ ] **Step 6: Verify** — `npm test` and `npx tsc --noEmit` — expected: clean. Quick manual check: `npm run dev`, add a room, open Furniture, click Double bed, hover the canvas (blue ghost, snaps to walls, red outside the apartment), click to place — the item exists in the store (properties panel switches in Task 10; selection already updates).

- [ ] **Step 7: Commit**

```bash
git add src/editor2d
git commit -m "feat: 2D furniture placement mode with ghost preview"
```

---

### Task 8: 2D furniture rendering, hit-testing, selection, move & drop-revert

**Files:**
- Modify: `src/editor2d/render.ts`
- Modify: `src/editor2d/interactions.ts`
- Modify: `src/editor2d/Editor2D.tsx`
- Test: `src/editor2d/interactions.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 7 outputs; `wallItemSpan`, `collidingFurnitureIds`, `footprintCorners`, `pointInConvexPolygon`.
- Produces:
  - `hitFurniture(plan: Plan, viewport: Viewport, screen: Vec2, radius?: number): string | null` in interactions.ts — topmost first: wall items (segment distance ≤ 8 px), then floor overlay, solid, underlay (point-in-footprint), each latest-placed-first
  - `drawFurniture(container: Container, plan: Plan, selection: Selection | null, viewport: Viewport): void` in render.ts — z-order underlay → solid → wall items; colliding solids `0xe07a5f`, selected `0x1d4ed8`, else `0x39414f`; underlay gets a soft fill; also paints the room floor-material tint is NOT here (that goes in `drawRooms`, below)
  - `drawRooms` gains the floor-material tint: after the room fill, when `room.floorMaterial` resolves via `floorFinish`, overlay `g.rect(...).fill({ color: finish.tint, alpha: 0.35 })`
  - Editor: click selects furniture (openings still win); dragging a floor item moves it (wall-snap unless Alt, guides not shown for furniture), dragging a wall item slides/jumps edges; dropping a colliding solid reverts to the pre-drag pose; Delete deletes selected furniture.

- [ ] **Step 1: Write failing hit-test tests**

Append to `src/editor2d/interactions.test.ts` (reuse its existing `viewport` fixture conventions):

```ts
import { hitFurniture } from './interactions'
import type { FloorItem, WallItem } from '../model/types'

describe('hitFurniture', () => {
  const viewport = { scale: 100, offsetX: 0, offsetY: 0 }
  const sofa: FloorItem = { id: 'sofa', catalogId: 'sofa-3seat', mount: 'floor',
    position: { x: 2, y: 2 }, rotation: 0, size: { width: 2.2, depth: 0.95, height: 0.85 } }
  const rugUnder: FloorItem = { id: 'rug', catalogId: 'rug-rect', mount: 'floor',
    position: { x: 2, y: 2 }, rotation: 0, size: { width: 3, depth: 2, height: 0.01 } }
  const room = { id: 'r1', name: 'A', color: '#8ecae6', polygon: [
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 } ] }
  const art: WallItem = { id: 'art', catalogId: 'wall-art', mount: 'wall', roomId: 'r1',
    edgeIndex: 0, offset: 2, elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 } }
  const plan = { ...createDefaultPlan(), rooms: [room], furniture: [rugUnder, sofa, art] }

  it('solid wins over underlay at the same point', () => {
    expect(hitFurniture(plan, viewport, { x: 200, y: 200 })).toBe('sofa')
  })
  it('exposed rug is hit where the sofa is not', () => {
    expect(hitFurniture(plan, viewport, { x: 200, y: 280 })).toBe('rug')
  })
  it('wall item hit by proximity to its span', () => {
    expect(hitFurniture(plan, viewport, { x: 200, y: 4 })).toBe('art')
  })
  it('misses empty space and respects rotation', () => {
    expect(hitFurniture(plan, viewport, { x: 390, y: 290 })).toBeNull()
    const rotated = { ...plan, furniture: [{ ...sofa, rotation: 90 }] }
    expect(hitFurniture(rotated, viewport, { x: 200, y: 290 })).toBe('sofa') // depth now along x
    expect(hitFurniture(rotated, viewport, { x: 290, y: 200 })).toBeNull()
  })
})
```

Add `createDefaultPlan` to the test file's imports if missing.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/editor2d/interactions.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement hit-testing**

Append to `src/editor2d/interactions.ts`:

```ts
import { catalogItem, type Layer } from '../model/catalog'
import { footprintCorners, pointInConvexPolygon, wallItemSpan } from '../model/furniture'
import type { FloorItem, WallItem } from '../model/types'

export function hitFurniture(plan: Plan, viewport: Viewport, screen: Vec2, radius = 8): string | null {
  // wall items are topmost
  for (let i = plan.furniture.length - 1; i >= 0; i--) {
    const item = plan.furniture[i]
    if (item.mount !== 'wall') continue
    const room = plan.rooms.find((r) => r.id === item.roomId)
    const span = room ? wallItemSpan(item, room) : null
    if (!span) continue
    const a = worldToScreen(viewport, span.a)
    const b = worldToScreen(viewport, span.b)
    if (distToSegmentScreen(screen, a, b) <= radius) return item.id
  }
  const world = screenToWorld(viewport, screen)
  const hitLayer = (layer: Layer): string | null => {
    for (let i = plan.furniture.length - 1; i >= 0; i--) {
      const item = plan.furniture[i]
      if (item.mount !== 'floor' || catalogItem(item.catalogId)?.layer !== layer) continue
      if (pointInConvexPolygon(world, footprintCorners(item.position, item.rotation, item.size))) return item.id
    }
    return null
  }
  return hitLayer('overlay') ?? hitLayer('solid') ?? hitLayer('underlay')
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/editor2d/interactions.test.ts` — expected: PASS.

- [ ] **Step 5: Implement rendering**

In `src/editor2d/render.ts` add (imports: `collidingFurnitureIds`, `wallItemSpan` from `../model/furniture`; `floorFinish` already needed for the room tint):

```ts
const FURNITURE_COLOR = 0x39414f
const FURNITURE_SELECTED = 0x1d4ed8
const FURNITURE_WARNING = 0xe07a5f

export function drawFurniture(container: Container, plan: Plan, selection: Selection | null, viewport: Viewport) {
  for (const child of container.removeChildren()) child.destroy(true)
  const colliding = collidingFurnitureIds(plan)
  const layerRank = (item: PlacedItem) => {
    if (item.mount === 'wall') return 2
    return catalogItem(item.catalogId)?.layer === 'underlay' ? 0 : 1
  }
  const ordered = [...plan.furniture].sort((a, b) => layerRank(a) - layerRank(b))

  for (const item of ordered) {
    const cat = catalogItem(item.catalogId)
    if (!cat) continue
    const selected = selection?.kind === 'furniture' && selection.id === item.id
    const color = selected ? FURNITURE_SELECTED : colliding.has(item.id) ? FURNITURE_WARNING : FURNITURE_COLOR
    const g = new Graphics()

    if (item.mount === 'floor') {
      const w = item.size.width * viewport.scale
      const h = item.size.depth * viewport.scale
      const cmds = symbolPaths(cat.symbolId, w, h)
      if (!cmds) continue
      if (cat.layer === 'underlay') g.rect(-w / 2, -h / 2, w, h).fill({ color: 0xd8cfc0, alpha: 0.5 })
      if (selected) g.rect(-w / 2, -h / 2, w, h).fill({ color, alpha: 0.08 })
      paintSymbol(g, cmds)
      g.stroke({ width: selected ? 2.5 : 1.5, color })
      const s = worldToScreen(viewport, item.position)
      g.position.set(s.x, s.y)
      g.rotation = (item.rotation * Math.PI) / 180
    } else {
      const room = plan.rooms.find((r) => r.id === item.roomId)
      const span = room ? wallItemSpan(item, room) : null
      if (!span) continue
      const a = worldToScreen(viewport, span.a)
      const b = worldToScreen(viewport, span.b)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const px = -dy / len
      const py = dx / len
      const off = 5 // draw just inside the room
      g.moveTo(a.x + px * off, a.y + py * off).lineTo(b.x + px * off, b.y + py * off)
      g.moveTo(a.x + px * 2, a.y + py * 2).lineTo(a.x + px * (off + 3), a.y + py * (off + 3))
      g.moveTo(b.x + px * 2, b.y + py * 2).lineTo(b.x + px * (off + 3), b.y + py * (off + 3))
      g.stroke({ width: selected ? 3 : 2, color })
    }
    container.addChild(g)
  }
}
```

In `drawRooms`, right after the existing room-rect fill+stroke, add the floor tint (import `floorFinish` from `../model/catalog`):

```ts
const finish = room.floorMaterial ? floorFinish(room.floorMaterial) : undefined
if (finish) {
  const tintG = new Graphics()
  tintG.rect(tl.x, tl.y, w, h).fill({ color: finish.tint, alpha: 0.35 })
  container.addChild(tintG)
}
```

- [ ] **Step 6: Wire selection + drag into Editor2D**

In `src/editor2d/Editor2D.tsx`:

1. Extend `DragState`:

```ts
| { kind: 'moveFloorItem'; itemId: string; grabOffset: Vec2; start: { position: Vec2; rotation: number } }
| { kind: 'moveWallItem'; itemId: string }
```

2. Add a `furniture` Container layer between `rooms` and `openings`: `furniture: new Container()`.
3. `pointerdown` — after the `hitOpening` block, before the room-handle block:

```ts
const furnitureId = hitFurniture(store.plan, viewport, screen)
if (furnitureId) {
  const item = store.plan.furniture.find((f) => f.id === furnitureId)!
  store.selectFurniture(furnitureId)
  if (item.mount === 'floor') {
    drag = {
      kind: 'moveFloorItem', itemId: furnitureId,
      grabOffset: { x: world.x - item.position.x, y: world.y - item.position.y },
      start: { position: item.position, rotation: item.rotation },
    }
  } else {
    drag = { kind: 'moveWallItem', itemId: furnitureId }
  }
  markDirty()
  return
}
```

4. `pointermove` — new drag branches (mirroring the existing ones):

```ts
if (drag.kind === 'moveFloorItem') {
  const activeDrag = drag
  const store = usePlanStore.getState()
  const item = store.plan.furniture.find((f) => f.id === activeDrag.itemId)
  if (!item || item.mount !== 'floor') return
  const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
  const raw = { x: world.x - activeDrag.grabOffset.x, y: world.y - activeDrag.grabOffset.y }
  const snap = altDown ? null : snapFloorItemToWall(raw, item.size, store.plan)
  if (snap) store.moveFloorItem(activeDrag.itemId, snap.position, snap.rotation)
  else store.moveFloorItem(activeDrag.itemId, { x: roundCm(raw.x), y: roundCm(raw.y) })
  markDirty()
}

if (drag.kind === 'moveWallItem') {
  const activeDrag = drag
  const store = usePlanStore.getState()
  const hit = nearestEdge(store.plan, viewport, { x: e.global.x, y: e.global.y }, 20)
  if (hit) store.moveWallItem(activeDrag.itemId, hit.roomId, hit.edgeIndex, hit.offset)
  markDirty()
}
```

5. Drop-revert — extend `endInteraction`:

```ts
const endInteraction = () => {
  panning = null
  if (drag.kind === 'moveFloorItem') {
    const store = usePlanStore.getState()
    const item = store.plan.furniture.find((f) => f.id === drag.itemId)
    if (item && isSolidFloorItem(item) && floorItemCollides(item, store.plan, item.id)) {
      store.moveFloorItem(item.id, drag.start.position, drag.start.rotation)
    }
  }
  if (drag.kind !== 'idle' || guides.length > 0) {
    drag = { kind: 'idle' }
    guides = []
    markDirty()
  }
}
```

(import `isSolidFloorItem` from `../model/furniture`.)

6. Delete key: add `else if (store.selection?.kind === 'furniture') store.deleteFurniture(store.selection.id)` to the Delete/Backspace handler.
7. Ticker: after `drawRooms(...)` add `drawFurniture(layers.furniture, store.plan, store.selection, viewport)`.

- [ ] **Step 7: Verify** — `npm test`, `npx tsc --noEmit` — clean. Manual: place two sofas, drag one onto the other (turns red while dragging, snaps back on release), drag against a wall (aligns flush), place a rug under a sofa, click exposed rug (selects rug), Delete removes it.

- [ ] **Step 8: Commit**

```bash
git add src/editor2d
git commit -m "feat: 2D furniture render, selection, drag with wall snap and drop-revert"
```

---

### Task 9: Rotation handle

**Files:**
- Modify: `src/editor2d/interactions.ts`
- Modify: `src/editor2d/render.ts`
- Modify: `src/editor2d/Editor2D.tsx`
- Test: `src/editor2d/interactions.test.ts` (extend)

**Interfaces:**
- Consumes: `FloorItem`, viewport transforms, `ROTATION_SNAP_DEG`.
- Produces:
  - `rotationHandleScreen(item: FloorItem, viewport: Viewport): Vec2` — 24 px beyond the footprint's top-center (local −y direction, rotated with the item)
  - `hitRotationHandle(item: FloorItem, viewport: Viewport, screen: Vec2, radius?: number): boolean` (radius 9)
  - `rotationFromPointer(item: FloorItem, viewport: Viewport, screen: Vec2, snap: boolean): number` — pointer angle around the item center, 0° when the pointer is straight "up" from the center; snapped to 15° when `snap`
  - `drawRotationHandle(g: Graphics, item: FloorItem | null, viewport: Viewport): void`
  - Editor: dragging the handle rotates the selected floor item live (15° ticks; Shift = free), with drop-revert reusing the Task 8 pattern.

- [ ] **Step 1: Write failing tests**

Append to `src/editor2d/interactions.test.ts`:

```ts
import { hitRotationHandle, rotationFromPointer, rotationHandleScreen } from './interactions'

describe('rotation handle', () => {
  const viewport = { scale: 100, offsetX: 0, offsetY: 0 }
  const item: FloorItem = { id: 'a', catalogId: 'sofa-3seat', mount: 'floor',
    position: { x: 2, y: 2 }, rotation: 0, size: { width: 2, depth: 1, height: 0.8 } }

  it('sits 24px above the footprint top at rotation 0', () => {
    expect(rotationHandleScreen(item, viewport)).toEqual({ x: 200, y: 150 - 24 })
  })
  it('rotates with the item', () => {
    const p = rotationHandleScreen({ ...item, rotation: 90 }, viewport)
    expect(p.x).toBeCloseTo(200 + 50 + 24)
    expect(p.y).toBeCloseTo(200)
  })
  it('hit within 9px', () => {
    expect(hitRotationHandle(item, viewport, { x: 202, y: 128 })).toBe(true)
    expect(hitRotationHandle(item, viewport, { x: 220, y: 128 })).toBe(false)
  })
  it('pointer angle → rotation, snapped and free', () => {
    expect(rotationFromPointer(item, viewport, { x: 200, y: 100 }, true)).toBe(0)
    expect(rotationFromPointer(item, viewport, { x: 300, y: 200 }, true)).toBe(90)
    expect(rotationFromPointer(item, viewport, { x: 300, y: 208 }, true)).toBe(90) // snaps
    const free = rotationFromPointer(item, viewport, { x: 300, y: 208 }, false)
    expect(free).toBeGreaterThan(90)
    expect(free).toBeLessThan(95)
  })
})
```

- [ ] **Step 2: Run to verify failure** — expected: FAIL.

- [ ] **Step 3: Implement**

Append to `src/editor2d/interactions.ts` (import `ROTATION_SNAP_DEG` from `../model/furniture`, `normalizeDeg`, `roundDeg` from `../model/geometry`):

```ts
export function rotationHandleScreen(item: FloorItem, viewport: Viewport): Vec2 {
  const t = (item.rotation * Math.PI) / 180
  const dir = { x: Math.sin(t), y: -Math.cos(t) } // local (0,-1) rotated
  const topCenter = {
    x: item.position.x + dir.x * (item.size.depth / 2),
    y: item.position.y + dir.y * (item.size.depth / 2),
  }
  const s = worldToScreen(viewport, topCenter)
  return { x: s.x + dir.x * 24, y: s.y + dir.y * 24 }
}

export function hitRotationHandle(item: FloorItem, viewport: Viewport, screen: Vec2, radius = 9): boolean {
  const p = rotationHandleScreen(item, viewport)
  return Math.hypot(p.x - screen.x, p.y - screen.y) <= radius
}

export function rotationFromPointer(item: FloorItem, viewport: Viewport, screen: Vec2, snap: boolean): number {
  const c = worldToScreen(viewport, item.position)
  const deg = (Math.atan2(screen.y - c.y, screen.x - c.x) * 180) / Math.PI + 90
  const snapped = snap ? Math.round(deg / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG : deg
  return roundDeg(normalizeDeg(snapped))
}
```

In `src/editor2d/render.ts` add:

```ts
import { rotationHandleScreen } from './interactions'

export function drawRotationHandle(g: Graphics, item: FloorItem | null, viewport: Viewport) {
  g.clear()
  if (!item) return
  const t = (item.rotation * Math.PI) / 180
  const dir = { x: Math.sin(t), y: -Math.cos(t) }
  const top = worldToScreen(viewport, {
    x: item.position.x + dir.x * (item.size.depth / 2),
    y: item.position.y + dir.y * (item.size.depth / 2),
  })
  const p = rotationHandleScreen(item, viewport)
  g.moveTo(top.x, top.y).lineTo(p.x, p.y).stroke({ width: 1.5, color: 0x1d4ed8 })
  g.circle(p.x, p.y, 6).fill({ color: 0xffffff }).stroke({ width: 1.5, color: 0x1d4ed8 })
}
```

In `src/editor2d/Editor2D.tsx`:

1. Add `| { kind: 'rotateFurniture'; itemId: string; start: { position: Vec2; rotation: number } }` to `DragState`; add `let shiftDown = false` next to `altDown`, maintained in `onKeyDown`/`onKeyUp` via `shiftDown = ev.shiftKey`.
2. Add a `furnitureHandles: new Graphics()` layer after `handles`.
3. `pointerdown` — BEFORE the `hitOpening` block (the handle floats above everything):

```ts
const selFurniture =
  store.selection?.kind === 'furniture'
    ? store.plan.furniture.find((f) => f.id === store.selection!.id)
    : undefined
if (selFurniture?.mount === 'floor' && hitRotationHandle(selFurniture, viewport, screen)) {
  drag = { kind: 'rotateFurniture', itemId: selFurniture.id, start: { position: selFurniture.position, rotation: selFurniture.rotation } }
  return
}
```

4. `pointermove` branch:

```ts
if (drag.kind === 'rotateFurniture') {
  const activeDrag = drag
  const store = usePlanStore.getState()
  const item = store.plan.furniture.find((f) => f.id === activeDrag.itemId)
  if (!item || item.mount !== 'floor') return
  store.rotateFurniture(activeDrag.itemId, rotationFromPointer(item, viewport, { x: e.global.x, y: e.global.y }, !shiftDown))
  markDirty()
}
```

5. `endInteraction`: extend the drop-revert check to also cover `drag.kind === 'rotateFurniture'` (same collide-then-revert using `drag.start`). Factor the shared revert into a small local function `revertIfColliding(itemId: string, start: { position: Vec2; rotation: number })` used by both branches.
6. Ticker: `drawRotationHandle(layers.furnitureHandles, selectedFloorItem, viewport)` where `selectedFloorItem` is derived like `selectedRoom` but for `selection.kind === 'furniture'` with `mount === 'floor'` (null otherwise). Also cancel-on-Escape already resets `drag` — rotation included.

- [ ] **Step 4: Verify** — `npx vitest run src/editor2d/interactions.test.ts`, then `npm test`, `npx tsc --noEmit` — clean. Manual: select a sofa, drag the circle handle — 15° ticks; hold Shift — free rotation; rotate into another sofa and release — snaps back.

- [ ] **Step 5: Commit**

```bash
git add src/editor2d
git commit -m "feat: furniture rotation handle with 15-degree ticks"
```

---

### Task 10: Properties panel — furniture editing and room finishes

**Files:**
- Modify: `src/ui/PropertiesPanel.tsx`
- Modify: `src/ui/app.css`
- Test: `src/ui/PropertiesPanel.test.tsx` (create)

**Interfaces:**
- Consumes: store actions from Task 4; `catalogItem`, `FLOOR_MATERIALS`.
- Produces: selecting furniture shows a `FurnitureProps` section — catalog name as heading, Width/Depth/Height NumberFields, floor items get Rotation + X/Y, wall items get Offset + Elevation, color input + Reset when the catalog entry has `recolorMaterial`, Delete button. `RoomProps` gains a "Floor" swatch row (None + 6 finishes) and a "Wall color" input with Reset.

- [ ] **Step 1: Write failing component tests**

Create `src/ui/PropertiesPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultPlan } from '../model/serialization'
import { usePlanStore } from '../store/planStore'
import { PropertiesPanel } from './PropertiesPanel'

describe('PropertiesPanel — furniture', () => {
  beforeEach(() => {
    usePlanStore.setState({ plan: createDefaultPlan(), selection: null, placing: null, placingFurniture: null })
  })

  const placeSofa = () =>
    usePlanStore.getState().placeFurniture('sofa-3seat', { mount: 'floor', position: { x: 5, y: 4 }, rotation: 0 })

  it('shows the catalog name and size fields for a selected floor item', () => {
    placeSofa()
    render(<PropertiesPanel />)
    expect(screen.getByRole('heading', { name: 'Sofa (3-seat)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Width (m)')).toHaveValue(2.2)
    expect(screen.getByLabelText('Rotation (°)')).toHaveValue(0)
  })

  it('resize commits clamp to catalog bounds', () => {
    const id = placeSofa()
    render(<PropertiesPanel />)
    const width = screen.getByLabelText('Width (m)')
    fireEvent.change(width, { target: { value: '99' } })
    fireEvent.blur(width)
    expect(usePlanStore.getState().plan.furniture[0].size.width).toBe(2.8)
    void id
  })

  it('wall items expose offset and elevation', () => {
    const st = usePlanStore.getState()
    const roomId = st.addRoom()
    st.placeFurniture('wall-art', { mount: 'wall', roomId, edgeIndex: 0, offset: 1 })
    render(<PropertiesPanel />)
    expect(screen.getByLabelText('Offset (m)')).toBeInTheDocument()
    expect(screen.getByLabelText('Elevation (m)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rotation (°)')).not.toBeInTheDocument()
  })

  it('delete removes the item', () => {
    placeSofa()
    render(<PropertiesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(usePlanStore.getState().plan.furniture).toHaveLength(0)
  })

  it('room finishes: floor swatches and wall color with reset', () => {
    const st = usePlanStore.getState()
    const roomId = st.addRoom()
    render(<PropertiesPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Oak' }))
    expect(usePlanStore.getState().plan.rooms[0].floorMaterial).toBe('oak')
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(usePlanStore.getState().plan.rooms[0].floorMaterial).toBeUndefined()
    void roomId
  })
})
```

(If `NumberField` labels associate differently, follow the existing `NumberField.test.tsx` querying pattern instead of `getByLabelText` — keep assertions the same.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/ui/PropertiesPanel.test.tsx` — expected: FAIL.

- [ ] **Step 3: Implement**

In `src/ui/PropertiesPanel.tsx`:

1. Resolve the furniture selection alongside room/opening:

```tsx
const furniture =
  selection?.kind === 'furniture' ? plan.furniture.find((f) => f.id === selection.id) : undefined
```

and render `furniture ? <FurnitureProps item={furniture} /> : …` first in the chain.

2. Add the component:

```tsx
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
```

3. Extend `RoomProps` (before the Delete button):

```tsx
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
```

with the two store hooks added. NOTE: the swatch buttons are `aria-label`ed with the finish name — the test's `getByRole('button', { name: 'Oak' })` relies on it.

4. `app.css`:

```css
.swatches { display: flex; gap: 4px; flex-wrap: wrap; }
.swatches .swatch { width: 22px; height: 22px; padding: 0; border: 1px solid #b9bec6; }
.swatches .active { outline: 2px solid #1d4ed8; }
.color-row { display: flex; gap: 6px; align-items: center; }
```

- [ ] **Step 4: Run tests** — `npx vitest run src/ui/PropertiesPanel.test.tsx`, then `npm test`, `npx tsc --noEmit` — expected: PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat: properties panel for furniture and room finishes"
```

---

### Task 11: Assets — models, floor textures, decoders, credits

**Files:**
- Create: `public/models/*.glb` (one per catalog entry, 24 target)
- Create: `public/models/CREDITS.md`
- Create: `public/textures/floors/{oak,walnut,tile-light,tile-dark,carpet,concrete}.jpg`
- Create: `public/basis/basis_transcoder.js`, `public/basis/basis_transcoder.wasm`
- Create: `scripts/inspect-models.mjs` (tiny helper, committed)
- Modify: `src/model/catalog.ts` (fill `recolorMaterial` / `modelRotationY` per model as discovered)
- Test: `src/model/catalog.assets.test.ts`

This task needs web access and judgment; it has no TDD loop — its gate is the assets test plus visual inspection in Task 12.

**Sourcing rules (per spec):**
- CC0 ONLY. Primary source: Poly Haven (`https://api.polyhaven.com/assets?type=models`, files via `https://api.polyhaven.com/files/<slug>` — pick the glTF download at 1k texture resolution). Secondary: Poly Pizza (CC0-filtered) or any other verifiably CC0 library.
- Pick the model whose proportions are closest to the catalog `defaultSize` (runtime normalization stretches the rest of the way — within `sizeBounds` this must look acceptable).
- If NO acceptable CC0 model exists for an item, REMOVE that catalog entry (and its symbol usage stays harmless) — do not ship placeholder art. Note removals in the task summary.
- Record every file in `public/models/CREDITS.md`: item id, source name + URL, author, license (CC0).

- [ ] **Step 1: Install tooling and copy decoders**

```bash
npm i -D @gltf-transform/cli
mkdir -p public/models public/textures/floors public/basis
cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.js public/basis/
cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm public/basis/
```

- [ ] **Step 2: Acquire and process each model**

For each catalog item: download the source glTF/GLB, then

```bash
npx gltf-transform optimize <in>.glb public/models/<catalog-id>.glb \
  --compress meshopt --texture-compress ktx2 --texture-size 1024
```

Check the result: `ls -la public/models/` — every file ≤ 2.0 MB (re-run with `--texture-size 512` for offenders).

- [ ] **Step 3: Record orientation and recolor slots**

Create `scripts/inspect-models.mjs`:

```js
// Usage: node scripts/inspect-models.mjs public/models/sofa-3seat.glb
// Prints bbox dimensions and material names so catalog metadata can be filled in.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { bounds } from '@gltf-transform/functions'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2])
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
const b = bounds(scene)
console.log('size:', { width: b.max[0] - b.min[0], height: b.max[1] - b.min[1], depth: b.max[2] - b.min[2] })
console.log('materials:', doc.getRoot().listMaterials().map((m) => m.getName()))
```

(`meshoptimizer` arrives with `@gltf-transform/cli`; if not, `npm i -D meshoptimizer`.) For each model note whether its front faces +Z; when it doesn't, set `modelRotationY` on the catalog entry to the quarter-turn correction in radians (e.g. `Math.PI` when it faces −Z). Set `recolorMaterial` to the model's primary fabric/surface material name for: both beds, sofa, armchair, rug (skip any model without a clean single slot). If X/Z dimensions are swapped relative to the catalog width/depth, that is also fixed by `modelRotationY` (bbox is re-measured after rotation at load).

- [ ] **Step 4: Floor textures**

Download 6 tileable 1K JPEG diffuse maps (Poly Haven `type=textures`, categories floor/wood/tiles/carpet/concrete; CC0) and save as the exact paths in `FLOOR_MATERIALS`. Target ≤ 300 KB each (re-encode with `sips -Z 1024` if needed). Add them to `CREDITS.md` too.

- [ ] **Step 5: Write the assets test**

Create `src/model/catalog.assets.test.ts`:

```ts
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG, FLOOR_MATERIALS } from './catalog'

const pub = join(process.cwd(), 'public')

describe('bundled assets', () => {
  it('every catalog model exists and is ≤ 2 MB', () => {
    for (const c of CATALOG) {
      const p = join(pub, c.modelPath)
      expect(existsSync(p), c.modelPath).toBe(true)
      expect(statSync(p).size, c.modelPath).toBeLessThanOrEqual(2 * 1024 * 1024)
    }
  })
  it('every floor texture exists and is ≤ 500 KB', () => {
    for (const m of FLOOR_MATERIALS) {
      const p = join(pub, m.texturePath)
      expect(existsSync(p), m.texturePath).toBe(true)
      expect(statSync(p).size, m.texturePath).toBeLessThanOrEqual(500 * 1024)
    }
  })
  it('basis transcoder is committed', () => {
    expect(existsSync(join(pub, 'basis/basis_transcoder.js'))).toBe(true)
    expect(existsSync(join(pub, 'basis/basis_transcoder.wasm'))).toBe(true)
  })
})
```

- [ ] **Step 6: Run** — `npx vitest run src/model/catalog.assets.test.ts` — expected: PASS (every catalog entry backed by a real file; entries you removed are gone from `catalog.ts` AND their tests still pass).

- [ ] **Step 7: Commit**

```bash
git add public scripts src/model package.json package-lock.json
git commit -m "feat: bundled CC0 furniture models, floor textures, decoders, credits"
```

---

### Task 12: 3D furniture rendering

**Files:**
- Create: `src/viewer3d/furniture.ts` (pure transforms)
- Create: `src/viewer3d/furnitureModels.ts` (loader + cache + tint)
- Create: `src/viewer3d/Furniture.tsx` (React components)
- Modify: `src/viewer3d/Viewer3D.tsx`
- Test: `src/viewer3d/furniture.test.ts`

**Interfaces:**
- Consumes: `wallItemSpan`, `roomEdge`, `WALL_THICKNESS`, `catalogItem`, store plan.
- Produces:
  - `interface ItemTransform { position: [number, number, number]; rotationY: number }`
  - `floorItemTransform(item: FloorItem): ItemTransform` — `[x, 0, y]`, `rotationY = -rotation·π/180`
  - `wallItemTransform(item: WallItem, plan: Plan): ItemTransform | null` — centered on the edge at `offset`, pushed into the room by `WALL_THICKNESS/2 + size.depth/2`, `y = elevation`, facing the room
  - `loadFurnitureModel(gl: WebGLRenderer, cat: CatalogItem): Promise<Group>` — shared GLTFLoader (meshopt + KTX2 w/ `BASE_URL + 'basis/'`), per-catalogId promise cache; result wrapped so origin = footprint center at floor, `userData.sourceSize: Size3` (measured AFTER `modelRotationY`)
  - `instantiateModel(template: Group): Group` — deep clone with cloned materials (original colors stashed in `material.userData.baseColor`)
  - `applyTint(instance: Group, materialName: string | undefined, color: string | undefined): void`
  - `<PlanFurniture plan={plan} />` rendered inside the apartment-offset group in `Viewer3D`; failed loads render a gray box of the item's exact dimensions + one-time toast.

- [ ] **Step 1: Write failing transform tests**

Create `src/viewer3d/furniture.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { FloorItem, Plan, WallItem } from '../model/types'
import { floorItemTransform, wallItemTransform } from './furniture'

describe('floorItemTransform', () => {
  it('maps plan xy to xz and negates rotation', () => {
    const item: FloorItem = { id: 'a', catalogId: 'sofa-3seat', mount: 'floor',
      position: { x: 3, y: 2 }, rotation: 90, size: { width: 2, depth: 1, height: 0.8 } }
    const t = floorItemTransform(item)
    expect(t.position).toEqual([3, 0, 2])
    expect(t.rotationY).toBeCloseTo(-Math.PI / 2)
  })
})

describe('wallItemTransform', () => {
  const room = { id: 'r1', name: 'A', color: '#8ecae6', polygon: rectToPolygon({ x: 0, y: 0, width: 4, height: 3 }) }
  const plan: Plan = { ...createDefaultPlan(), rooms: [room] }
  const art: WallItem = { id: 'w', catalogId: 'wall-art', mount: 'wall', roomId: 'r1',
    edgeIndex: 0, offset: 2, elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 } }

  it('hangs on the top wall facing into the room', () => {
    const t = wallItemTransform(art, plan)!
    expect(t.position[0]).toBeCloseTo(2)
    expect(t.position[1]).toBe(1.4)
    expect(t.position[2]).toBeCloseTo(0.05 + 0.025) // WALL_THICKNESS/2 + depth/2
    expect(t.rotationY).toBeCloseTo(0)
  })
  it('null for unknown room', () => {
    expect(wallItemTransform({ ...art, roomId: 'nope' }, plan)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure** — expected: FAIL.

- [ ] **Step 3: Implement pure transforms**

Create `src/viewer3d/furniture.ts`:

```ts
import { roomEdge } from '../model/openings'
import type { FloorItem, Plan, WallItem } from '../model/types'
import { WALL_THICKNESS } from './walls'

export interface ItemTransform {
  position: [number, number, number]
  rotationY: number
}

export function floorItemTransform(item: FloorItem): ItemTransform {
  return {
    position: [item.position.x, 0, item.position.y],
    rotationY: (-item.rotation * Math.PI) / 180,
  }
}

export function wallItemTransform(item: WallItem, plan: Plan): ItemTransform | null {
  const room = plan.rooms.find((r) => r.id === item.roomId)
  const edge = room ? roomEdge(room, item.edgeIndex) : null
  if (!edge) return null
  const nx = -edge.uy
  const ny = edge.ux
  const push = WALL_THICKNESS / 2 + item.size.depth / 2
  return {
    position: [
      edge.a.x + edge.ux * item.offset + nx * push,
      item.elevation,
      edge.a.y + edge.uy * item.offset + ny * push,
    ],
    rotationY: -Math.atan2(edge.uy, edge.ux),
  }
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/viewer3d/furniture.test.ts` — expected: PASS.

- [ ] **Step 5: Loader module**

Create `src/viewer3d/furnitureModels.ts`:

```ts
import { Box3, Color, Group, Mesh, MeshStandardMaterial, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { CatalogItem } from '../model/catalog'
import type { Size3 } from '../model/types'

let sharedLoader: GLTFLoader | null = null

function getLoader(gl: WebGLRenderer): GLTFLoader {
  if (!sharedLoader) {
    const ktx2 = new KTX2Loader()
      .setTranscoderPath(import.meta.env.BASE_URL + 'basis/')
      .detectSupport(gl)
    sharedLoader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder)
  }
  return sharedLoader
}

const cache = new Map<string, Promise<Group>>()

export function loadFurnitureModel(gl: WebGLRenderer, cat: CatalogItem): Promise<Group> {
  let p = cache.get(cat.id)
  if (!p) {
    p = getLoader(gl)
      .loadAsync(import.meta.env.BASE_URL + cat.modelPath)
      .then((gltf) => normalize(gltf.scene, cat.modelRotationY ?? 0))
    cache.set(cat.id, p)
  }
  return p
}

function normalize(scene: Group, rotationY: number): Group {
  scene.rotation.y = rotationY
  scene.updateMatrixWorld(true)
  const box = new Box3().setFromObject(scene)
  const wrapper = new Group()
  const inner = new Group()
  inner.add(scene)
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
  wrapper.add(inner)
  const sourceSize: Size3 = {
    width: Math.max(box.max.x - box.min.x, 1e-6),
    height: Math.max(box.max.y - box.min.y, 1e-6),
    depth: Math.max(box.max.z - box.min.z, 1e-6),
  }
  wrapper.userData.sourceSize = sourceSize
  wrapper.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })
  return wrapper
}

export function instantiateModel(template: Group): Group {
  const clone = template.clone(true)
  clone.userData = { ...template.userData }
  clone.traverse((obj) => {
    if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial) {
      const mat = obj.material.clone()
      mat.userData.baseColor = obj.material.color.getHex()
      obj.material = mat
    }
  })
  return clone
}

export function applyTint(instance: Group, materialName: string | undefined, color: string | undefined): void {
  if (!materialName) return
  instance.traverse((obj) => {
    if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial && obj.material.name === materialName) {
      obj.material.color = new Color(color ?? `#${(obj.material.userData.baseColor as number).toString(16).padStart(6, '0')}`)
    }
  })
}
```

- [ ] **Step 6: React components**

Create `src/viewer3d/Furniture.tsx`:

```tsx
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type { Group } from 'three'
import { catalogItem } from '../model/catalog'
import type { Plan, PlacedItem } from '../model/types'
import { useToast } from '../ui/toast'
import { floorItemTransform, wallItemTransform, type ItemTransform } from './furniture'
import { applyTint, instantiateModel, loadFurnitureModel } from './furnitureModels'

const failedOnce = new Set<string>()

function FallbackBox({ t, item }: { t: ItemTransform; item: PlacedItem }) {
  return (
    <mesh
      position={[t.position[0], t.position[1] + item.size.height / 2, t.position[2]]}
      rotation-y={t.rotationY}
      castShadow
    >
      <boxGeometry args={[item.size.width, item.size.height, item.size.depth]} />
      <meshStandardMaterial color="#9aa0a6" />
    </mesh>
  )
}

function FurnitureItem({ item, plan }: { item: PlacedItem; plan: Plan }) {
  const gl = useThree((s) => s.gl)
  const [model, setModel] = useState<Group | null>(null)
  const [failed, setFailed] = useState(false)
  const cat = catalogItem(item.catalogId)

  useEffect(() => {
    if (!cat) return
    let alive = true
    loadFurnitureModel(gl, cat).then(
      (template) => {
        if (alive) setModel(instantiateModel(template))
      },
      () => {
        if (!alive) return
        setFailed(true)
        if (!failedOnce.has(cat.modelPath)) {
          failedOnce.add(cat.modelPath)
          useToast.getState().show(`Could not load the 3D model for ${cat.name} — showing a placeholder box.`)
        }
      },
    )
    return () => {
      alive = false
    }
  }, [gl, cat])

  useEffect(() => {
    if (model) applyTint(model, cat?.recolorMaterial, item.color)
  }, [model, cat, item.color])

  const t = item.mount === 'floor' ? floorItemTransform(item) : wallItemTransform(item, plan)
  if (!t || !cat) return null
  if (failed) return <FallbackBox t={t} item={item} />
  if (!model) return null

  const src = model.userData.sourceSize as { width: number; height: number; depth: number }
  return (
    <group position={t.position} rotation-y={t.rotationY}>
      <primitive
        object={model}
        scale={[item.size.width / src.width, item.size.height / src.height, item.size.depth / src.depth]}
      />
    </group>
  )
}

export function PlanFurniture({ plan }: { plan: Plan }) {
  return (
    <>
      {plan.furniture.map((item) => (
        <FurnitureItem key={item.id} item={item} plan={plan} />
      ))}
    </>
  )
}
```

In `src/viewer3d/Viewer3D.tsx`, inside the apartment-offset `<group>` after the openings map, add `<PlanFurniture plan={plan} />` (import from `./Furniture`).

- [ ] **Step 7: Verify** — `npm test`, `npx tsc --noEmit` — clean. Manual (`npm run dev`): place a few items in 2D, switch to 3D — models sit on the floor at the right spots/orientations/sizes; wall art hangs on its wall at 1.4 m; resize an item in the panel and watch it stretch; if any model faces the wrong way or lies on its side, fix that entry's `modelRotationY` in `catalog.ts` and re-check. Rug underlays must not z-fight the floor (rug height 0.01 puts its top at ~1 cm — acceptable).

- [ ] **Step 8: Commit**

```bash
git add src/viewer3d
git commit -m "feat: 3D furniture rendering with lazy GLTF loading and tint"
```

---

### Task 13: 3D floor materials and wall colors

**Files:**
- Modify: `src/viewer3d/Viewer3D.tsx`
- Test: none new (pure logic is trivial; covered by E2E screenshots in Task 14)

**Interfaces:**
- Consumes: `floorFinish`; room `floorMaterial` / `wallColor`.
- Produces: room floors render their finish texture at true world scale (1 texture tile = 1 m²); room wall pieces tint with `wallColor` (default `#f5f5f0` unchanged).

- [ ] **Step 1: Implement**

In `src/viewer3d/Viewer3D.tsx`:

1. Wrap the scene content group in `<Suspense fallback={null}>` (import from `react`).
2. Replace the floor mesh in `RoomMesh`:

```tsx
{rect && (finish ? (
  <TexturedFloor rect={rect} texturePath={finish.texturePath} />
) : (
  /* existing color plane unchanged */
))}
```

with `const finish = room.floorMaterial ? floorFinish(room.floorMaterial) : undefined`.

3. Add the component:

```tsx
function TexturedFloor({ rect, texturePath }: { rect: Rect; texturePath: string }) {
  const base = useLoader(TextureLoader, import.meta.env.BASE_URL + texturePath)
  const texture = useMemo(() => {
    const t = base.clone()
    t.wrapS = RepeatWrapping
    t.wrapT = RepeatWrapping
    t.repeat.set(rect.width, rect.height)
    t.colorSpace = SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [base, rect.width, rect.height])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[rect.x + rect.width / 2, 0.001, rect.y + rect.height / 2]} receiveShadow>
      <planeGeometry args={[rect.width, rect.height]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  )
}
```

(imports: `useLoader` from `@react-three/fiber`; `RepeatWrapping`, `SRGBColorSpace`, `TextureLoader` from `three`; `useMemo` from `react`; `Rect` type; `floorFinish` from `../model/catalog`.)

4. Wall tint — in `RoomMesh`, the wall-piece material becomes:

```tsx
<meshStandardMaterial color={room.wallColor ?? '#f5f5f0'} />
```

- [ ] **Step 2: Verify** — `npm test`, `npx tsc --noEmit`, `npm run build` — clean. Manual: set Oak on one room, a wall color on another; 3D shows wood grain at believable plank scale and tinted walls; rooms without finishes look exactly as before.

- [ ] **Step 3: Commit**

```bash
git add src/viewer3d
git commit -m "feat: 3D floor material textures and wall colors"
```

---

### Task 14: End-to-end verification, docs, dev store hook

**Files:**
- Modify: `src/main.tsx` (dev-only store handle for E2E)
- Modify: `README.md`
- Test: full suite + browser E2E with screenshots

- [ ] **Step 1: Dev store hook**

In `src/main.tsx`, after store imports:

```ts
if (import.meta.env.DEV) {
  ;(window as unknown as { __planStore?: typeof usePlanStore }).__planStore = usePlanStore
}
```

(import `usePlanStore`.)

- [ ] **Step 2: Full checks**

```bash
npm test          # expected: all pass
npm run build     # expected: typecheck + build clean
```

- [ ] **Step 3: Browser E2E**

Method (matches the project's established approach): `npm i playwright-core` in a scratch dir (NOT the repo), drive installed Chrome headless via `channel: 'chrome'` against `npm run dev`. macOS has no `timeout` command — bound the script internally.

Script skeleton (adapt selectors as needed; save screenshots to the scratchpad):

```js
const { chromium } = require('playwright-core')
const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto('http://localhost:5173/')
  const store = () => page.evaluate(() => window.__planStore.getState())
  // 1. room + furniture placement
  await page.getByRole('button', { name: '+ Add room' }).click()
  await page.getByRole('button', { name: 'Furniture' }).click()
  await page.getByRole('button', { name: /sofa/i }).click()
  await page.mouse.click(700, 450) // inside the room
  // assert: one furniture item, selected
  // 2. rotate via panel: fill Rotation with 90, blur; assert rotation === 90
  // 3. wall snap: mouse.down on the sofa, move near the room's top wall, up; assert rotation aligned + flush position
  // 4. collision: place a second sofa on top — assert placement rejected (furniture.length unchanged)
  // 5. finishes: select the room, click Oak swatch, set wall color; assert plan fields
  // 6. screenshots: 2D canvas; switch to 3D, wait 3s for models, screenshot
  await page.screenshot({ path: '<scratchpad>/e2e-2d.png' })
  await page.getByRole('button', { name: '3D' }).click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: '<scratchpad>/e2e-3d.png' })
  await browser.close()
}
run().catch((e) => { console.error(e); process.exit(1) })
```

Inspect both screenshots with the Read tool: 2D shows the sofa symbol flush against a wall + tinted floor; 3D shows the actual sofa model, textured floor, tinted walls, wall art if placed. THE SCREENSHOTS ARE THE ACCEPTANCE GATE — if a model is sideways, mis-scaled, or floating, fix `modelRotationY`/catalog data before proceeding.

- [ ] **Step 4: Update README**

In `README.md` "Use" section, after the doors & windows bullet add:

```markdown
- **Furniture & decor**: "Furniture" opens the catalog — pick an item and click to
  place it (blue ghost = valid, red = blocked). Drag to move (snaps flush to
  walls), drag the circle handle to rotate (15° steps, Shift for free angle),
  edit sizes in the panel. Solid items can't be dropped overlapping; rugs and
  wall art layer freely. Wall art and shelves attach to walls — drag along the
  wall, set elevation in the panel.
- **Finishes**: select a room to pick a floor material and wall color; floors
  show a tint in 2D and real textures in 3D.
```

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx README.md
git commit -m "docs: furniture & decoration usage; E2E verified"
```

- [ ] **Step 6: Finish** — invoke the superpowers:finishing-a-development-branch skill (final whole-branch review on the most capable model per the project's workflow, then merge to main; push deploys Pages).
