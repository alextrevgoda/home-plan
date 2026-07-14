# Polygonal (Rectilinear) Room Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any rectilinear room outline (L/T/U/Z…) editable directly in the 2D editor — push walls, move corners, split walls into segments — with doors/windows/wall furniture surviving every edit, and polygon floors in 3D.

**Architecture:** A new pure module `src/model/polygon.ts` owns rectilinear predicates, canonicalization (collinear merge with an edge-index/offset mapping), and plan-level editing primitives (`translateRoom`, `pushRoomEdge`, `splitRoomEdge`, `moveRoomVertex`) that return whole consistent plans with openings and wall furniture remapped. The store wraps these as validating actions; the 2D editor swaps the rect handle system for unified vertex/edge handles; the 3D floor becomes a ShapeGeometry. No schema change (v3 stays); zod tightens to reject non-rectilinear imports.

**Tech Stack:** unchanged — Vite 5, React 18, TS 5, PixiJS 8, three 0.166 + @react-three/fiber 8, Zustand 5, Zod 3, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-07-14-polygonal-rooms-design.md`

## Global Constraints

- Work on branch `feature/polygonal-rooms` off `main`. Do NOT push during tasks; the CONTROLLER merges and pushes — implementer and E2E subagents stop after committing.
- Node ≥ 22 required for `npm install` (transitive engine constraint); use `nvm use 22` in fresh worktrees.
- `MIN_EDGE = 0.1` m (every polygon edge ≥ 0.1 m); `MIN_ROOM_SIZE = 0.5` m unchanged for rect creation. All coordinates cm-rounded via `roundCm`.
- Polygon invariants (store-enforced on every commit): rectilinear (each edge dx = 0 xor dy = 0), simple (no self-intersection, no non-adjacent touching), area > 0, winding as produced by `rectToPolygon` (inward normal `(-uy, ux)` — wall snapping, wall furniture, and 3D walls depend on it).
- Collinear-merge policy: live drags NEVER merge (edge indices must stay stable mid-drag); merge fires at drag END (store action `mergeRoomCollinear`). A split deliberately creates a collinear vertex pair that persists until pushed; pushing a split segment flush re-merges it.
- Attachment remap rules (openings + wall furniture): push → indices unchanged, offsets re-clamped; split at t → indices after the split edge shift +1, items on the split edge re-home by their CENTER (offset < t → first sub-edge, else second with offset − t); merge → items re-home via `edgeIndexMap`/`offsetShift`, offsets re-clamped.
- Out-of-apartment rooms remain a WARNING (orange tint), not an error — matching existing room behavior. Overlap warning uses bounding-box overlap (documented approximation for non-convex shapes).
- Vertex handles appear only on CORNER vertices (straight-through split vertices are not directly draggable — their segments are pushed instead).
- Room label = `${name}\n${area.toFixed(1)} m²` at the polygon centroid.
- 2D handle constants: vertex handle 8×8 px square hit radius 8 px (wins over edges), edge handle 8 px radius at edge midpoint; double-click (`pointertap` with `e.detail === 2`) on a wall of the SELECTED room splits it at the cm-rounded click point (both segments ≥ `MIN_EDGE`, else rejected).
- The old rect handle system (`HANDLE_IDS`, `HandleId`, `handlePositions`, `hitHandle`, `applyResize`, `drawHandles`) is DELETED in Task 6 — after Task 6, `grep -rn "HandleId\|applyResize" src/` returns nothing.
- Meters internally; store is the single writer and never holds an invalid plan; invalid edit results are no-ops.
- npm; single test file `npx vitest run <path>`; full suite `npm test`; typecheck+build `npm run build`.

---

### Task 1: Polygon predicates, metrics, and zod tightening

**Files:**
- Create: `src/model/polygon.ts`
- Create: `src/model/polygon.test.ts`
- Modify: `src/model/serialization.ts` (room polygon refine)
- Test: `src/model/serialization.test.ts` (extend)

**Interfaces:**
- Consumes: `Vec2`, `Rect` from types; `roundCm`, `polygonArea`, `rectToPolygon` from geometry.
- Produces (used by every later task):
  - `MIN_EDGE = 0.1`
  - `isRectilinear(polygon: Vec2[]): boolean` — n ≥ 4 and every edge axis-aligned with nonzero length
  - `isSimplePolygon(polygon: Vec2[]): boolean` — rectilinear-polygon simplicity: no two non-adjacent edges intersect, touch, or overlap; adjacent edges share only their common vertex
  - `pointInPolygon(p: Vec2, polygon: Vec2[]): boolean` — even-odd ray cast (boundary behavior unspecified; callers use it for hit-testing only)
  - `polygonCentroid(polygon: Vec2[]): Vec2`
  - `polygonBounds(polygon: Vec2[]): Rect`
  - `minEdgeLength(polygon: Vec2[]): number`
  - `signedPolygonArea(polygon: Vec2[]): number` — shoelace WITHOUT the abs; `rectToPolygon` order yields a POSITIVE value (verify with a 2×2 rect → +4). Winding enforcement: a reversed polygon (e.g. from pushing an edge through and past the opposite wall) has negative signed area and must be rejected
  - `validateRoomPolygon(polygon: Vec2[]): boolean` — rectilinear ∧ simple ∧ `minEdgeLength ≥ MIN_EDGE − 1e-9` ∧ `signedPolygonArea > 0` (positive area doubles as the winding check)
  - zod: room polygons additionally `.refine(isRectilinear)` and `.refine(isSimplePolygon)` (message `'non-rectilinear polygon'` / `'self-intersecting polygon'`)

- [ ] **Step 1: Write failing tests**

Create `src/model/polygon.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import {
  isRectilinear, isSimplePolygon, MIN_EDGE, minEdgeLength,
  pointInPolygon, polygonBounds, polygonCentroid, signedPolygonArea, validateRoomPolygon,
} from './polygon'
import type { Vec2 } from './types'

// L-shape: 4×3 rect with a 2×1 notch cut from the top-right corner
export const L: Vec2[] = [
  { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 1 },
  { x: 4, y: 3 }, { x: 0, y: 3 },
]

describe('isRectilinear', () => {
  it('accepts rects and L-shapes', () => {
    expect(isRectilinear(rectToPolygon({ x: 1, y: 1, width: 3, height: 2 }))).toBe(true)
    expect(isRectilinear(L)).toBe(true)
  })
  it('rejects diagonals, degenerate edges, and tiny polygons', () => {
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: -1, y: 1 }])).toBe(false)
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }])).toBe(false)
    expect(isRectilinear([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }])).toBe(false)
  })
})

describe('isSimplePolygon', () => {
  it('accepts rects and L-shapes', () => {
    expect(isSimplePolygon(rectToPolygon({ x: 0, y: 0, width: 2, height: 2 }))).toBe(true)
    expect(isSimplePolygon(L)).toBe(true)
  })
  it('rejects a self-crossing rectilinear outline', () => {
    // "S" that crosses itself: edge 1→2 crosses edge 4→5
    const crossing: Vec2[] = [
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 2 },
      { x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ]
    expect(isSimplePolygon(crossing)).toBe(false)
  })
  it('rejects non-adjacent edges that touch (pinch)', () => {
    const pinched: Vec2[] = [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 },
      { x: 2, y: 0.0 }, { x: 2, y: 2.0 }, { x: 0, y: 2 },
    ]
    expect(isSimplePolygon(pinched)).toBe(false)
  })
})

describe('pointInPolygon', () => {
  it('handles the L notch correctly', () => {
    expect(pointInPolygon({ x: 1, y: 0.5 }, L)).toBe(true)   // in the upper arm
    expect(pointInPolygon({ x: 3, y: 0.5 }, L)).toBe(false)  // inside the notch (outside the room)
    expect(pointInPolygon({ x: 3, y: 2 }, L)).toBe(true)     // in the lower body
    expect(pointInPolygon({ x: 5, y: 2 }, L)).toBe(false)    // fully outside
  })
})

describe('metrics', () => {
  it('centroid of a rect is its center; L centroid is area-weighted', () => {
    expect(polygonCentroid(rectToPolygon({ x: 1, y: 1, width: 2, height: 4 }))).toEqual({ x: 2, y: 3 })
    const c = polygonCentroid(L)
    // L = 2×1 upper-left arm (area 2, centroid (1, 0.5)) + 4×2 lower body (area 8, centroid (2, 2))
    // → x̄ = (2·1 + 8·2)/10 = 1.8, ȳ = (2·0.5 + 8·2)/10 = 1.7
    expect(c.x).toBeCloseTo(1.8)
    expect(c.y).toBeCloseTo(1.7)
  })
  it('bounds and min edge', () => {
    expect(polygonBounds(L)).toEqual({ x: 0, y: 0, width: 4, height: 3 })
    expect(minEdgeLength(L)).toBe(1)
  })
})

describe('validateRoomPolygon', () => {
  it('accepts L, rejects sub-MIN_EDGE edges', () => {
    expect(validateRoomPolygon(L)).toBe(true)
    const sliver = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.05 }, { x: 0, y: 0.05 }]
    expect(MIN_EDGE).toBe(0.1)
    expect(validateRoomPolygon(sliver)).toBe(false)
  })
  it('rejects reversed winding (negative signed area)', () => {
    const reversed = [...L].reverse()
    expect(signedPolygonArea(L)).toBeGreaterThan(0)
    expect(signedPolygonArea(reversed)).toBeLessThan(0)
    expect(validateRoomPolygon(reversed)).toBe(false)
  })
})
```

The centroid expectations are hand-derived by decomposition (shown in the test comment); re-derive them yourself before trusting the assertion, and if your derivation disagrees, fix the derivation or the implementation — never the assertion to match the code.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/model/polygon.test.ts` — expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/model/polygon.ts`:

```ts
import { polygonArea, roundCm } from './geometry'
import type { Rect, Vec2 } from './types'

export const MIN_EDGE = 0.1

const EPS = 1e-9

export function isRectilinear(polygon: Vec2[]): boolean {
  const n = polygon.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    if ((dx === 0) === (dy === 0)) return false // degenerate or diagonal
  }
  return true
}

interface Seg {
  a: Vec2
  b: Vec2
  horizontal: boolean
}

function seg(polygon: Vec2[], i: number): Seg {
  const a = polygon[i]
  const b = polygon[(i + 1) % polygon.length]
  return { a, b, horizontal: a.y === b.y }
}

const lo = (s: Seg) => (s.horizontal ? Math.min(s.a.x, s.b.x) : Math.min(s.a.y, s.b.y))
const hi = (s: Seg) => (s.horizontal ? Math.max(s.a.x, s.b.x) : Math.max(s.a.y, s.b.y))
const level = (s: Seg) => (s.horizontal ? s.a.y : s.a.x)

function segsTouch(p: Seg, q: Seg): boolean {
  if (p.horizontal === q.horizontal) {
    // parallel: touch only if on the same line with overlapping extents
    return level(p) === level(q) && lo(p) <= hi(q) + EPS && lo(q) <= hi(p) + EPS
  }
  const h = p.horizontal ? p : q
  const v = p.horizontal ? q : p
  return (
    level(v) >= lo(h) - EPS && level(v) <= hi(h) + EPS &&
    level(h) >= lo(v) - EPS && level(h) <= hi(v) + EPS
  )
}

export function isSimplePolygon(polygon: Vec2[]): boolean {
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) continue
      if (segsTouch(seg(polygon, i), seg(polygon, j))) return false
    }
  }
  return true
}

export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function polygonCentroid(polygon: Vec2[]): Vec2 {
  let area2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]
    const q = polygon[(i + 1) % polygon.length]
    const cross = p.x * q.y - q.x * p.y
    area2 += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  if (area2 === 0) return polygon[0]
  return { x: cx / (3 * area2), y: cy / (3 * area2) }
}

export function polygonBounds(polygon: Vec2[]): Rect {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function minEdgeLength(polygon: Vec2[]): number {
  let min = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    min = Math.min(min, Math.hypot(b.x - a.x, b.y - a.y))
  }
  return min
}

export function signedPolygonArea(polygon: Vec2[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function validateRoomPolygon(polygon: Vec2[]): boolean {
  return (
    isRectilinear(polygon) &&
    isSimplePolygon(polygon) &&
    minEdgeLength(polygon) >= MIN_EDGE - EPS &&
    signedPolygonArea(polygon) > 0 // positive = rectToPolygon winding; negative = reversed, rejected
  )
}
```

NOTE `roundCm` import is used by Task 2's additions to this file; if the linter complains before Task 2, drop it here and add it there.

- [ ] **Step 4: Run tests** — `npx vitest run src/model/polygon.test.ts` — expected: PASS (with your hand-derived centroid values).

- [ ] **Step 5: Tighten zod**

In `src/model/serialization.ts`, the room `polygon` schema gains two refines after the existing area refine:

```ts
.refine((poly) => isRectilinear(poly), { message: 'non-rectilinear polygon' })
.refine((poly) => isSimplePolygon(poly), { message: 'self-intersecting polygon' })
```

(import both from `./polygon`). Add to `src/model/serialization.test.ts`:

```ts
it('rejects non-rectilinear and self-crossing room polygons', () => {
  const base = createDefaultPlan()
  const diag = { id: 'r1', name: 'A', color: '#8ecae6', polygon: [
    { x: 0, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 3 }, { x: 0, y: 2 } ] }
  expect(parsePlan(serializePlan({ ...base, rooms: [diag] } as Plan))).toBeNull()
  const lShape = { id: 'r1', name: 'A', color: '#8ecae6', polygon: [
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 1 },
    { x: 4, y: 3 }, { x: 0, y: 3 } ] }
  expect(parsePlan(serializePlan({ ...base, rooms: [lShape] } as Plan))).not.toBeNull()
})
```

- [ ] **Step 6: Run** — `npx vitest run src/model` then `npm test`, `npx tsc --noEmit` — expected: all PASS/clean.

- [ ] **Step 7: Commit**

```bash
git add src/model
git commit -m "feat: rectilinear polygon predicates, metrics, and import validation"
```

---

### Task 2: Collinear merge with edge mapping

**Files:**
- Modify: `src/model/polygon.ts`
- Test: `src/model/polygon.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces (used by Task 3's plan-level ops):
  - `interface MergeResult { polygon: Vec2[]; edgeIndexMap: number[]; offsetShift: number[] }` — `edgeIndexMap[old]` = new edge index for old edge `old`; `offsetShift[old]` = meters to ADD to an offset measured from old edge `old`'s start so it measures from the new (merged) edge's start
  - `mergeCollinear(polygon: Vec2[]): MergeResult` — removes straight-through vertices; identity mapping when nothing merges; may rotate the vertex start so index 0 is a kept corner

- [ ] **Step 1: Write failing tests**

Append to `src/model/polygon.test.ts`:

```ts
import { mergeCollinear } from './polygon'

describe('mergeCollinear', () => {
  it('identity on a canonical rect', () => {
    const rect = rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })
    const r = mergeCollinear(rect)
    expect(r.polygon).toEqual(rect)
    expect(r.edgeIndexMap).toEqual([0, 1, 2, 3])
    expect(r.offsetShift).toEqual([0, 0, 0, 0])
  })

  it('merges a split vertex back into one edge with offset shifts', () => {
    // rect top edge split at x=1.5: vertices v0(0,0) v1(1.5,0) v2(4,0) v3(4,3) v4(0,3)
    const split: Vec2[] = [
      { x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ]
    const r = mergeCollinear(split)
    expect(r.polygon).toEqual(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 }))
    // old edge 0 (v0→v1) → new edge 0, shift 0; old edge 1 (v1→v2) → new edge 0, shift 1.5
    expect(r.edgeIndexMap[0]).toBe(0)
    expect(r.edgeIndexMap[1]).toBe(0)
    expect(r.offsetShift[1]).toBe(1.5)
    // later edges shift down by one
    expect(r.edgeIndexMap[2]).toBe(1)
    expect(r.edgeIndexMap[3]).toBe(2)
    expect(r.offsetShift[2]).toBe(0)
  })

  it('handles a removable vertex at index 0 by rotating the start', () => {
    // same rect but listed starting at the straight-through vertex (1.5, 0)
    const rotated: Vec2[] = [
      { x: 1.5, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 },
    ]
    const r = mergeCollinear(rotated)
    expect(r.polygon).toHaveLength(4)
    expect(r.polygon.map((p) => `${p.x},${p.y}`)).toContain('0,0')
    // every old edge maps into range and shifts are non-negative
    for (let i = 0; i < 5; i++) {
      expect(r.edgeIndexMap[i]).toBeGreaterThanOrEqual(0)
      expect(r.edgeIndexMap[i]).toBeLessThan(4)
      expect(r.offsetShift[i]).toBeGreaterThanOrEqual(0)
    }
  })
})
```

- [ ] **Step 2: Run to verify failure** — expected: FAIL (`mergeCollinear` not exported).

- [ ] **Step 3: Implement**

Append to `src/model/polygon.ts`:

```ts
export interface MergeResult {
  polygon: Vec2[]
  edgeIndexMap: number[]
  offsetShift: number[]
}

export function mergeCollinear(polygon: Vec2[]): MergeResult {
  const n = polygon.length
  const keep = polygon.map((_, i) => {
    const prev = polygon[(i - 1 + n) % n]
    const cur = polygon[i]
    const next = polygon[(i + 1) % n]
    const prevVertical = prev.x === cur.x
    const nextVertical = cur.x === next.x
    return prevVertical !== nextVertical // corners stay, straight-throughs go
  })
  if (keep.every(Boolean)) {
    return {
      polygon: [...polygon],
      edgeIndexMap: polygon.map((_, i) => i),
      offsetShift: polygon.map(() => 0),
    }
  }
  const first = keep.findIndex(Boolean)
  const outVertices: Vec2[] = []
  const edgeIndexMap = new Array<number>(n)
  const offsetShift = new Array<number>(n)
  let newEdge = -1
  let acc = 0
  for (let k = 0; k < n; k++) {
    const oi = (k + first) % n
    if (keep[oi]) {
      outVertices.push(polygon[oi])
      newEdge += 1
      acc = 0
    } else {
      const prev = polygon[(oi - 1 + n) % n]
      const cur = polygon[oi]
      acc += Math.hypot(cur.x - prev.x, cur.y - prev.y)
    }
    edgeIndexMap[oi] = newEdge
    offsetShift[oi] = acc
  }
  return { polygon: outVertices, edgeIndexMap, offsetShift }
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/model/polygon.test.ts` — expected: PASS. Sanity-check the rotation case by hand: with `first` = index of the first kept corner, every old edge's `newEdge` counter starts at the first kept vertex — confirm the rotated-start test's expectations hold before moving on.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "feat: collinear merge with edge-index and offset mapping"
```

---

### Task 3: Plan-level editing primitives with attachment remapping

**Files:**
- Modify: `src/model/polygon.ts`
- Test: `src/model/polygon.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1–2; `roomEdge`, `clampOffset` from `./openings`; `Plan`, `Room`, `WallItem` types; `roundCm`.
- Produces (the ONLY polygon-editing API the store may call):
  - `translateRoom(plan: Plan, roomId: string, delta: Vec2): Plan | null`
  - `pushRoomEdge(plan: Plan, roomId: string, edgeIndex: number, coordinate: number): Plan | null` — moves a horizontal edge to `y = coordinate` / vertical edge to `x = coordinate`. When a neighbor edge is PARALLEL to the pushed edge (exactly the split-vertex case), a connector vertex is inserted so the connector stays perpendicular — a naive endpoint move would create a diagonal. Zero-length edges produced by a flush push are deduped. Both insertion and dedupe remap attachment indices. NO collinear merge (drag-stable indices; merge is a separate drag-end action). A connector shorter than `MIN_EDGE` fails validation, so pushes smaller than 0.1 m away from flush are rejected (known, accepted UX: a notch push "engages" at 10 cm)
  - `splitRoomEdge(plan: Plan, roomId: string, edgeIndex: number, t: number): Plan | null` — inserts a vertex at distance t (cm-rounded) along the edge; both segments ≥ `MIN_EDGE`; remaps attachments per the split rule
  - `moveRoomVertex(plan: Plan, roomId: string, vertexIndex: number, point: Vec2): Plan | null` — corner move propagating to both neighbors (prev/next vertex shares x if its edge is vertical, y if horizontal); NO merge
  - `mergeRoomCollinear(plan: Plan, roomId: string): Plan` — canonicalizes and remaps attachments (identity-safe)
  - All return `null` (or the input plan for merge) when the result violates `validateRoomPolygon`; all coordinates cm-rounded; attachments (openings AND wall furniture on the room) re-clamped via `clampOffset` against their (possibly new) edge lengths.

- [ ] **Step 1: Write failing tests**

Append to `src/model/polygon.test.ts` (imports: the four ops + `mergeRoomCollinear`; `createDefaultPlan` from `./serialization`; `Opening`, `Plan`, `Room`, `WallItem` types):

```ts
const room = (polygon: Vec2[]): Room => ({ id: 'r1', name: 'A', color: '#8ecae6', polygon })
const door = (edgeIndex: number, offset: number): Opening => ({
  id: 'd1', kind: 'door', roomId: 'r1', edgeIndex, offset, width: 0.9, height: 2.1, sillHeight: 0,
})
const art = (edgeIndex: number, offset: number): WallItem => ({
  id: 'w1', catalogId: 'wall-art', mount: 'wall', roomId: 'r1', edgeIndex, offset,
  elevation: 1.4, size: { width: 0.8, depth: 0.05, height: 0.6 },
})
const planWith = (r: Room, openings: Opening[] = [], furniture: WallItem[] = []): Plan => ({
  ...createDefaultPlan(), rooms: [r], openings, furniture,
})

describe('translateRoom', () => {
  it('moves every vertex and keeps attachments untouched', () => {
    const p = planWith(room(rectToPolygon({ x: 1, y: 1, width: 3, height: 2 })), [door(0, 1.5)])
    const out = translateRoom(p, 'r1', { x: 0.5, y: -0.5 })!
    expect(out.rooms[0].polygon[0]).toEqual({ x: 1.5, y: 0.5 })
    expect(out.openings[0]).toEqual(p.openings[0])
  })
})

describe('pushRoomEdge', () => {
  const p = planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })), [door(1, 1.5)])
  it('slides a wall; attachments on neighbors re-clamp', () => {
    // edge 1 is the right wall (x=4, length 3); door at offset 1.5 on it
    // push the TOP edge (0) down to y=2: right wall shrinks to length 1 → door offset clamps
    const out = pushRoomEdge(p, 'r1', 0, 2)!
    expect(out.rooms[0].polygon).toEqual(rectToPolygon({ x: 0, y: 2, width: 4, height: 1 }))
    expect(out.openings[0].offset).toBe(0.55) // clampOffset(1.5, 0.9, 1) → 1 − 0.45
  })
  it('rejects pushing through the opposite wall', () => {
    expect(pushRoomEdge(p, 'r1', 0, 3)).toBeNull()   // area 0
    expect(pushRoomEdge(p, 'r1', 0, 3.5)).toBeNull() // inverted / self-intersecting
  })
  it('rejects a push that would create a sub-MIN_EDGE neighbor', () => {
    expect(pushRoomEdge(p, 'r1', 0, 2.95)).toBeNull()
  })
})

describe('splitRoomEdge', () => {
  const base = planWith(
    room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })),
    [door(0, 1.0), { ...door(0, 3.0), id: 'd2' }],
    [art(2, 2.0)],
  )
  it('splits the top edge; items re-home by center; later indices shift', () => {
    const out = splitRoomEdge(base, 'r1', 0, 2)!
    expect(out.rooms[0].polygon).toHaveLength(5)
    expect(out.rooms[0].polygon[1]).toEqual({ x: 2, y: 0 })
    const d1 = out.openings.find((o) => o.id === 'd1')!
    const d2 = out.openings.find((o) => o.id === 'd2')!
    expect([d1.edgeIndex, d1.offset]).toEqual([0, 1.0])   // center 1.0 < 2 → first sub-edge
    expect([d2.edgeIndex, d2.offset]).toEqual([1, 1.0])   // center 3.0 ≥ 2 → second, offset 3−2
    const w = out.furniture[0] as WallItem
    expect(w.edgeIndex).toBe(3)                            // old edge 2 shifts +1
    expect(w.offset).toBe(2.0)
  })
  it('rejects sliver splits', () => {
    expect(splitRoomEdge(base, 'r1', 0, 0.05)).toBeNull()
    expect(splitRoomEdge(base, 'r1', 0, 3.95)).toBeNull()
  })
})

describe('split → push → merge round-trip', () => {
  it('a notch pushed flush merges back to the original rect and re-homes the door', () => {
    const p = planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })), [{ ...door(0, 3.0), id: 'd1' }])
    const split = splitRoomEdge(p, 'r1', 0, 2)!
    // door center 3.0 ≥ 2 → re-homed to the second sub-edge (index 1) at offset 1.0
    // push the FIRST sub-edge (edge 0, y=0) down to 1:
    //   prev neighbor (left wall) is perpendicular → endpoint moves; next neighbor (second
    //   sub-edge) is PARALLEL → connector vertex (2, 0) inserted after the moved endpoint
    //   → polygon (0,1),(2,1),(2,0),(4,0),(4,3),(0,3) — a proper L, 6 vertices
    const notched = pushRoomEdge(split, 'r1', 0, 1)!
    expect(notched.rooms[0].polygon).toEqual([
      { x: 0, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ])
    expect(validateRoomPolygon(notched.rooms[0].polygon)).toBe(true)
    // door's edge (old index 1, second sub-edge) shifted +1 by the connector insertion → index 2, offset intact
    const d = notched.openings[0]
    expect([d.edgeIndex, d.offset]).toEqual([2, 1.0])
    // push the notch flush: endpoints return to y=0, the connector collapses to zero length
    // and is deduped → 5 vertices with a collinear pair; drag-end merge → original rect
    const flush = pushRoomEdge(notched, 'r1', 0, 0)!
    expect(flush.rooms[0].polygon).toHaveLength(5)
    const merged = mergeRoomCollinear(flush, 'r1')
    expect(merged.rooms[0].polygon).toHaveLength(4)
    expect(merged.openings[0].edgeIndex).toBe(0)
    expect(merged.openings[0].offset).toBe(3.0)
    expect(polygonArea(merged.rooms[0].polygon)).toBe(12)
  })
})

describe('moveRoomVertex', () => {
  it('reproduces rect corner-resize semantics', () => {
    const p = planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })))
    const out = moveRoomVertex(p, 'r1', 0, { x: 1, y: 0.5 })!
    expect(out.rooms[0].polygon).toEqual(rectToPolygon({ x: 1, y: 0.5, width: 3, height: 2.5 }))
  })
  it('rejects a move that collapses an edge below MIN_EDGE', () => {
    const p = planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 })))
    expect(moveRoomVertex(p, 'r1', 0, { x: 3.95, y: 0 })).toBeNull()
  })
})
```

IMPORTANT verification duty: before running, re-derive by hand which polygon index each rect edge is (`rectToPolygon` order: edge 0 = top y=const, 1 = right x=const, 2 = bottom, 3 = left), which sub-edge a split's insert produces, and the exact notch polygon after the round-trip push (the expected vertex list is spelled out in the round-trip test — walk it). If your derivation disagrees, fix the implementation to match the Global Constraints remap rules, never the assertion to match the code.

- [ ] **Step 2: Run to verify failure** — expected: FAIL (ops not exported).

- [ ] **Step 3: Implement**

Append to `src/model/polygon.ts` (imports: `clampOffset`, `roomEdge` from `./openings`; types `Opening`, `PlacedItem`, `Plan`, `Room`, `WallItem` from `./types`; `roundCm` from `./geometry`):

```ts
interface AttachmentRemap {
  edgeIndex: (old: number) => number
  offsetShift: (old: number) => number
}

const IDENTITY: AttachmentRemap = { edgeIndex: (i) => i, offsetShift: () => 0 }

function withRoomPolygon(
  plan: Plan,
  roomId: string,
  polygon: Vec2[],
  remap: AttachmentRemap,
): Plan | null {
  if (!validateRoomPolygon(polygon)) return null
  const nextRoom = { ...plan.rooms.find((r) => r.id === roomId)!, polygon }
  const homeEdge = (edgeIndex: number, offset: number, width: number) => {
    const newIndex = remap.edgeIndex(edgeIndex)
    const edge = roomEdge(nextRoom, newIndex)
    const raw = offset + remap.offsetShift(edgeIndex)
    return { edgeIndex: newIndex, offset: edge ? clampOffset(raw, width, edge.length) : raw }
  }
  const openings = plan.openings.map((o) =>
    o.roomId === roomId ? { ...o, ...homeEdge(o.edgeIndex, o.offset, o.width) } : o,
  )
  const furniture = plan.furniture.map((f) =>
    f.mount === 'wall' && f.roomId === roomId
      ? { ...f, ...homeEdge(f.edgeIndex, f.offset, f.size.width) }
      : f,
  )
  return {
    ...plan,
    rooms: plan.rooms.map((r) => (r.id === roomId ? nextRoom : r)),
    openings,
    furniture,
  }
}

export function translateRoom(plan: Plan, roomId: string, delta: Vec2): Plan | null {
  const r = plan.rooms.find((room) => room.id === roomId)
  if (!r || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return null
  const polygon = r.polygon.map((p) => ({ x: roundCm(p.x + delta.x), y: roundCm(p.y + delta.y) }))
  return withRoomPolygon(plan, roomId, polygon, IDENTITY)
}

export function pushRoomEdge(plan: Plan, roomId: string, edgeIndex: number, coordinate: number): Plan | null {
  const r = plan.rooms.find((room) => room.id === roomId)
  if (!r || !Number.isFinite(coordinate)) return null
  const n = r.polygon.length
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return null
  const a = r.polygon[edgeIndex]
  const b = r.polygon[(edgeIndex + 1) % n]
  const horizontal = a.y === b.y
  const c = roundCm(coordinate)
  const movedA = horizontal ? { ...a, y: c } : { ...a, x: c }
  const movedB = horizontal ? { ...b, y: c } : { ...b, x: c }

  // A neighbor edge PARALLEL to the pushed edge (the split-vertex case) needs a perpendicular
  // connector: keep the original endpoint as an inserted vertex. Perpendicular neighbors just
  // stretch, as before.
  const prevV = r.polygon[(edgeIndex - 1 + n) % n]
  const nextV = r.polygon[(edgeIndex + 2) % n]
  const prevParallel = horizontal ? prevV.y === a.y : prevV.x === a.x
  const nextParallel = horizontal ? nextV.y === b.y : nextV.x === b.x

  const rebuilt: Vec2[] = []
  for (let i = 0; i < n; i++) {
    if (i === edgeIndex) {
      if (prevParallel) rebuilt.push(a) // connector vertex (unmoved copy)
      rebuilt.push(movedA, movedB)
      if (nextParallel) rebuilt.push(b)
      i += 1 // consumed b's slot too
    } else if (i !== (edgeIndex + 1) % n) {
      rebuilt.push(r.polygon[i])
    }
  }
  // NOTE: the loop above assumes edgeIndex + 1 < n (b not wrapping to index 0). Handle the wrap
  // by rotating the polygon so the pushed edge doesn't wrap before rebuilding, then the index
  // math below stays uniform — see rotateSoEdgeDoesNotWrap helper you'll need to write:
  // const { polygon: work, shift } = rotateSoEdgeDoesNotWrap(r.polygon, edgeIndex) and compose
  // shift into the remap. Keep the helper private to this module and unit-test it via the
  // public ops (push a rect's edge 3, which wraps: vertices 3 and 0).

  // index remap for the insertions (before dedupe)
  const insBefore = prevParallel ? 1 : 0
  const insAfter = nextParallel ? 1 : 0
  const afterInsert = (old: number): number => {
    if (old < edgeIndex) return old
    if (old === edgeIndex) return old + insBefore
    return old + insBefore + insAfter
  }

  // a flush push collapses a connector to zero length — dedupe consecutive equal vertices,
  // remapping edges that collapse onto the following edge (offset clamps to that edge)
  const { polygon, dedupeMap } = dedupeZeroEdges(rebuilt)
  if (!validateRoomPolygon(polygon)) return null
  const remap: AttachmentRemap = {
    edgeIndex: (old) => dedupeMap[afterInsert(old)],
    offsetShift: () => 0,
  }
  return withRoomPolygon(plan, roomId, polygon, remap)
}

function dedupeZeroEdges(polygon: Vec2[]): { polygon: Vec2[]; dedupeMap: number[] } {
  const n = polygon.length
  const out: Vec2[] = []
  const dedupeMap = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const cur = polygon[i]
    const next = polygon[(i + 1) % n]
    const zero = cur.x === next.x && cur.y === next.y
    dedupeMap[i] = zero ? -1 : -2 // fill below once final indices are known
    if (!zero) out.push(cur)
  }
  // assign final edge indices: each kept old edge maps in order; a collapsed edge maps to the
  // NEXT kept edge (attachments on a zero-length edge re-home there, offset clamps to 0-ish)
  let newIdx = 0
  const firstPass = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    if (dedupeMap[i] === -2) firstPass[i] = newIdx++
    else firstPass[i] = -1
  }
  for (let i = 0; i < n; i++) {
    if (firstPass[i] !== -1) {
      dedupeMap[i] = firstPass[i]
    } else {
      // walk forward to the next kept edge (wrapping)
      let j = i
      while (firstPass[j % n] === -1) j++
      dedupeMap[i] = firstPass[j % n]
    }
  }
  return { polygon: out, dedupeMap }
}

export function splitRoomEdge(plan: Plan, roomId: string, edgeIndex: number, t: number): Plan | null {
  const r = plan.rooms.find((room) => room.id === roomId)
  const edge = r ? roomEdge(r, edgeIndex) : null
  if (!r || !edge || !Number.isFinite(t)) return null
  const tc = roundCm(t)
  if (tc < MIN_EDGE || tc > edge.length - MIN_EDGE) return null
  const point = { x: roundCm(edge.a.x + edge.ux * tc), y: roundCm(edge.a.y + edge.uy * tc) }
  const polygon = [...r.polygon]
  polygon.splice(edgeIndex + 1, 0, point)
  if (!validateRoomPolygon(polygon)) return null
  const nextRoom = { ...r, polygon }
  // one-pass routing: items before the split edge keep their index; after it shift +1;
  // ON it, the item's CENTER picks the sub-edge and the offset is re-based for the second
  const route = <T extends { edgeIndex: number; offset: number }>(item: T, width: number): T => {
    if (item.edgeIndex < edgeIndex) return item
    if (item.edgeIndex > edgeIndex) return { ...item, edgeIndex: item.edgeIndex + 1 }
    const toSecond = item.offset >= tc
    const newIndex = toSecond ? edgeIndex + 1 : edgeIndex
    const e = roomEdge(nextRoom, newIndex)!
    const rebased = toSecond ? item.offset - tc : item.offset
    return { ...item, edgeIndex: newIndex, offset: clampOffset(rebased, width, e.length) }
  }
  return {
    ...plan,
    rooms: plan.rooms.map((room) => (room.id === roomId ? nextRoom : room)),
    openings: plan.openings.map((o) => (o.roomId === roomId ? route(o, o.width) : o)),
    furniture: plan.furniture.map((f) =>
      f.mount === 'wall' && f.roomId === roomId ? route(f, f.size.width) : f,
    ),
  }
}

export function moveRoomVertex(plan: Plan, roomId: string, vertexIndex: number, point: Vec2): Plan | null {
  const r = plan.rooms.find((room) => room.id === roomId)
  if (!r || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  const n = r.polygon.length
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= n) return null
  const prev = (vertexIndex - 1 + n) % n
  const next = (vertexIndex + 1) % n
  const prevVertical = r.polygon[prev].x === r.polygon[vertexIndex].x
  const nextVertical = r.polygon[vertexIndex].x === r.polygon[next].x
  if (prevVertical === nextVertical) return null // straight-through vertex: not directly draggable
  const p = { x: roundCm(point.x), y: roundCm(point.y) }
  const polygon = r.polygon.map((v, i) => {
    if (i === vertexIndex) return p
    if (i === prev) return prevVertical ? { ...v, x: p.x } : { ...v, y: p.y }
    if (i === next) return nextVertical ? { ...v, x: p.x } : { ...v, y: p.y }
    return v
  })
  return withRoomPolygon(plan, roomId, polygon, IDENTITY)
}

export function mergeRoomCollinear(plan: Plan, roomId: string): Plan {
  const r = plan.rooms.find((room) => room.id === roomId)
  if (!r) return plan
  const merged = mergeCollinear(r.polygon)
  if (merged.polygon.length === r.polygon.length) return plan
  const remap: AttachmentRemap = {
    edgeIndex: (old) => merged.edgeIndexMap[old],
    offsetShift: (old) => merged.offsetShift[old],
  }
  return withRoomPolygon(plan, roomId, merged.polygon, remap) ?? plan
}
```

The `rotateSoEdgeDoesNotWrap` note in `pushRoomEdge` is a REQUIRED part of the implementation, not optional: pushing edge `n−1` (which wraps from the last vertex to vertex 0) must work — write the helper (rotate the vertex array so the pushed edge starts at index 0, remember the rotation shift, apply the push logic, and compose the shift back into the attachment remap), and cover it with a test that pushes a rect's LEFT wall (edge 3): `pushRoomEdge(planWith(room(rectToPolygon({ x: 0, y: 0, width: 4, height: 3 }))), 'r1', 3, 1)` must yield `rectToPolygon({ x: 1, y: 0, width: 3, height: 3 })` with door attachments on edges 0–2 unchanged.

- [ ] **Step 4: Run tests** — `npx vitest run src/model/polygon.test.ts` — expected: PASS (after your hand-derivation pass from Step 1).

- [ ] **Step 5: Full model suite** — `npx vitest run src/model`, `npx tsc --noEmit` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/model
git commit -m "feat: polygon editing primitives with attachment remapping"
```

---

### Task 4: Store actions

**Files:**
- Modify: `src/store/planStore.ts`
- Test: `src/store/planStore.test.ts` (extend)

**Interfaces:**
- Consumes: Task 3 ops; existing store conventions.
- Produces (used by the editor in Tasks 5–6):
  - `moveRoom(id: string, delta: Vec2): void`
  - `pushRoomEdge(id: string, edgeIndex: number, coordinate: number): void`
  - `splitRoomEdge(id: string, edgeIndex: number, t: number): void`
  - `moveRoomVertex(id: string, vertexIndex: number, point: Vec2): void`
  - `mergeRoomCollinear(id: string): void`
  - Each wraps the pure op; a `null` result is a no-op (state unchanged). `updateRoomRect` stays (properties panel, rect rooms only).

- [ ] **Step 1: Write failing tests**

Append to `src/store/planStore.test.ts` (follow its reset/`st()` conventions):

```ts
describe('polygon room actions', () => {
  const setupRoom = () => {
    const id = usePlanStore.getState().addRoom() // 3×3 rect centered in the apartment
    return id
  }

  it('moveRoom translates; invalid results are no-ops', () => {
    const id = setupRoom()
    const st = () => usePlanStore.getState()
    const before = st().plan.rooms[0].polygon.map((p) => ({ ...p }))
    st().moveRoom(id, { x: 0.5, y: 0 })
    expect(st().plan.rooms[0].polygon[0].x).toBe(before[0].x + 0.5)
    st().moveRoom(id, { x: Number.NaN, y: 0 })
    expect(st().plan.rooms[0].polygon[0].x).toBe(before[0].x + 0.5)
  })

  it('split + push produce an L; merge at drag end restores after flush push', () => {
    const id = setupRoom()
    const st = () => usePlanStore.getState()
    st().splitRoomEdge(id, 0, 1.5)
    expect(st().plan.rooms[0].polygon).toHaveLength(5)
    const topY = st().plan.rooms[0].polygon[0].y
    st().pushRoomEdge(id, 0, topY + 1)
    expect(st().plan.rooms[0].polygon.length).toBeGreaterThanOrEqual(6)
    st().pushRoomEdge(id, 0, topY)
    st().mergeRoomCollinear(id)
    expect(st().plan.rooms[0].polygon).toHaveLength(4)
  })

  it('rejects invalid pushes and splits as no-ops', () => {
    const id = setupRoom()
    const st = () => usePlanStore.getState()
    const before = st().plan.rooms[0].polygon
    const topY = before[0].y
    st().pushRoomEdge(id, 0, topY + 3) // through the opposite wall
    expect(st().plan.rooms[0].polygon).toEqual(before)
    st().splitRoomEdge(id, 0, 0.02)
    expect(st().plan.rooms[0].polygon).toEqual(before)
  })

  it('moveRoomVertex on a rect corner matches updateRoomRect semantics', () => {
    const id = setupRoom()
    const st = () => usePlanStore.getState()
    const p0 = st().plan.rooms[0].polygon[0]
    st().moveRoomVertex(id, 0, { x: p0.x + 0.5, y: p0.y + 0.5 })
    const rect = polygonToRect(st().plan.rooms[0].polygon)!
    expect(rect.x).toBe(p0.x + 0.5)
    expect(rect.y).toBe(p0.y + 0.5)
    expect(rect.width).toBe(2.5)
    expect(rect.height).toBe(2.5)
  })
})
```

(import `polygonToRect` from `../model/geometry` if not present.)

- [ ] **Step 2: Run to verify failure** — expected: FAIL.

- [ ] **Step 3: Implement**

In `src/store/planStore.ts`, import the five ops from `../model/polygon` (alias to avoid name collisions with the actions, e.g. `import { mergeRoomCollinear as mergeRoomCollinearOp, moveRoomVertex as moveRoomVertexOp, pushRoomEdge as pushRoomEdgeOp, splitRoomEdge as splitRoomEdgeOp, translateRoom } from '../model/polygon'`). Add to `PlanState` and implement:

```ts
moveRoom: (id, delta) =>
  set((s) => {
    const next = translateRoom(s.plan, id, delta)
    return next ? { plan: next } : s
  }),

pushRoomEdge: (id, edgeIndex, coordinate) =>
  set((s) => {
    const next = pushRoomEdgeOp(s.plan, id, edgeIndex, coordinate)
    return next ? { plan: next } : s
  }),

splitRoomEdge: (id, edgeIndex, t) =>
  set((s) => {
    const next = splitRoomEdgeOp(s.plan, id, edgeIndex, t)
    return next ? { plan: next } : s
  }),

moveRoomVertex: (id, vertexIndex, point) =>
  set((s) => {
    const next = moveRoomVertexOp(s.plan, id, vertexIndex, point)
    return next ? { plan: next } : s
  }),

mergeRoomCollinear: (id) =>
  set((s) => ({ plan: mergeRoomCollinearOp(s.plan, id) })),
```

- [ ] **Step 4: Run** — `npx vitest run src/store/planStore.test.ts`, then `npm test`, `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat: polygon room store actions"
```

---

### Task 5: 2D rendering and hit-testing for polygon rooms

**Files:**
- Modify: `src/editor2d/render.ts` (drawRooms)
- Modify: `src/editor2d/interactions.ts` (hitRoom)
- Modify: `src/model/snapping.ts` (collectSnapLines takes rooms)
- Test: `src/editor2d/interactions.test.ts`, `src/model/snapping.test.ts` (update)

**Interfaces:**
- Consumes: `pointInPolygon`, `polygonBounds`, `polygonCentroid` from polygon; `polygonArea` from geometry.
- Produces:
  - `drawRooms(container, plan, selectedId, viewport)` — polygon fill/tint/stroke via `g.poly(screenPoints)`; label `${name}\n${polygonArea(polygon).toFixed(1)} m²` at the centroid; warning tint when `polygonBounds` overlaps another room's bounds (`rectsOverlap`) or leaves the apartment (`rectInBounds` on bounds)
  - `hitRoom(rooms: Room[], world: Vec2): string | null` — topmost-first `pointInPolygon`
  - `collectSnapLines(rooms: Room[], apartment: Apartment): SnapLines` — SIGNATURE CHANGE: xs = every vertical edge's x, ys = every horizontal edge's y, plus apartment bounds. Update its unit tests and BOTH call sites in Editor2D (`otherRects` becomes `otherRooms` returning `Room[]`).

- [ ] **Step 1: Update snapping tests, run (FAIL), implement**

In `src/model/snapping.test.ts`, replace the `collectSnapLines` test with a rooms-based one:

```ts
it('collects lines from every rectilinear edge plus apartment bounds', () => {
  const apartment = { width: 10, depth: 8, wallHeight: 2.7 }
  const lRoom = { id: 'r1', name: 'A', color: '#8ecae6', polygon: [
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 1 },
    { x: 4, y: 3 }, { x: 0, y: 3 } ] }
  const lines = collectSnapLines([lRoom], apartment)
  expect(lines.xs.sort((a, b) => a - b)).toEqual([0, 0, 2, 4, 10])
  expect(lines.ys.sort((a, b) => a - b)).toEqual([0, 0, 1, 3, 8])
})
```

Implementation in `src/model/snapping.ts` (import `Room` type):

```ts
export function collectSnapLines(rooms: Room[], apartment: Apartment): SnapLines {
  const xs = [0, apartment.width]
  const ys = [0, apartment.depth]
  for (const room of rooms) {
    const n = room.polygon.length
    for (let i = 0; i < n; i++) {
      const a = room.polygon[i]
      const b = room.polygon[(i + 1) % n]
      if (a.x === b.x) xs.push(a.x)
      else ys.push(a.y)
    }
  }
  return { xs, ys }
}
```

- [ ] **Step 2: hitRoom tests + implementation**

In `src/editor2d/interactions.test.ts`, update/extend the `hitRoom` tests: clicking inside an L's notch must return null (or the room below); inside the arm returns the room. Implementation:

```ts
export function hitRoom(rooms: Room[], world: Vec2): string | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    if (pointInPolygon(world, rooms[i].polygon)) return rooms[i].id
  }
  return null
}
```

- [ ] **Step 3: drawRooms**

Rewrite the room loop in `src/editor2d/render.ts` (keep tint/label layering):

```ts
export function drawRooms(container: Container, plan: Plan, selectedId: string | null, viewport: Viewport) {
  for (const child of container.removeChildren()) child.destroy(true)
  const entries = plan.rooms.map((room) => ({ room, bounds: polygonBounds(room.polygon) }))
  for (const { room, bounds } of entries) {
    const overlapping = entries.some(
      (other) => other.room.id !== room.id && rectsOverlap(bounds, other.bounds),
    )
    const warning = overlapping || !rectInBounds(bounds, plan.apartment)
    const selected = room.id === selectedId
    const pts = room.polygon.flatMap((p) => {
      const s = worldToScreen(viewport, p)
      return [s.x, s.y]
    })
    const g = new Graphics()
    g.poly(pts)
      .fill({ color: warning ? WARNING_COLOR : room.color, alpha: 0.55 })
      .stroke({ width: selected ? 3 : 1.5, color: selected ? 0x1d4ed8 : 0x475069 })
    container.addChild(g)
    const finish = room.floorMaterial ? floorFinish(room.floorMaterial) : undefined
    if (finish) {
      const tintG = new Graphics()
      tintG.poly(pts).fill({ color: finish.tint, alpha: 0.35 })
      container.addChild(tintG)
    }
    const c = worldToScreen(viewport, polygonCentroid(room.polygon))
    const label = new Text({
      text: `${room.name}\n${polygonArea(room.polygon).toFixed(1)} m²`,
      style: { fontSize: 13, fill: 0x1f2430, align: 'center' },
    })
    label.anchor.set(0.5)
    label.position.set(c.x, c.y)
    container.addChild(label)
  }
}
```

(imports: `pointInPolygon` not needed here; `polygonBounds`, `polygonCentroid` from `../model/polygon`; `polygonArea` from `../model/geometry`; `polygonToRect` may drop from this file's imports if now unused.)

- [ ] **Step 4: Run** — `npx vitest run src/editor2d src/model/snapping.test.ts`; then fix the two `collectSnapLines` call sites in Editor2D minimally so `npx tsc --noEmit` passes (`otherRects(excludeId)` → `otherRooms(excludeId): Room[]` returning `plan.rooms.filter(r => r.id !== excludeId)`); full `npm test` clean. The room move/resize drags still work through `updateRoomRect` until Task 6 replaces them.

- [ ] **Step 5: Commit**

```bash
git add src/editor2d src/model
git commit -m "feat: polygon room rendering, hit-testing, and edge snap lines"
```

---

### Task 6: Unified vertex/edge handles and editor drags

**Files:**
- Modify: `src/editor2d/interactions.ts` (new handle system; DELETE the rect one)
- Modify: `src/editor2d/render.ts` (drawPolygonHandles replaces drawHandles)
- Modify: `src/editor2d/Editor2D.tsx` (drag states, double-click split, merge on drag end)
- Test: `src/editor2d/interactions.test.ts` (replace rect-handle tests)

**Interfaces:**
- Consumes: Tasks 3–5; store actions from Task 4.
- Produces:
  - `interface PolygonHandle { kind: 'vertex' | 'edge'; index: number; point: Vec2 }`
  - `polygonHandles(room: Room): PolygonHandle[]` — vertex handles for CORNER vertices only (skip straight-through split vertices: prev/next edge orientations equal), edge handles at every edge midpoint
  - `hitPolygonHandle(room: Room, viewport: Viewport, screen: Vec2, radius?: number): PolygonHandle | null` — vertices win over edges; radius 8 px
  - `edgeIsHorizontal(polygon: Vec2[], edgeIndex: number): boolean`
  - `nearestRoomEdge(room: Room, viewport: Viewport, screen: Vec2, radius?: number): { edgeIndex: number; t: number } | null` — for double-click split (t = cm-rounded projection)
  - `drawPolygonHandles(g: Graphics, room: Room | null, viewport: Viewport): void` — squares (vertices) + smaller squares (edge midpoints), existing handle styling
  - DELETED: `HANDLE_IDS`, `HandleId`, `handlePositions`, `hitHandle`, `applyResize`, `drawHandles`. After this task `grep -rn "HandleId\|applyResize" src/` returns nothing.
  - Editor `DragState` replaces `{ kind: 'resize' … }` with `{ kind: 'pushEdge'; roomId; edgeIndex; horizontal }` and `{ kind: 'moveVertex'; roomId; vertexIndex }`; `{ kind: 'move' }` now stores `grabOffset` relative to `polygonBounds(room).x/y` and dispatches `moveRoom` deltas.

- [ ] **Step 1: Write failing handle tests**

Replace the `handlePositions`/`hitHandle`/`applyResize` describe blocks in `src/editor2d/interactions.test.ts` with:

```ts
import { edgeIsHorizontal, hitPolygonHandle, nearestRoomEdge, polygonHandles } from './interactions'

describe('polygonHandles', () => {
  const viewport = { scale: 100, offsetX: 0, offsetY: 0 }
  const rect = { id: 'r1', name: 'A', color: '#8ecae6', polygon: rectToPolygon({ x: 0, y: 0, width: 4, height: 3 }) }

  it('a rect exposes 4 vertex + 4 edge handles', () => {
    const handles = polygonHandles(rect)
    expect(handles.filter((h) => h.kind === 'vertex')).toHaveLength(4)
    expect(handles.filter((h) => h.kind === 'edge')).toHaveLength(4)
    expect(handles.find((h) => h.kind === 'edge' && h.index === 0)?.point).toEqual({ x: 2, y: 0 })
  })

  it('split vertices get no vertex handle but both sub-edges get edge handles', () => {
    const split = { ...rect, polygon: [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 } ] }
    const handles = polygonHandles(split)
    expect(handles.filter((h) => h.kind === 'vertex')).toHaveLength(4) // corner count unchanged
    expect(handles.filter((h) => h.kind === 'edge')).toHaveLength(5)
    expect(handles.some((h) => h.kind === 'vertex' && h.point.x === 2 && h.point.y === 0)).toBe(false)
  })

  it('hitPolygonHandle: vertex wins over edge within radius', () => {
    expect(hitPolygonHandle(rect, viewport, { x: 200, y: -3 })).toMatchObject({ kind: 'edge', index: 0 }) // top-edge midpoint (2,0) → screen (200,0)
    expect(hitPolygonHandle(rect, viewport, { x: 3, y: 4 })).toMatchObject({ kind: 'vertex', index: 0 }) // near (0,0)
    expect(hitPolygonHandle(rect, viewport, { x: 200, y: 150 })).toBeNull() // room center
  })

  it('edgeIsHorizontal and nearestRoomEdge', () => {
    expect(edgeIsHorizontal(rect.polygon, 0)).toBe(true)
    expect(edgeIsHorizontal(rect.polygon, 1)).toBe(false)
    expect(nearestRoomEdge(rect, viewport, { x: 150, y: 4 })).toEqual({ edgeIndex: 0, t: 1.5 })
    expect(nearestRoomEdge(rect, viewport, { x: 150, y: 150 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**, then implement in `src/editor2d/interactions.ts`:

```ts
export interface PolygonHandle {
  kind: 'vertex' | 'edge'
  index: number
  point: Vec2
}

export function polygonHandles(room: Room): PolygonHandle[] {
  const n = room.polygon.length
  const handles: PolygonHandle[] = []
  for (let i = 0; i < n; i++) {
    const prev = room.polygon[(i - 1 + n) % n]
    const cur = room.polygon[i]
    const next = room.polygon[(i + 1) % n]
    const corner = (prev.x === cur.x) !== (cur.x === next.x)
    if (corner) handles.push({ kind: 'vertex', index: i, point: cur })
  }
  for (let i = 0; i < n; i++) {
    const a = room.polygon[i]
    const b = room.polygon[(i + 1) % n]
    handles.push({ kind: 'edge', index: i, point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } })
  }
  return handles
}

export function hitPolygonHandle(room: Room, viewport: Viewport, screen: Vec2, radius = 8): PolygonHandle | null {
  const handles = polygonHandles(room)
  for (const kind of ['vertex', 'edge'] as const) {
    for (const h of handles) {
      if (h.kind !== kind) continue
      const s = worldToScreen(viewport, h.point)
      if (Math.abs(s.x - screen.x) <= radius && Math.abs(s.y - screen.y) <= radius) return h
    }
  }
  return null
}

export function edgeIsHorizontal(polygon: Vec2[], edgeIndex: number): boolean {
  return polygon[edgeIndex].y === polygon[(edgeIndex + 1) % polygon.length].y
}

export function nearestRoomEdge(room: Room, viewport: Viewport, screen: Vec2, radius = 8): { edgeIndex: number; t: number } | null {
  let best: { edgeIndex: number; t: number } | null = null
  let bestDist = radius
  for (let i = 0; i < room.polygon.length; i++) {
    const edge = roomEdge(room, i)
    if (!edge) continue
    const a = worldToScreen(viewport, edge.a)
    const b = worldToScreen(viewport, edge.b)
    const d = distToSegmentScreen(screen, a, b)
    if (d <= bestDist) {
      bestDist = d
      const world = screenToWorld(viewport, screen)
      best = { edgeIndex: i, t: roundCm(projectOntoEdge(edge, world)) }
    }
  }
  return best
}
```

Delete `HANDLE_IDS`, `HandleId`, `handlePositions`, `hitHandle`, `applyResize` (and their now-unused imports).

- [ ] **Step 3: drawPolygonHandles in render.ts**

Replace `drawHandles` with:

```ts
export function drawPolygonHandles(g: Graphics, room: Room | null, viewport: Viewport) {
  g.clear()
  if (!room) return
  for (const h of polygonHandles(room)) {
    const s = worldToScreen(viewport, h.point)
    const half = h.kind === 'vertex' ? 4 : 3
    g.rect(s.x - half, s.y - half, half * 2, half * 2)
      .fill({ color: h.kind === 'vertex' ? 0xffffff : 0xe8edff })
      .stroke({ width: 1.5, color: 0x1d4ed8 })
  }
}
```

(import `polygonHandles`; `Room` type.)

- [ ] **Step 4: Rewire Editor2D**

In `src/editor2d/Editor2D.tsx`:

1. `DragState`: replace `{ kind: 'resize'; roomId; handle: HandleId }` with:

```ts
| { kind: 'pushEdge'; roomId: string; edgeIndex: number; horizontal: boolean }
| { kind: 'moveVertex'; roomId: string; vertexIndex: number }
```

and change `{ kind: 'move' }` to `{ kind: 'move'; roomId: string; grabOffset: Vec2 }` where `grabOffset` = pointer world − `polygonBounds(room.polygon)` origin.

2. Pointerdown room-handle block (replacing the `hitHandle` block):

```ts
if (selectedRoom) {
  const handle = hitPolygonHandle(selectedRoom, viewport, screen)
  if (handle) {
    drag =
      handle.kind === 'edge'
        ? { kind: 'pushEdge', roomId: selectedRoom.id, edgeIndex: handle.index, horizontal: edgeIsHorizontal(selectedRoom.polygon, handle.index) }
        : { kind: 'moveVertex', roomId: selectedRoom.id, vertexIndex: handle.index }
    return
  }
}
```

Room-body click: `grabOffset` from `polygonBounds`:

```ts
const roomId = hitRoom(store.plan.rooms, world)
store.selectRoom(roomId)
if (roomId) {
  const b = polygonBounds(store.plan.rooms.find((r) => r.id === roomId)!.polygon)
  drag = { kind: 'move', roomId, grabOffset: { x: world.x - b.x, y: world.y - b.y } }
}
```

3. Pointermove branches — replace the `move` and `resize` branches:

```ts
if (drag.kind === 'move') {
  const activeDrag = drag
  const store = usePlanStore.getState()
  const room = store.plan.rooms.find((r) => r.id === activeDrag.roomId)
  if (!room) return
  const b = polygonBounds(room.polygon)
  const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
  const raw: Rect = { ...b, x: world.x - activeDrag.grabOffset.x, y: world.y - activeDrag.grabOffset.y }
  let target = { x: raw.x, y: raw.y }
  guides = []
  if (!altDown) {
    const lines = collectSnapLines(otherRooms(activeDrag.roomId), store.plan.apartment)
    const snapped = snapMove(raw, lines, snapOpts())
    guides = snapped.guides
    target = { x: snapped.x, y: snapped.y }
  }
  store.moveRoom(activeDrag.roomId, { x: roundCm(target.x - b.x), y: roundCm(target.y - b.y) })
  markDirty()
}

if (drag.kind === 'pushEdge') {
  const activeDrag = drag
  const store = usePlanStore.getState()
  const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
  let coordinate = activeDrag.horizontal ? world.y : world.x
  guides = []
  if (!altDown) {
    const lines = collectSnapLines(otherRooms(activeDrag.roomId), store.plan.apartment)
    const snapped = snapScalar(coordinate, activeDrag.horizontal ? lines.ys : lines.xs, snapOpts())
    coordinate = snapped.value
    if (snapped.guide !== null) guides.push({ axis: activeDrag.horizontal ? 'y' : 'x', position: snapped.guide })
  }
  store.pushRoomEdge(activeDrag.roomId, activeDrag.edgeIndex, roundCm(coordinate))
  markDirty()
}

if (drag.kind === 'moveVertex') {
  const activeDrag = drag
  const store = usePlanStore.getState()
  let point = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
  guides = []
  if (!altDown) {
    const lines = collectSnapLines(otherRooms(activeDrag.roomId), store.plan.apartment)
    const opts = snapOpts()
    const sx = snapScalar(point.x, lines.xs, opts)
    const sy = snapScalar(point.y, lines.ys, opts)
    point = { x: sx.value, y: sy.value }
    if (sx.guide !== null) guides.push({ axis: 'x', position: sx.guide })
    if (sy.guide !== null) guides.push({ axis: 'y', position: sy.guide })
  }
  store.moveRoomVertex(activeDrag.roomId, activeDrag.vertexIndex, point)
  markDirty()
}
```

4. Merge on drag end — in `endInteraction` (and Escape's drag-cancel path is covered because it calls nothing polygon-specific: merge only on END, Escape cancel does NOT merge):

```ts
if (drag.kind === 'pushEdge' || drag.kind === 'moveVertex') {
  usePlanStore.getState().mergeRoomCollinear(drag.roomId)
}
```

placed BEFORE `drag = { kind: 'idle' }` in `endInteraction` only (not in the Escape handler).

5. Double-click split — after the stage handlers, add:

```ts
app.stage.on('pointertap', (e) => {
  if (e.detail !== 2) return
  const store = usePlanStore.getState()
  if (store.placing || store.placingFurniture) return
  if (store.selection?.kind !== 'room') return
  const room = store.plan.rooms.find((r) => r.id === store.selection!.id)
  if (!room) return
  const hit = nearestRoomEdge(room, viewport, { x: e.global.x, y: e.global.y })
  if (hit) {
    store.splitRoomEdge(room.id, hit.edgeIndex, hit.t)
    markDirty()
  }
})
```

6. Ticker: `drawHandles(...)` call becomes `drawPolygonHandles(layers.handles, selectedRoom ?? null, viewport)` (no more `polygonToRect` for handles).
7. Update imports; remove `applyResize`/`hitHandle`/`HandleId` imports; `otherRects` → `otherRooms`.

- [ ] **Step 5: Verify** — `npm test`, `npx tsc --noEmit`, and `grep -rn "HandleId\|applyResize" src/` (empty). Manual sanity (`npm run dev`): rect rooms still move/resize identically; double-click top wall of a selected room → push a half → L appears; wall-snap guides appear; push flush → notch disappears on release.

- [ ] **Step 6: Commit**

```bash
git add src/editor2d
git commit -m "feat: unified polygon vertex/edge handles, split gesture, merge on drag end"
```

---

### Task 7: Properties panel — area and rect-only dimension fields

**Files:**
- Modify: `src/ui/PropertiesPanel.tsx`
- Test: `src/ui/PropertiesPanel.test.tsx` (extend)

**Interfaces:**
- Consumes: `polygonArea` from geometry; `polygonToRect`.
- Produces: RoomProps shows `Area` (read-only, `toFixed(1)` m²) for every room; X/Y/Width/Height NumberFields render only when `polygonToRect(room.polygon)` is non-null. Name/color/floor/wall-color/delete unchanged for all rooms.

- [ ] **Step 1: Failing tests**

Append to `src/ui/PropertiesPanel.test.tsx`:

```tsx
it('non-rect rooms hide dimension fields but show area', () => {
  const st = usePlanStore.getState()
  const id = st.addRoom()
  st.splitRoomEdge(id, 0, 1.5)
  const topY = usePlanStore.getState().plan.rooms[0].polygon[0].y
  st.pushRoomEdge(id, 0, topY + 1)
  usePlanStore.getState().selectRoom(id)
  render(<PropertiesPanel />)
  expect(screen.queryByLabelText('Width (m)')).not.toBeInTheDocument()
  expect(screen.getByText(/m²/)).toBeInTheDocument()
})

it('rect rooms keep dimension fields and gain area', () => {
  const st = usePlanStore.getState()
  const id = st.addRoom()
  usePlanStore.getState().selectRoom(id)
  render(<PropertiesPanel />)
  expect(screen.getByLabelText('Width (m)')).toBeInTheDocument()
  expect(screen.getByText(/9\.0 m²/)).toBeInTheDocument() // 3×3 default room
})
```

(match the existing file's query style if `getByLabelText` doesn't fit NumberField.)

- [ ] **Step 2: Run (FAIL), implement**

In `RoomProps`: replace the early `if (!rect) return null` with rect-conditional rendering:

```tsx
const rect = polygonToRect(room.polygon)
…
<div className="field">Area<span>{polygonArea(room.polygon).toFixed(1)} m²</span></div>
{rect && (
  <>{/* the four existing X/Y/Width/Height NumberFields, unchanged */}</>
)}
```

(import `polygonArea`.) Keep everything else as is.

- [ ] **Step 3: Run** — `npx vitest run src/ui/PropertiesPanel.test.tsx`, `npm test`, `npx tsc --noEmit` — clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui
git commit -m "feat: room area display; dimension fields only for rect rooms"
```

---

### Task 8: 3D polygon floors

**Files:**
- Modify: `src/viewer3d/Viewer3D.tsx`
- Create: `src/viewer3d/floorShape.ts`
- Test: `src/viewer3d/floorShape.test.ts`

**Interfaces:**
- Consumes: room polygons; three `Shape`/`ShapeGeometry`.
- Produces:
  - `floorShape(polygon: Vec2[]): Shape` — `moveTo/lineTo` over `(p.x, -p.y)` (a mesh with `rotation-x = -Math.PI/2` maps shape (x, y) → world (x, −y·ẑ), so negating y lands plan-y on world +z)
  - `RoomMesh` renders both plain and textured floors with `<shapeGeometry args={[shape]} />` at `position={[0, 0.001, 0]}` (vertices carry absolute coordinates; the mesh no longer centers)
  - `TexturedFloor` keeps world-scale tiling: ShapeGeometry UVs equal shape coordinates, so `texture.repeat.set(1, 1)` with RepeatWrapping gives one tile per meter — the explicit `repeat.set(rect.width, rect.height)` is REMOVED.

- [ ] **Step 1: Failing test**

Create `src/viewer3d/floorShape.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { floorShape } from './floorShape'

describe('floorShape', () => {
  it('builds a closed shape with y negated', () => {
    const shape = floorShape([
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 1 },
      { x: 4, y: 3 }, { x: 0, y: 3 },
    ])
    const pts = shape.getPoints()
    expect(pts[0].x).toBe(0)
    expect(pts.some((p) => p.x === 4 && p.y === -3)).toBe(true)
    expect(pts.length).toBeGreaterThanOrEqual(6)
  })
})
```

- [ ] **Step 2: Run (FAIL), implement**

`src/viewer3d/floorShape.ts`:

```ts
import { Shape } from 'three'
import type { Vec2 } from '../model/types'

// Shape lives in the XY plane; the floor mesh is rotated -90° about X, which maps
// shape (x, y) to world (x, 0, -y) — so plan y must be negated to land on world +z.
export function floorShape(polygon: Vec2[]): Shape {
  const shape = new Shape()
  shape.moveTo(polygon[0].x, -polygon[0].y)
  for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i].x, -polygon[i].y)
  shape.closePath()
  return shape
}
```

- [ ] **Step 3: Rewire RoomMesh**

In `src/viewer3d/Viewer3D.tsx`:
- `RoomMesh` computes `const shape = useMemo(() => floorShape(room.polygon), [room.polygon])` and renders the plain floor as:

```tsx
<mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow>
  <shapeGeometry args={[shape]} />
  <meshStandardMaterial color={room.color} />
</mesh>
```

- `TexturedFloor` takes `{ shape, texturePath, fallbackColor }` instead of `rect`; its texture setup drops `repeat.set(rect.width, rect.height)` in favor of `t.repeat.set(1, 1)` (RepeatWrapping + sRGB stay); its mesh uses the same shapeGeometry markup. Remove the `Rect`/`polygonToRect` floor plumbing from this file (walls untouched).
- Note `RoomMesh`'s conditional rect check disappears — every valid polygon renders a floor now.

- [ ] **Step 4: Verify** — `npx vitest run src/viewer3d`, `npm test`, `npx tsc --noEmit`, `npm run build` — clean. Manual: L-shaped room in 3D shows an L floor (color and textured), walls line its outline (walls were already polygon-aware).

- [ ] **Step 5: Commit**

```bash
git add src/viewer3d
git commit -m "feat: polygon floors in 3D via ShapeGeometry"
```

---

### Task 9: E2E verification and docs

**Files:**
- Modify: `README.md`
- Test: full suite + browser E2E with screenshots

STOP RULE: commit your work and STOP. Do NOT merge, do NOT push, do NOT delete branches — the controller handles integration.

- [ ] **Step 1: Full gates** — `npm test`, `npm run build` — clean.

- [ ] **Step 2: Browser E2E** (established method: `npm i playwright-core` in a scratch dir OUTSIDE the repo, installed Chrome headless `channel: 'chrome'` against `npm run dev`; `window.__planStore` dev hook for assertions; macOS has no `timeout` command):

Scenarios (2D interactions through REAL mouse events; store hook for assertions):
1. Add a room; double-click its top wall (selected) at ~1/3 width → assert polygon length 5.
2. Drag the left sub-edge's midpoint handle downward ~1 m → assert polygon length ≥ 6 and `validate`-style sanity via the store (room still selectable, area shrank).
3. Place a door on the top wall BEFORE splitting in a fresh room; split the wall left of the door; assert the door's edgeIndex/offset still resolve (openingSpan non-null) and its world position is unchanged (±1 cm).
4. Click INSIDE the notch → assert the room deselects (or selects an underlying room, if any); click inside the arm → selects.
5. Push the notch flush; release; assert polygon length back to 4 (merge fired on drag end).
6. Set a floor material on the L room; screenshot 2D; switch to 3D, wait for load, screenshot — READ both screenshots: L outline correct in 2D with tint; L-shaped textured floor + walls along the notch in 3D.
Console: zero uncaught page errors.

- [ ] **Step 3: README** — in the "Use" section, replace the rooms bullet's resize sentence with:

```markdown
- **Rooms**: "+ Add room", then drag to move; drag a wall (edge handle) to push it,
  drag a corner to resize, double-click a wall to split it and push a segment to cut
  notches — L/T/U shapes and any rectilinear outline. Pushing a notch flush removes
  it. Rooms snap to the 0.1 m grid, other rooms' walls, and the apartment boundary —
  hold **Alt** to disable. The label shows the room's area; exact X/Y/W/H editing in
  the panel applies to rectangular rooms.
```

- [ ] **Step 4: Commit and STOP**

```bash
git add README.md src/main.tsx
git commit -m "docs: polygonal room editing usage; E2E verified"
```

(Include `src/main.tsx` only if the dev hook needed changes — it should not.) Report results; the controller merges.
