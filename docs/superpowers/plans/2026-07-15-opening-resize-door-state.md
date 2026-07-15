# Opening Drag-Resize + Door Swing State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doors/windows resize by dragging their jambs in the 2D editor, and doors get a persisted hinge side, swing direction, and open/closed state rendered in both 2D (swing arc) and 3D (rotated leaf).

**Architecture:** Plan schema bumps v3→v4 (three door-only fields with load-time migration). All geometry lives in pure model helpers (`doorSwing`, `fitOpeningWidth`); the Zustand store stays the single writer via a new atomic `resizeOpeningEnd` op; Editor2D adds a `resizeOpening` drag kind + jamb handles; the 3D leaf reuses `fillForOpening`.

**Tech Stack:** TypeScript, React, Zustand, zod, pixi.js (2D), three/@react-three/fiber (3D), vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-opening-resize-door-state-design.md`

## Global Constraints

- Plan schema version is now `4`; v1→v2→v3→v4 migrations chain on load.
- `MIN_OPENING_WIDTH = 0.3` (already exported from `src/model/openings.ts`) is the width floor everywhere.
- The Zustand store is the single writer and never holds an invalid plan (cm-rounded via `roundCm`, clamped, finite). `src/model/` stays pure — no Pixi/Three/React imports.
- During a jamb drag the fixed jamb must not move, including at clamp boundaries (assert with `toBeCloseTo(…, 10)`).
- Room polygons are winding-normalized (positive signed area, `rectToPolygon` order); the room interior of edge a→b lies on the `(-uy, ux)` side.
- Left/Right hinge labels in the UI map to `'start'`/`'end'` — with positive winding this is the left/right jamb as seen facing the wall from inside the owning room, for every edge.
- Test command: `npx vitest run <file>` for one file, `npm test` for the suite. Build check: `npm run build` (runs `tsc --noEmit`).
- Commit after every task with a `feat:`/`fix:`/`test:` message.

---

### Task 1: Schema v4 — types, defaults, zod, migration

**Files:**
- Modify: `src/model/types.ts`
- Modify: `src/model/openings.ts` (OPENING_DEFAULTS only)
- Modify: `src/model/serialization.ts`
- Test: `src/model/serialization.test.ts`

**Interfaces:**
- Consumes: existing `Opening`, `Plan`, `planSchema`, `migrate`, `OPENING_DEFAULTS`.
- Produces: `Opening` with optional `hinge?: 'start' | 'end'`, `swing?: 'in' | 'out'`, `open?: boolean`; `Plan['version']: 4`; `OPENING_DEFAULTS.door` includes `hinge: 'start', swing: 'in', open: false` (flows into `addOpening` via its existing `...defaults` spread — no store change needed for creation defaults).

- [ ] **Step 1: Write the failing tests**

Append to `src/model/serialization.test.ts` (follow the file's existing fixture style for building plan JSON):

```ts
describe('plan v4 door swing fields', () => {
  const room = {
    id: 'r1', name: 'Room 1', color: '#8ecae6',
    polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  }
  const base = {
    id: 'p1', name: 'test',
    apartment: { width: 10, depth: 8, wallHeight: 2.7 },
    rooms: [room], furniture: [],
  }
  const door = { id: 'o1', kind: 'door', roomId: 'r1', edgeIndex: 0, offset: 2, width: 0.9, height: 2.1, sillHeight: 0 }
  const window_ = { id: 'o2', kind: 'window', roomId: 'r1', edgeIndex: 2, offset: 2, width: 1.2, height: 1.2, sillHeight: 0.9 }

  it('migrates v3 doors with default hinge/swing/open', () => {
    const plan = parsePlan(JSON.stringify({ ...base, version: 3, openings: [door, window_] }))
    expect(plan?.version).toBe(4)
    const d = plan!.openings.find((o) => o.id === 'o1')!
    expect(d.hinge).toBe('start')
    expect(d.swing).toBe('in')
    expect(d.open).toBe(false)
    const w = plan!.openings.find((o) => o.id === 'o2')!
    expect(w.hinge).toBeUndefined()
  })

  it('rejects a v4 door missing swing fields', () => {
    expect(parsePlan(JSON.stringify({ ...base, version: 4, openings: [door] }))).toBeNull()
  })

  it('strips swing fields from windows', () => {
    const plan = parsePlan(JSON.stringify({
      ...base, version: 4,
      openings: [{ ...window_, hinge: 'end', swing: 'out', open: true }],
    }))
    expect(plan).not.toBeNull()
    const w = plan!.openings.find((o) => o.id === 'o2')!
    expect(w.hinge).toBeUndefined()
    expect(w.swing).toBeUndefined()
    expect(w.open).toBeUndefined()
  })

  it('round-trips an open door through serialize/parse', () => {
    const plan = parsePlan(JSON.stringify({
      ...base, version: 4,
      openings: [{ ...door, hinge: 'end', swing: 'out', open: true }],
    }))!
    const again = parsePlan(serializePlan(plan))!
    expect(again.openings).toEqual(plan.openings)
  })

  it('still chain-migrates a v1 plan', () => {
    const plan = parsePlan(JSON.stringify({ version: 1, id: 'p1', name: 'old', apartment: base.apartment, rooms: [room] }))
    expect(plan?.version).toBe(4)
    expect(plan?.openings).toEqual([])
    expect(plan?.furniture).toEqual([])
  })
})
```

Adjust the v1 fixture to whatever shape the existing v1 migration test in this file uses.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/serialization.test.ts`
Expected: FAIL — v3 input parses to null (schema still demands `version: 3` after the untouched migrate), new fields missing.

- [ ] **Step 3: Update `src/model/types.ts`**

```ts
export interface Opening {
  id: string
  kind: OpeningKind
  roomId: string
  edgeIndex: number // edge = polygon[edgeIndex] → polygon[(edgeIndex + 1) % n]
  offset: number // meters from edge start to opening CENTER
  width: number
  height: number
  sillHeight: number // doors: always 0
  hinge?: 'start' | 'end' // doors only: jamb the leaf pivots on, in edge direction
  swing?: 'in' | 'out' // doors only: 'in' opens into the owning room
  open?: boolean // doors only
}
```

And in `Plan`: `version: 4`.

- [ ] **Step 4: Update `OPENING_DEFAULTS` in `src/model/openings.ts`**

```ts
export const OPENING_DEFAULTS = {
  door: { width: 0.9, height: 2.1, sillHeight: 0, hinge: 'start', swing: 'in', open: false },
  window: { width: 1.2, height: 1.2, sillHeight: 0.9 },
} as const
```

- [ ] **Step 5: Update `src/model/serialization.ts`**

Replace the single `openingSchema` object with a discriminated union (zod objects strip unknown keys by default, which gives windows the strip behavior for free):

```ts
const openingBase = {
  id: z.string().min(1),
  roomId: z.string().min(1),
  edgeIndex: z.number().int().min(0),
  offset: z.number().finite().min(0),
  width: z.number().finite().min(0.3),
  height: z.number().finite().positive(),
  sillHeight: z.number().finite().min(0),
}

const doorSchema = z.object({
  ...openingBase,
  kind: z.literal('door'),
  hinge: z.enum(['start', 'end']),
  swing: z.enum(['in', 'out']),
  open: z.boolean(),
})

const windowSchema = z.object({ ...openingBase, kind: z.literal('window') })

const openingSchema = z.discriminatedUnion('kind', [doorSchema, windowSchema])
```

Change `version: z.literal(3)` → `z.literal(4)`, and `createDefaultPlan` to `version: 4`.

Append to `migrate()` after the v2→v3 step:

```ts
if (out !== null && typeof out === 'object' && (out as { version?: unknown }).version === 3) {
  const openings = (out as { openings?: unknown }).openings
  out = {
    ...(out as object),
    version: 4,
    openings: Array.isArray(openings)
      ? openings.map((o) =>
          o !== null && typeof o === 'object' && (o as { kind?: unknown }).kind === 'door'
            ? { hinge: 'start', swing: 'in', open: false, ...(o as object) }
            : o,
        )
      : openings,
  }
}
```

(Defaults spread FIRST so a hand-edited v3 file that already carries the fields keeps its values.)

- [ ] **Step 6: Run the new tests**

Run: `npx vitest run src/model/serialization.test.ts`
Expected: PASS.

- [ ] **Step 7: Fix version-3 fallout across the suite**

Run: `npm test`
Expected: failures wherever tests build `version: 3` fixtures or assert `version` equals 3. Find them with `grep -rn "version: 3" src/`, update each to v4 (adding `hinge: 'start', swing: 'in', open: false` to any door fixtures). `npm run build` must also pass.

- [ ] **Step 8: Commit**

```bash
git add src/model docs
git commit -m "feat: plan schema v4 — door hinge/swing/open fields with migration"
```

---

### Task 2: Pure model helpers — `doorSwing` and `fitOpeningWidth`

**Files:**
- Modify: `src/model/openings.ts`
- Test: `src/model/openings.test.ts`

**Interfaces:**
- Consumes: `roomEdge`, `openingSpan`, `roundCm`, `MIN_OPENING_WIDTH` (all already in the file).
- Produces:
  - `interface DoorSwing { hinge: Vec2; closedEnd: Vec2; openEnd: Vec2 }`
  - `doorSwing(opening: Opening, room: Room): DoorSwing | null` — null for windows or degenerate edges.
  - `fitOpeningWidth(width: number, edgeLength: number): number`

- [ ] **Step 1: Write the failing tests**

Append to `src/model/openings.test.ts`:

```ts
describe('doorSwing', () => {
  const room: Room = {
    id: 'r1', name: 'R', color: '#8ecae6',
    polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  }
  const door = (patch: Partial<Opening>): Opening => ({
    id: 'o1', kind: 'door', roomId: 'r1', edgeIndex: 0, offset: 2, width: 1,
    height: 2.1, sillHeight: 0, hinge: 'start', swing: 'in', open: false, ...patch,
  })

  it('hinge start, swing in: opens into the room (top edge → +y)', () => {
    const s = doorSwing(door({}), room)!
    expect(s.hinge).toEqual({ x: 1.5, y: 0 })
    expect(s.closedEnd).toEqual({ x: 2.5, y: 0 })
    expect(s.openEnd.x).toBeCloseTo(1.5, 10)
    expect(s.openEnd.y).toBeCloseTo(1, 10)
  })

  it('hinge end pivots on the far jamb', () => {
    const s = doorSwing(door({ hinge: 'end' }), room)!
    expect(s.hinge).toEqual({ x: 2.5, y: 0 })
    expect(s.closedEnd).toEqual({ x: 1.5, y: 0 })
    expect(s.openEnd.x).toBeCloseTo(2.5, 10)
    expect(s.openEnd.y).toBeCloseTo(1, 10)
  })

  it('swing out flips to the exterior side', () => {
    const s = doorSwing(door({ swing: 'out' }), room)!
    expect(s.openEnd.y).toBeCloseTo(-1, 10)
  })

  it('vertical edge: interior is -x for the east wall', () => {
    const s = doorSwing(door({ edgeIndex: 1, offset: 1.5 }), room)!
    expect(s.hinge).toEqual({ x: 4, y: 1 })
    expect(s.openEnd.x).toBeCloseTo(3, 10)
    expect(s.openEnd.y).toBeCloseTo(1, 10)
  })

  it('returns null for windows', () => {
    expect(doorSwing(door({ kind: 'window' }), room)).toBeNull()
  })
})

describe('fitOpeningWidth', () => {
  it('caps width at the edge length', () => expect(fitOpeningWidth(1, 0.5)).toBe(0.5))
  it('keeps width that fits', () => expect(fitOpeningWidth(1, 4)).toBe(1))
  it('never goes below the minimum', () => expect(fitOpeningWidth(1, 0.2)).toBe(0.3))
})
```

Import `doorSwing`, `fitOpeningWidth` and the `Room`/`Opening` types at the top as the file already does.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/openings.test.ts`
Expected: FAIL — `doorSwing is not a function`.

- [ ] **Step 3: Implement in `src/model/openings.ts`**

```ts
export interface DoorSwing {
  hinge: Vec2
  closedEnd: Vec2
  openEnd: Vec2
}

// World-space leaf geometry for a door. Room polygons are winding-normalized
// (positive signed area), which puts the interior on the (-uy, ux) side of
// edge a→b — so 'in' swings that way, 'out' the opposite.
export function doorSwing(opening: Opening, room: Room): DoorSwing | null {
  if (opening.kind !== 'door') return null
  const edge = roomEdge(room, opening.edgeIndex)
  const span = openingSpan(opening, room)
  if (!edge || !span) return null
  const hinge = opening.hinge === 'end' ? span.b : span.a
  const closedEnd = opening.hinge === 'end' ? span.a : span.b
  const sign = opening.swing === 'out' ? -1 : 1
  const dir = { x: -edge.uy * sign, y: edge.ux * sign }
  const w = Math.hypot(closedEnd.x - hinge.x, closedEnd.y - hinge.y)
  return { hinge, closedEnd, openEnd: { x: hinge.x + dir.x * w, y: hinge.y + dir.y * w } }
}

// Fit an opening's width to its edge: never wider than the edge, never below the minimum.
export function fitOpeningWidth(width: number, edgeLength: number): number {
  return roundCm(Math.max(MIN_OPENING_WIDTH, Math.min(width, edgeLength)))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/model/openings.test.ts`
Expected: PASS. If the two `openEnd` interior-direction tests fail with flipped signs, the winding assumption is wrong — flip `dir` to `{ x: edge.uy * sign, y: -edge.ux * sign }` and re-run; the tests are ground truth (they use `rectToPolygon` vertex order).

- [ ] **Step 5: Commit**

```bash
git add src/model/openings.ts src/model/openings.test.ts
git commit -m "feat: doorSwing and fitOpeningWidth model helpers"
```

---

### Task 3: Store ops — `resizeOpeningEnd`, door-field `updateOpening`

**Files:**
- Modify: `src/store/planStore.ts`
- Test: `src/store/planStore.test.ts`

**Interfaces:**
- Consumes: `MIN_OPENING_WIDTH`, `roomEdge`, `roundCm`, `clamp` (file-local), Task 1's `OPENING_DEFAULTS` with door swing defaults.
- Produces (in `PlanState`):
  - `resizeOpeningEnd: (id: string, end: 'start' | 'end', t: number) => void` — `t` = distance in meters along the edge for the dragged jamb.
  - `updateOpening` patch type widens to `Partial<Pick<Opening, 'width' | 'height' | 'sillHeight' | 'offset' | 'hinge' | 'swing' | 'open'>>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/planStore.test.ts`, following the file's existing setup helpers (reset store, `addRoom` + `updateRoomRect` to a 4×3 room, `addOpening`). Test bodies:

```ts
describe('resizeOpeningEnd', () => {
  // setup: room r1 with rect {x:0,y:0,width:4,height:3}; door added on edge 0 at
  // offset 2 with width 1 → jambs at 1.5 and 2.5
  it('dragging the start jamb pins the end jamb', () => {
    usePlanStore.getState().resizeOpeningEnd(doorId, 'start', 1.2)
    const o = usePlanStore.getState().plan.openings[0]
    expect(o.width).toBeCloseTo(1.3, 10)
    expect(o.offset + o.width / 2).toBeCloseTo(2.5, 10) // fixed jamb unmoved
    expect(o.offset - o.width / 2).toBeCloseTo(1.2, 10)
  })

  it('clamps at MIN_OPENING_WIDTH without moving the fixed jamb', () => {
    usePlanStore.getState().resizeOpeningEnd(doorId, 'start', 2.45)
    const o = usePlanStore.getState().plan.openings[0]
    expect(o.width).toBeCloseTo(0.3, 10)
    expect(o.offset + o.width / 2).toBeCloseTo(2.5, 10)
  })

  it('clamps the dragged jamb to the edge', () => {
    usePlanStore.getState().resizeOpeningEnd(doorId, 'start', -5)
    const o = usePlanStore.getState().plan.openings[0]
    expect(o.offset - o.width / 2).toBeCloseTo(0, 10)
    expect(o.width).toBeCloseTo(2.5, 10)
  })

  it('dragging the end jamb pins the start jamb', () => {
    usePlanStore.getState().resizeOpeningEnd(doorId, 'end', 3.1)
    const o = usePlanStore.getState().plan.openings[0]
    expect(o.width).toBeCloseTo(1.6, 10)
    expect(o.offset - o.width / 2).toBeCloseTo(1.5, 10)
  })

  it('ignores non-finite input', () => {
    const before = usePlanStore.getState().plan
    usePlanStore.getState().resizeOpeningEnd(doorId, 'start', NaN)
    expect(usePlanStore.getState().plan).toBe(before)
  })
})

describe('updateOpening door fields', () => {
  it('toggles open and sets hinge/swing on a door', () => {
    usePlanStore.getState().updateOpening(doorId, { open: true, hinge: 'end', swing: 'out' })
    const o = usePlanStore.getState().plan.openings[0]
    expect(o.open).toBe(true)
    expect(o.hinge).toBe('end')
    expect(o.swing).toBe('out')
  })

  it('ignores door fields on windows', () => {
    usePlanStore.getState().updateOpening(windowId, { open: true })
    const w = usePlanStore.getState().plan.openings.find((o) => o.id === windowId)!
    expect(w.open).toBeUndefined()
  })
})

describe('addOpening door defaults', () => {
  it('new doors are closed, hinge start, swing in', () => {
    const o = usePlanStore.getState().plan.openings.find((o) => o.id === doorId)!
    expect(o.hinge).toBe('start')
    expect(o.swing).toBe('in')
    expect(o.open).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/planStore.test.ts`
Expected: FAIL — `resizeOpeningEnd is not a function`; door-field updates are silently dropped (and `{ open: true }` currently returns early because the finite-guard loop chokes on booleans).

- [ ] **Step 3: Implement**

In the `PlanState` interface, after `moveOpening`:

```ts
resizeOpeningEnd: (id: string, end: 'start' | 'end', t: number) => void
updateOpening: (
  id: string,
  patch: Partial<Pick<Opening, 'width' | 'height' | 'sillHeight' | 'offset' | 'hinge' | 'swing' | 'open'>>,
) => void
```

Implementation, after `moveOpening`:

```ts
resizeOpeningEnd: (id, end, t) =>
  set((s) => {
    if (!Number.isFinite(t)) return s
    const opening = s.plan.openings.find((o) => o.id === id)
    const room = opening ? s.plan.rooms.find((r) => r.id === opening.roomId) : undefined
    const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
    if (!opening || !edge) return s
    const startJamb = opening.offset - opening.width / 2
    const endJamb = opening.offset + opening.width / 2
    let next: Opening
    if (end === 'start') {
      const jamb = roundCm(clamp(t, 0, Math.max(0, endJamb - MIN_OPENING_WIDTH)))
      const width = roundCm(endJamb - jamb)
      next = { ...opening, width, offset: jamb + width / 2 }
    } else {
      const jamb = roundCm(clamp(t, Math.min(edge.length, startJamb + MIN_OPENING_WIDTH), edge.length))
      const width = roundCm(jamb - startJamb)
      next = { ...opening, width, offset: jamb - width / 2 }
    }
    return { plan: { ...s.plan, openings: s.plan.openings.map((o) => (o.id === id ? next : o)) } }
  }),
```

(The dragged jamb and width are cm-rounded; `offset` is derived from them so the fixed jamb stays put to float precision — it may sit at half-centimeter resolution, which the schema accepts.)

In `updateOpening`, replace the finite-guard loop and extend the result:

```ts
updateOpening: (id, patch) =>
  set((s) => {
    for (const key of ['width', 'height', 'sillHeight', 'offset'] as const) {
      const value = patch[key]
      if (value !== undefined && !Number.isFinite(value)) return s
    }
    const opening = s.plan.openings.find((o) => o.id === id)
    const room = opening ? s.plan.rooms.find((r) => r.id === opening.roomId) : undefined
    const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
    if (!opening || !edge) return s
    const wallHeight = s.plan.apartment.wallHeight
    const width = roundCm(Math.max(MIN_OPENING_WIDTH, patch.width ?? opening.width))
    const sillHeight =
      opening.kind === 'door'
        ? 0
        : roundCm(clamp(patch.sillHeight ?? opening.sillHeight, 0, wallHeight - 0.4))
    const height = roundCm(
      clamp(patch.height ?? opening.height, 0.3, wallHeight - 0.1 - sillHeight),
    )
    const offset = clampOffset(patch.offset ?? opening.offset, width, edge.length)
    const next: Opening = { ...opening, width, height, sillHeight, offset }
    if (opening.kind === 'door') {
      if (patch.hinge !== undefined) next.hinge = patch.hinge
      if (patch.swing !== undefined) next.swing = patch.swing
      if (patch.open !== undefined) next.open = patch.open
    }
    return {
      plan: { ...s.plan, openings: s.plan.openings.map((o) => (o.id === id ? next : o)) },
    }
  }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/planStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/planStore.ts src/store/planStore.test.ts
git commit -m "feat: resizeOpeningEnd store op and door swing fields in updateOpening"
```

---

### Task 4: Width re-clamp when room edits shrink an edge

**Files:**
- Modify: `src/model/polygon.ts:181-209` (`withRoomPolygon`)
- Modify: `src/store/planStore.ts:146-151` (`updateRoomRect` openings map)
- Test: `src/model/polygon.test.ts`, `src/store/planStore.test.ts`

**Interfaces:**
- Consumes: `fitOpeningWidth` from Task 2, existing `clampOffset`, `roomEdge`.
- Produces: no new API — room-editing ops now shrink opening widths that no longer fit their edge (previously only offset was clamped; this closes a deferred follow-up from the doors/windows final review).

- [ ] **Step 1: Write the failing tests**

Append to `src/model/polygon.test.ts` (follow its existing plan-fixture helpers):

```ts
it('pushRoomEdge shrinks an opening wider than its shortened edge', () => {
  // room 4×3; door on edge 1 (east wall, length 3) with width 2.5, offset 1.5
  // pushing edge 0 (north wall) from y=0 to y=1 leaves edge 1 with length 2
  const plan = planWith({
    rooms: [roomRect('r1', { x: 0, y: 0, width: 4, height: 3 })],
    openings: [{
      id: 'o1', kind: 'door', roomId: 'r1', edgeIndex: 1, offset: 1.5, width: 2.5,
      height: 2.1, sillHeight: 0, hinge: 'start', swing: 'in', open: false,
    }],
  })
  const next = pushRoomEdge(plan, 'r1', 0, 1)!
  const o = next.openings[0]
  expect(o.width).toBe(2)
  expect(o.offset).toBe(1)
})
```

And to `src/store/planStore.test.ts`:

```ts
it('updateRoomRect shrinks openings that no longer fit', () => {
  // door on edge 0 (north wall) width 2.5; shrink room width 4 → 2
  usePlanStore.getState().resizeOpeningEnd(doorId, 'end', 4) // widen first: jambs 1.5→4
  usePlanStore.getState().updateRoomRect(roomId, { x: 0, y: 0, width: 2, height: 3 })
  const o = usePlanStore.getState().plan.openings[0]
  expect(o.width).toBe(2)
})
```

Adapt fixture helper names (`planWith`, `roomRect`) to whatever the files actually define — if they build plans inline, build inline.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/polygon.test.ts src/store/planStore.test.ts`
Expected: FAIL — width stays 2.5 (offset clamps, width doesn't).

- [ ] **Step 3: Implement**

In `src/model/polygon.ts`, `withRoomPolygon`: keep `homeEdge` for furniture, but give openings their own map with the width fit (import `fitOpeningWidth` from `./openings`):

```ts
const openings = plan.openings.map((o) => {
  if (o.roomId !== roomId) return o
  const newIndex = remap.edgeIndex(o.edgeIndex)
  const edge = roomEdge(nextRoom, newIndex)
  const raw = o.offset + remap.offsetShift(o.edgeIndex)
  if (!edge) return { ...o, edgeIndex: newIndex, offset: raw }
  const width = fitOpeningWidth(o.width, edge.length)
  return { ...o, edgeIndex: newIndex, width, offset: clampOffset(raw, width, edge.length) }
})
```

In `src/store/planStore.ts`, `updateRoomRect`'s openings map (import `fitOpeningWidth` alongside the existing openings imports):

```ts
const openings = s.plan.openings.map((o) => {
  if (o.roomId !== id) return o
  const edge = roomEdge(nextRoom, o.edgeIndex)
  if (!edge) return o
  const width = fitOpeningWidth(o.width, edge.length)
  return { ...o, width, offset: clampOffset(o.offset, width, edge.length) }
})
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — including all pre-existing polygon remap tests (the openings map must preserve the exact `edgeIndex`/`offsetShift` remap behavior they assert).

- [ ] **Step 5: Commit**

```bash
git add src/model/polygon.ts src/model/polygon.test.ts src/store/planStore.ts src/store/planStore.test.ts
git commit -m "fix: re-clamp opening width when room edits shrink its edge"
```

---

### Task 5: 2D editor — jamb handles, swing symbol, resize drag

**Files:**
- Modify: `src/editor2d/interactions.ts`
- Modify: `src/editor2d/render.ts:142-183` (`drawOpenings`)
- Modify: `src/editor2d/Editor2D.tsx` (DragState, pointerdown, pointermove, reverts)
- Test: `src/editor2d/interactions.test.ts`, `src/editor2d/render.test.ts`

**Interfaces:**
- Consumes: `doorSwing` (Task 2), `resizeOpeningEnd` + widened `updateOpening` (Task 3), existing `openingSpan`, `hitRadius`, `worldToScreen`, `projectOntoEdge`, `roundCm`.
- Produces:
  - `interface OpeningJambHit { openingId: string; end: 'start' | 'end' }`
  - `hitOpeningJamb(plan: Plan, selection: Selection | null, viewport: Viewport, screen: Vec2, radius?: number): OpeningJambHit | null` — only hits the currently selected opening's jambs.
  - Editor2D drag kind `{ kind: 'resizeOpening'; openingId: string; end: 'start' | 'end'; startWidth: number; startOffset: number }`.

- [ ] **Step 1: Write the failing interaction tests**

Append to `src/editor2d/interactions.test.ts` (viewport fixtures in this file look like `{ scale: 50, offsetX: 0, offsetY: 0 }` — reuse its plan-building style):

```ts
describe('hitOpeningJamb', () => {
  // 4×3 room, door on edge 0, offset 2, width 1 → jambs at world (1.5,0) and (2.5,0)
  // viewport scale 50 → screen (75,0) and (125,0)
  const viewport = { scale: 50, offsetX: 0, offsetY: 0 }
  const selection = { kind: 'opening' as const, id: 'o1' }

  it('hits the start jamb within radius', () => {
    expect(hitOpeningJamb(plan, selection, viewport, { x: 78, y: 3 }, 8))
      .toEqual({ openingId: 'o1', end: 'start' })
  })

  it('hits the end jamb', () => {
    expect(hitOpeningJamb(plan, selection, viewport, { x: 125, y: -5 }, 8))
      .toEqual({ openingId: 'o1', end: 'end' })
  })

  it('misses outside the radius', () => {
    expect(hitOpeningJamb(plan, selection, viewport, { x: 100, y: 0 }, 8)).toBeNull()
  })

  it('returns null when the opening is not selected', () => {
    expect(hitOpeningJamb(plan, null, viewport, { x: 75, y: 0 }, 8)).toBeNull()
    expect(hitOpeningJamb(plan, { kind: 'room', id: 'r1' }, viewport, { x: 75, y: 0 }, 8)).toBeNull()
  })
})
```

And a render smoke test in `src/editor2d/render.test.ts` (matches the file's existing Graphics-smoke style):

```ts
describe('drawOpenings door swing', () => {
  const viewport = { scale: 50, offsetX: 0, offsetY: 0 }
  it('renders closed, open, and selected doors without throwing', () => {
    const g = new Graphics()
    drawOpenings(g, planWithDoor({ open: false }), null, viewport)
    drawOpenings(g, planWithDoor({ open: true }), null, viewport)
    drawOpenings(g, planWithDoor({ open: true, hinge: 'end', swing: 'out' }), { kind: 'opening', id: 'o1' }, viewport)
    expect(g).toBeTruthy()
  })
})
```

(`planWithDoor(patch)` = inline helper returning a v4 plan with one 4×3 room and one door on edge 0 carrying `hinge/swing/open` defaults overridden by `patch`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor2d/interactions.test.ts src/editor2d/render.test.ts`
Expected: FAIL — `hitOpeningJamb is not a function`; render test fails only if imports break (it may pass — that's fine, it's a regression guard).

- [ ] **Step 3: Implement `hitOpeningJamb` in `src/editor2d/interactions.ts`**

Add `Selection` and `Opening` to the type imports from `../model/types`.

```ts
export interface OpeningJambHit {
  openingId: string
  end: 'start' | 'end'
}

// Jamb resize handles only exist on the selected opening, so they can't steal
// pointer-downs from neighboring openings or rooms.
export function hitOpeningJamb(
  plan: Plan,
  selection: Selection | null,
  viewport: Viewport,
  screen: Vec2,
  radius = 8,
): OpeningJambHit | null {
  if (selection?.kind !== 'opening') return null
  const opening = plan.openings.find((o) => o.id === selection.id)
  const room = opening ? plan.rooms.find((r) => r.id === opening.roomId) : undefined
  const span = opening && room ? openingSpan(opening, room) : null
  if (!opening || !span) return null
  for (const [end, point] of [['start', span.a], ['end', span.b]] as const) {
    const s = worldToScreen(viewport, point)
    if (Math.abs(s.x - screen.x) <= radius && Math.abs(s.y - screen.y) <= radius) {
      return { openingId: opening.id, end }
    }
  }
  return null
}
```

- [ ] **Step 4: Rework the door symbol + handles in `drawOpenings` (`src/editor2d/render.ts`)**

Import `doorSwing` from `../model/openings`. Replace the loop body from the `// 2. jamb ticks` comment down (keep the gap paint and the perpendicular math above it):

```ts
    // 2. jamb ticks at both ends
    const tick = 6
    g.moveTo(a.x - px * tick, a.y - py * tick).lineTo(a.x + px * tick, a.y + py * tick)
    g.moveTo(b.x - px * tick, b.y - py * tick).lineTo(b.x + px * tick, b.y + py * tick)
    g.stroke({ width: selected ? 2.5 : 1.5, color })

    // 3. symbol
    if (opening.kind === 'door') {
      const swing = doorSwing(opening, room)
      if (swing) {
        const h = worldToScreen(viewport, swing.hinge)
        const closed = worldToScreen(viewport, swing.closedEnd)
        const open = worldToScreen(viewport, swing.openEnd)
        const leaf = opening.open ? open : closed
        g.moveTo(h.x, h.y).lineTo(leaf.x, leaf.y)
        g.stroke({ width: selected ? 2.5 : 1.5, color })
        // quarter swing arc, faint; pick the 90° sweep, never its 270° complement
        const r = Math.hypot(closed.x - h.x, closed.y - h.y)
        const a0 = Math.atan2(closed.y - h.y, closed.x - h.x)
        const a1 = Math.atan2(open.y - h.y, open.x - h.x)
        const ccw = ((a1 - a0 + Math.PI * 2) % (Math.PI * 2)) > Math.PI
        g.moveTo(closed.x, closed.y)
        g.arc(h.x, h.y, r, a0, a1, ccw)
        g.stroke({ width: 1, color, alpha: 0.45 })
      } else {
        g.moveTo(a.x, a.y).lineTo(b.x, b.y)
        g.stroke({ width: selected ? 2.5 : 1.5, color })
      }
    } else {
      // window: double parallel lines
      const off = 2
      g.moveTo(a.x + px * off, a.y + py * off).lineTo(b.x + px * off, b.y + py * off)
      g.moveTo(a.x - px * off, a.y - py * off).lineTo(b.x - px * off, b.y - py * off)
      g.stroke({ width: selected ? 2.5 : 1.5, color })
    }

    // 4. jamb resize handles on the selected opening (same language as polygon handles)
    if (selected) {
      for (const p of [a, b]) {
        g.rect(p.x - 4, p.y - 4, 8, 8)
          .fill({ color: 0xffffff })
          .stroke({ width: 1.5, color: 0x1d4ed8 })
      }
    }
```

(The single trailing `g.stroke(...)` that used to close the loop is now replaced by these per-section strokes — remove it.)

- [ ] **Step 5: Wire the drag in `src/editor2d/Editor2D.tsx`**

1. Import `hitOpeningJamb` from `./interactions`.
2. Add to `DragState`:

```ts
| { kind: 'resizeOpening'; openingId: string; end: 'start' | 'end'; startWidth: number; startOffset: number }
```

3. In `handlePointerDown`, immediately BEFORE the `// openings are small targets` block:

```ts
        // jamb resize handles on the selected opening beat the opening body
        const jamb = hitOpeningJamb(store.plan, store.selection, viewport, screen, hitRadius(8, e.pointerType))
        if (jamb) {
          const opening = store.plan.openings.find((o) => o.id === jamb.openingId)
          if (opening) {
            drag = {
              kind: 'resizeOpening', openingId: jamb.openingId, end: jamb.end,
              startWidth: opening.width, startOffset: opening.offset,
            }
            return
          }
        }
```

4. In the `pointermove` handler, after the `moveOpening` block:

```ts
        if (drag.kind === 'resizeOpening') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const opening = store.plan.openings.find((o) => o.id === activeDrag.openingId)
          const room = opening ? store.plan.rooms.find((r) => r.id === opening.roomId) : undefined
          const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
          if (!opening || !edge) return
          const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          store.resizeOpeningEnd(activeDrag.openingId, activeDrag.end, roundCm(projectOntoEdge(edge, world)))
          markDirty()
        }
```

5. In `revertDragToStart`, after the `moveOpening` branch:

```ts
        } else if (drag.kind === 'resizeOpening') {
          store.updateOpening(drag.openingId, { width: drag.startWidth, offset: drag.startOffset })
```

6. In the Escape branch of `onKeyDown` (spec: Escape reverts a resize, matching second-finger cancel):

```ts
        if (ev.key === 'Escape' && !isTypingTarget(ev)) {
          if (drag.kind !== 'idle') {
            revertDragIfColliding()
            if (drag.kind === 'resizeOpening') {
              usePlanStore.getState().updateOpening(drag.openingId, { width: drag.startWidth, offset: drag.startOffset })
            }
            drag = { kind: 'idle' }
            ...
```

(Only the two inserted lines change; the rest of the branch stays.)

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run src/editor2d/interactions.test.ts src/editor2d/render.test.ts && npm run build`
Expected: PASS, clean tsc.

- [ ] **Step 7: Commit**

```bash
git add src/editor2d
git commit -m "feat: jamb drag-resize and hinge-aware door swing symbol in 2D editor"
```

---

### Task 6: 3D — open door leaf

**Files:**
- Modify: `src/viewer3d/walls.ts:80-98` (`fillForOpening`)
- Test: `src/viewer3d/walls.test.ts`

**Interfaces:**
- Consumes: `doorSwing` (Task 2), existing `OpeningFill` shape `{ kind, center, size, rotationY }` — `Viewer3D.tsx`'s `OpeningFillMesh` needs NO change.
- Produces: `fillForOpening` returns the leaf rotated onto the swing line when `opening.open` is true.

- [ ] **Step 1: Write the failing tests**

Append to `src/viewer3d/walls.test.ts` (reuse its plan/room fixture style; room = 4×3 rect at origin, door on edge 0, offset 2, width 1, height 2.1):

```ts
describe('fillForOpening open door', () => {
  it('keeps the closed leaf in the wall plane', () => {
    const fill = fillForOpening(door({ open: false }), plan)!
    expect(fill.center[0]).toBeCloseTo(2, 10)
    expect(fill.center[2]).toBeCloseTo(0, 10)
    expect(fill.rotationY).toBeCloseTo(0, 10)
    expect(fill.size[0]).toBeCloseTo(1, 10)
  })

  it('rotates the open leaf 90° into the room around the hinge', () => {
    const fill = fillForOpening(door({ open: true }), plan)! // hinge start → world (1.5, 0)
    expect(fill.center[0]).toBeCloseTo(1.5, 10) // leaf runs from (1.5,0) to (1.5,1)
    expect(fill.center[2]).toBeCloseTo(0.5, 10)
    expect(Math.abs(fill.rotationY)).toBeCloseTo(Math.PI / 2, 10)
    expect(fill.size[0]).toBeCloseTo(1, 10) // leaf length preserved
    expect(fill.size[2]).toBe(0.04)
  })

  it('open windows do not exist: window fill unchanged by open flag', () => {
    const w = fillForOpening(window_({}), plan)!
    expect(w.size[2]).toBe(0.02)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/viewer3d/walls.test.ts`
Expected: FAIL — open-door center still at (2, …, 0), rotationY 0.

- [ ] **Step 3: Implement in `src/viewer3d/walls.ts`**

Import `doorSwing` from `../model/openings`. In `fillForOpening`, after `height` is computed and the `height <= MIN_PIECE` guard, insert before the existing return:

```ts
  if (opening.kind === 'door' && opening.open) {
    const swing = doorSwing(opening, room)
    if (swing) {
      const dx = swing.openEnd.x - swing.hinge.x
      const dy = swing.openEnd.y - swing.hinge.y
      return {
        kind: 'door',
        center: [(swing.hinge.x + swing.openEnd.x) / 2, (bottom + top) / 2, (swing.hinge.y + swing.openEnd.y) / 2],
        size: [Math.hypot(dx, dy), height, 0.04],
        rotationY: -Math.atan2(dy, dx),
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/viewer3d/walls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/viewer3d
git commit -m "feat: open doors render rotated on their hinge in 3D"
```

---

### Task 7: Properties panel — door state controls

**Files:**
- Modify: `src/ui/PropertiesPanel.tsx:170-204` (`OpeningProps`)
- Test: `src/ui/PropertiesPanel.test.tsx`

**Interfaces:**
- Consumes: widened `updateOpening` (Task 3).
- Produces: door-only Open/Closed, Hinge Left/Right, Swings Inward/Outward segmented controls. Left = `'start'`, Right = `'end'` (constant mapping — see Global Constraints).

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/PropertiesPanel.test.tsx`, following its existing render/setup helpers (store seeding + `@testing-library/react`). Per the E2E lesson in this repo, use `exact: true` on `getByRole` name queries:

```ts
it('shows door state controls for doors only', () => {
  renderWithDoorSelected() // helper: seed store with 4×3 room + door, selection on it
  expect(screen.getByRole('button', { name: 'Open', exact: true })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Left', exact: true })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Outward', exact: true })).toBeInTheDocument()
})

it('hides door state controls for windows', () => {
  renderWithWindowSelected()
  expect(screen.queryByRole('button', { name: 'Open', exact: true })).toBeNull()
})

it('toggles open and flips hinge via the store', () => {
  renderWithDoorSelected()
  fireEvent.click(screen.getByRole('button', { name: 'Open', exact: true }))
  expect(usePlanStore.getState().plan.openings[0].open).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Right', exact: true }))
  expect(usePlanStore.getState().plan.openings[0].hinge).toBe('end')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/PropertiesPanel.test.tsx`
Expected: FAIL — no such buttons.

- [ ] **Step 3: Implement in `OpeningProps`**

Insert between the Offset `NumberField` and the delete button:

```tsx
      {opening.kind === 'door' && (
        <>
          <div className="field">
            State
            <div className="swatches">
              <button className={opening.open ? '' : 'active'} onClick={() => updateOpening(opening.id, { open: false })}>
                Closed
              </button>
              <button className={opening.open ? 'active' : ''} onClick={() => updateOpening(opening.id, { open: true })}>
                Open
              </button>
            </div>
          </div>
          <div className="field">
            {/* Left/Right = the jamb as seen facing the wall from inside the room;
                with normalized winding that is always 'start'/'end' respectively */}
            Hinge
            <div className="swatches">
              <button className={opening.hinge === 'end' ? '' : 'active'} onClick={() => updateOpening(opening.id, { hinge: 'start' })}>
                Left
              </button>
              <button className={opening.hinge === 'end' ? 'active' : ''} onClick={() => updateOpening(opening.id, { hinge: 'end' })}>
                Right
              </button>
            </div>
          </div>
          <div className="field">
            Swings
            <div className="swatches">
              <button className={opening.swing === 'out' ? '' : 'active'} onClick={() => updateOpening(opening.id, { swing: 'in' })}>
                Inward
              </button>
              <button className={opening.swing === 'out' ? 'active' : ''} onClick={() => updateOpening(opening.id, { swing: 'out' })}>
                Outward
              </button>
            </div>
          </div>
        </>
      )}
```

(Reuses the existing `.field`/`.swatches` classes — RoomProps already styles text buttons this way; no CSS changes.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/PropertiesPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat: door open/hinge/swing controls in properties panel"
```

---

### Task 8: Full suite, browser E2E, docs

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-opening-resize-door-state-design.md` (status line only, → implemented)
- No production code except fixes for what E2E uncovers.

**Interfaces:**
- Consumes: everything above.
- Produces: verified feature; E2E screenshots reviewed.

- [ ] **Step 1: Full suite + build**

Run: `npm test && npm run build`
Expected: all green, clean tsc.

- [ ] **Step 2: Browser E2E**

Method that works in this repo (macOS, no chromium-cli): npm-install `playwright-core` into a tmp job dir (NOT the repo), drive installed Google Chrome via `channel: 'chrome'`, headless, against `npm run dev`. Script the flow:

1. Create a room, add a door on a wall, select it.
2. Drag the end jamb outward ≥0.5 m → assert the Width field in the properties panel grew accordingly; screenshot the 2D symbol (leaf + faint arc + jamb handles).
3. Drag past the wall corner → width clamps at the corner; the opposite jamb's screen position is unchanged.
4. Click "Open", flip Hinge to Right and Swings to Outward → screenshot: leaf now perpendicular on the other jamb, arc on the exterior side.
5. Switch to 3D → screenshot: leaf rotated out of the doorway (compare against a "Closed" screenshot).
6. Reload the page → door still open (v4 autosave round-trip through localStorage).
7. Touch emulation: tap-select the door, drag a jamb with touch (doubled hit radius) → width changes; second finger mid-drag reverts to the start width.
8. Add a window, select it → no State/Hinge/Swings controls; jamb drag-resize works.
Expected: all assertions pass; screenshots visually correct (arc quadrant matches hinge/swing).

- [ ] **Step 3: Update the spec status line and commit**

```bash
git add docs
git commit -m "docs: opening resize + door swing E2E verified"
```

---

## Post-plan reminders (controller, not task subagents)

- Task subagents: stop after commit; the controller merges. Do NOT push, merge, or delete branches (process lesson from the furniture feature).
- Every dispatch pins the worktree path and demands `git rev-parse --abbrev-ref HEAD` as its first action; controller verifies each commit landed on the right branch.
- Final whole-branch review on the most capable model before merge; merge to main via `git -C <primary> merge --ff-only`; push deploys to Pages.
