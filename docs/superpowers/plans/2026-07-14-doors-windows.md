# Doors & Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doors and windows as wall-attached openings: placed and slid along room walls in the 2D editor, rendered as real gaps with simple fills in 3D, persisted via a v2 schema with v1 migration.

**Architecture:** Openings live in a new top-level `plan.openings` list, each owned by a room edge (`roomId` + `edgeIndex` + `offset`). All geometry stays derived: pure helpers in `src/model/openings.ts` resolve openings to world-space spans and edge-local intervals; the 3D walls module splits each wall into sub-boxes around the merged intervals (cutting through BOTH coincident walls on shared edges); the 2D editor draws gap+symbol over the wall line. Selection generalizes to a room-or-opening union.

**Tech Stack:** unchanged from v1 — Vite 5, React 18, TS 5, PixiJS 8, three + @react-three/fiber 8 + drei 9, Zustand 5, Zod 3, Vitest 2 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-14-doors-windows-design.md`

## Global Constraints

- Work on branch `feature/doors-windows` off `main`. The repo has a GitHub origin with Pages auto-deploy on push to main — do NOT push during tasks; pushing happens at finish.
- Plan schema bumps to `version: 2`. `parsePlan` = parse → migrate → validate; a `version: 1` payload migrates by adding `openings: []` and `version: 2`. Unknown versions still reject.
- Opening defaults: door `{ width: 0.9, height: 2.1, sillHeight: 0 }`; window `{ width: 1.2, height: 1.2, sillHeight: 0.9 }`. `MIN_OPENING_WIDTH = 0.3`.
- Clamps (store-enforced, cm-rounded, non-finite rejected): `offset ∈ [width/2, edgeLength − width/2]`, or `edgeLength/2` when `edgeLength ≤ width`; `height ∈ [0.3, wallHeight − 0.1 − sillHeight]`; `sillHeight ∈ [0, wallHeight − 0.4]`; doors always `sillHeight: 0`.
- Cut-both-walls rule: an edge is cut by every opening (any owner) whose span is collinear with it (perpendicular distance ≤ `1e-6` m) and overlaps it by more than `0.01` m.
- `WALL_THICKNESS = 0.1` unchanged. Wall pieces touching an edge endpoint extend by `WALL_THICKNESS / 2` (v1 corner-closing behavior); pieces with length or height ≤ `0.01` m are skipped.
- Fills: door panel thickness `0.04`, color `#9c6b3f`; window pane thickness `0.02`, color `#bfe0f2`, opacity `0.35`, double-sided; pane top clipped to `wallHeight − 0.01`.
- 2D: placement hover/click radius 10 px (screen); opening hit radius 8 px; gap painted `#f7f8fa` at 7 px; selected `#1d4ed8`, warning `#e07a5f`, normal `#475069`; placement edge highlight `#22c55e`, alpha 0.6, width 5 px.
- After Task 3, `grep -rn selectedRoomId src/` must return nothing.
- Meters internally, cm rounding via `roundCm`; store is the single writer and never holds an invalid plan.
- npm; run one test file with `npx vitest run <path>`.

---

### Task 1: Schema v2 — types, migration, validation

**Files:**
- Modify: `src/model/types.ts`
- Modify: `src/model/serialization.ts`
- Test: `src/model/serialization.test.ts` (update + extend)

**Interfaces:**
- Consumes: existing `Plan`, `polygonArea`, `rectToPolygon`.
- Produces (used by every later task):
  - `type OpeningKind = 'door' | 'window'`
  - `interface Opening { id: string; kind: OpeningKind; roomId: string; edgeIndex: number; offset: number; width: number; height: number; sillHeight: number }`
  - `interface Selection { kind: 'room' | 'opening'; id: string }`
  - `Plan` gains `version: 2` and `openings: Opening[]`
  - `createDefaultPlan()` returns a v2 plan with `openings: []`
  - `parsePlan` migrates v1 → v2 and rejects openings with unknown `roomId` or out-of-range `edgeIndex`

- [ ] **Step 1: Update the tests**

In `src/model/serialization.test.ts`, update the two version-sensitive tests and add v2 coverage. Replace the `createDefaultPlan` describe block with:

```ts
describe('createDefaultPlan', () => {
  it('creates a valid empty v2 plan with spec defaults', () => {
    const plan = createDefaultPlan()
    expect(plan.version).toBe(2)
    expect(plan.apartment).toEqual({ width: 10, depth: 8, wallHeight: 2.7 })
    expect(plan.rooms).toEqual([])
    expect(plan.openings).toEqual([])
    expect(plan.id).not.toBe('')
  })
})
```

Replace the `'rejects unknown schema version'` test with:

```ts
  it('rejects unknown schema version', () => {
    const plan = { ...createDefaultPlan(), version: 3 }
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })
```

Append inside the `serializePlan / parsePlan` describe block:

```ts
  it('round-trips a plan with openings', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Bedroom',
      polygon: rectToPolygon({ x: 1, y: 1, width: 4, height: 3 }),
      color: '#8ecae6',
    })
    plan.openings.push({
      id: 'o1',
      kind: 'door',
      roomId: 'r1',
      edgeIndex: 0,
      offset: 2,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    })
    expect(parsePlan(serializePlan(plan))).toEqual(plan)
  })

  it('migrates a v1 payload by adding empty openings', () => {
    const v1 = { ...createDefaultPlan(), version: 1 } as Record<string, unknown>
    delete v1.openings
    const parsed = parsePlan(JSON.stringify(v1))
    expect(parsed).not.toBeNull()
    expect(parsed!.version).toBe(2)
    expect(parsed!.openings).toEqual([])
  })

  it('rejects an opening referencing an unknown room', () => {
    const plan = createDefaultPlan()
    plan.openings.push({
      id: 'o1',
      kind: 'door',
      roomId: 'nope',
      edgeIndex: 0,
      offset: 1,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    })
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })

  it('rejects an opening with an out-of-range edge index', () => {
    const plan = createDefaultPlan()
    plan.rooms.push({
      id: 'r1',
      name: 'Room',
      polygon: rectToPolygon({ x: 0, y: 0, width: 3, height: 3 }),
      color: '#8ecae6',
    })
    plan.openings.push({
      id: 'o1',
      kind: 'window',
      roomId: 'r1',
      edgeIndex: 7,
      offset: 1,
      width: 1.2,
      height: 1.2,
      sillHeight: 0.9,
    })
    expect(parsePlan(JSON.stringify(plan))).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/model/serialization.test.ts`
Expected: FAIL — `Plan` has no `openings`, version literal mismatch.

- [ ] **Step 3: Update the types**

In `src/model/types.ts`, replace the `Plan` interface and append the new types:

```ts
export type OpeningKind = 'door' | 'window'

export interface Opening {
  id: string
  kind: OpeningKind
  roomId: string
  edgeIndex: number // edge = polygon[edgeIndex] → polygon[(edgeIndex + 1) % n]
  offset: number // meters from edge start to opening CENTER
  width: number
  height: number
  sillHeight: number // doors: always 0
}

export interface Plan {
  version: 2
  id: string
  name: string
  apartment: Apartment
  rooms: Room[]
  openings: Opening[]
}

export interface Selection {
  kind: 'room' | 'opening'
  id: string
}
```

- [ ] **Step 4: Update serialization**

Replace `src/model/serialization.ts` with:

```ts
import { z } from 'zod'
import { polygonArea } from './geometry'
import type { Plan } from './types'

const vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() })

const openingSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['door', 'window']),
  roomId: z.string().min(1),
  edgeIndex: z.number().int().min(0),
  offset: z.number().finite().min(0),
  width: z.number().min(0.3),
  height: z.number().positive(),
  sillHeight: z.number().min(0),
})

export const planSchema = z
  .object({
    version: z.literal(2),
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
    openings: z.array(openingSchema),
  })
  .superRefine((plan, ctx) => {
    plan.openings.forEach((opening, i) => {
      const room = plan.rooms.find((r) => r.id === opening.roomId)
      if (!room) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openings', i, 'roomId'],
          message: 'opening references unknown room',
        })
      } else if (opening.edgeIndex >= room.polygon.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openings', i, 'edgeIndex'],
          message: 'edge index out of range for room polygon',
        })
      }
    })
  })

export function createDefaultPlan(): Plan {
  return {
    version: 2,
    id: crypto.randomUUID(),
    name: 'My apartment',
    apartment: { width: 10, depth: 8, wallHeight: 2.7 },
    rooms: [],
    openings: [],
  }
}

export function serializePlan(plan: Plan): string {
  return JSON.stringify(plan, null, 2)
}

function migrate(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object' && (raw as { version?: unknown }).version === 1) {
    return { ...(raw as object), version: 2, openings: [] }
  }
  return raw
}

export function parsePlan(json: string): Plan | null {
  try {
    const result = planSchema.safeParse(migrate(JSON.parse(json)))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — serialization tests green; no other suite touches `version` or `openings` yet. Also run `npx tsc --noEmit`; expected clean (Plan consumers use `createDefaultPlan`, which now carries `openings`).

- [ ] **Step 6: Commit**

```bash
git add src/model
git commit -m "feat: plan schema v2 with openings and v1 migration"
```

---

### Task 2: Openings geometry module (pure)

**Files:**
- Create: `src/model/openings.ts`
- Test: `src/model/openings.test.ts`

**Interfaces:**
- Consumes: `Opening`, `Plan`, `Room`, `Vec2` from `./types`; `roundCm` from `./geometry`.
- Produces (exact names later tasks import):
  - `OPENING_DEFAULTS: { door: { width: 0.9; height: 2.1; sillHeight: 0 }; window: { width: 1.2; height: 1.2; sillHeight: 0.9 } }`
  - `MIN_OPENING_WIDTH = 0.3`
  - `interface Edge { a: Vec2; b: Vec2; length: number; ux: number; uy: number }`
  - `roomEdge(room: Room, edgeIndex: number): Edge | null` — null on bad index or zero-length edge
  - `clampOffset(offset: number, width: number, edgeLength: number): number` — cm-rounded; `edgeLength/2` when `edgeLength ≤ width`
  - `openingSpan(opening: Opening, room: Room): { a: Vec2; b: Vec2 } | null`
  - `projectOntoEdge(edge: Edge, p: Vec2): number` — clamped to `[0, edge.length]`
  - `interface OpeningInterval { start: number; end: number; opening: Opening }`
  - `openingsOnEdge(edgeA: Vec2, edgeB: Vec2, plan: Plan): OpeningInterval[]` — collinear + overlapping openings from ANY room, intervals in the query edge's local coordinates
  - `interface Interval { start: number; end: number }`
  - `mergeIntervals(intervals: Interval[]): Interval[]`
  - `openingWarnings(plan: Plan): Set<string>` — ids that are too wide for their edge or overlap another opening on the same wall line

- [ ] **Step 1: Write the failing tests**

`src/model/openings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rectToPolygon } from './geometry'
import { createDefaultPlan } from './serialization'
import type { Opening, Plan, Room } from './types'
import {
  clampOffset,
  mergeIntervals,
  openingsOnEdge,
  openingSpan,
  openingWarnings,
  projectOntoEdge,
  roomEdge,
} from './openings'

const roomAt = (x: number, y: number, w: number, h: number, id: string): Room => ({
  id,
  name: id,
  polygon: rectToPolygon({ x, y, width: w, height: h }),
  color: '#8ecae6',
})

const door = (roomId: string, edgeIndex: number, offset: number, width = 1): Opening => ({
  id: `${roomId}-e${edgeIndex}-${offset}`,
  kind: 'door',
  roomId,
  edgeIndex,
  offset,
  width,
  height: 2.1,
  sillHeight: 0,
})

const planWith = (rooms: Room[], openings: Opening[]): Plan => ({
  ...createDefaultPlan(),
  rooms,
  openings,
})

describe('roomEdge', () => {
  const room = roomAt(0, 0, 4, 3, 'A')

  it('resolves each edge with direction and length', () => {
    expect(roomEdge(room, 0)).toEqual({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, length: 4, ux: 1, uy: 0 })
    expect(roomEdge(room, 2)).toEqual({ a: { x: 4, y: 3 }, b: { x: 0, y: 3 }, length: 4, ux: -1, uy: 0 })
  })

  it('returns null for out-of-range indices', () => {
    expect(roomEdge(room, 4)).toBeNull()
    expect(roomEdge(room, -1)).toBeNull()
    expect(roomEdge(room, 1.5)).toBeNull()
  })
})

describe('clampOffset', () => {
  it('keeps the opening fully on the edge', () => {
    expect(clampOffset(0.2, 1, 4)).toBe(0.5)
    expect(clampOffset(3.9, 1, 4)).toBe(3.5)
    expect(clampOffset(2, 1, 4)).toBe(2)
  })

  it('centers the opening when the edge is shorter than the opening', () => {
    expect(clampOffset(2, 5, 4)).toBe(2)
    expect(clampOffset(0, 5, 4)).toBe(2)
  })
})

describe('openingSpan', () => {
  const room = roomAt(0, 0, 4, 3, 'A')

  it('resolves a span on a forward edge', () => {
    const span = openingSpan(door('A', 0, 2), room)
    expect(span).toEqual({ a: { x: 1.5, y: 0 }, b: { x: 2.5, y: 0 } })
  })

  it('resolves a span on a reversed edge', () => {
    const span = openingSpan(door('A', 2, 1), room)
    expect(span).toEqual({ a: { x: 3.5, y: 3 }, b: { x: 2.5, y: 3 } })
  })

  it('returns null for a bad edge index', () => {
    expect(openingSpan(door('A', 9, 1), room)).toBeNull()
  })
})

describe('projectOntoEdge', () => {
  const edge = roomEdge(roomAt(0, 0, 4, 3, 'A'), 0)!

  it('projects and clamps to the edge', () => {
    expect(projectOntoEdge(edge, { x: 2.34, y: 5 })).toBeCloseTo(2.34)
    expect(projectOntoEdge(edge, { x: -3, y: 0 })).toBe(0)
    expect(projectOntoEdge(edge, { x: 9, y: 0 })).toBe(4)
  })
})

describe('openingsOnEdge', () => {
  const roomA = roomAt(0, 0, 4, 3, 'A')
  const roomB = roomAt(0, 3, 4, 3, 'B')

  it("finds the neighbour room's opening on a shared edge", () => {
    // door owned by A on its bottom edge (edge 2, running right→left)
    const plan = planWith([roomA, roomB], [door('A', 2, 1)])
    // query B's top edge (0,3)→(4,3)
    const intervals = openingsOnEdge({ x: 0, y: 3 }, { x: 4, y: 3 }, plan)
    expect(intervals).toHaveLength(1)
    expect(intervals[0].start).toBeCloseTo(2.5)
    expect(intervals[0].end).toBeCloseTo(3.5)
  })

  it('ignores parallel but non-collinear edges', () => {
    const plan = planWith([roomA, roomB], [door('A', 2, 1)])
    const intervals = openingsOnEdge({ x: 0, y: 6 }, { x: 4, y: 6 }, plan)
    expect(intervals).toHaveLength(0)
  })

  it('clips intervals to the query edge and drops slivers', () => {
    // opening centered at the very start of A's top edge, half hanging off
    const plan = planWith([roomA], [door('A', 0, 0.1)])
    const intervals = openingsOnEdge({ x: 0, y: 0 }, { x: 4, y: 0 }, plan)
    expect(intervals).toHaveLength(1)
    expect(intervals[0].start).toBe(0)
    expect(intervals[0].end).toBeCloseTo(0.6)
  })
})

describe('mergeIntervals', () => {
  it('merges overlapping intervals and keeps disjoint ones', () => {
    expect(
      mergeIntervals([
        { start: 1, end: 2 },
        { start: 1.5, end: 3 },
        { start: 4, end: 5 },
      ]),
    ).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 5 },
    ])
  })

  it('returns empty for empty input', () => {
    expect(mergeIntervals([])).toEqual([])
  })
})

describe('openingWarnings', () => {
  const roomA = roomAt(0, 0, 4, 3, 'A')

  it('flags an opening wider than its edge', () => {
    const wide = door('A', 0, 2, 5)
    const plan = planWith([roomA], [wide])
    expect(openingWarnings(plan)).toEqual(new Set([wide.id]))
  })

  it('flags both openings when they overlap on the same wall', () => {
    const d1 = door('A', 0, 2)
    const d2 = door('A', 0, 2.4)
    const plan = planWith([roomA], [d1, d2])
    expect(openingWarnings(plan)).toEqual(new Set([d1.id, d2.id]))
  })

  it('does not flag separated openings', () => {
    const plan = planWith([roomA], [door('A', 0, 1), door('A', 0, 3)])
    expect(openingWarnings(plan)).toEqual(new Set())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/openings.test.ts`
Expected: FAIL — cannot resolve `./openings`.

- [ ] **Step 3: Implement the module**

`src/model/openings.ts`:

```ts
import { roundCm } from './geometry'
import type { Opening, Plan, Room, Vec2 } from './types'

export const OPENING_DEFAULTS = {
  door: { width: 0.9, height: 2.1, sillHeight: 0 },
  window: { width: 1.2, height: 1.2, sillHeight: 0.9 },
} as const

export const MIN_OPENING_WIDTH = 0.3

const COLLINEAR_EPS = 1e-6
const MIN_OVERLAP = 0.01

export interface Edge {
  a: Vec2
  b: Vec2
  length: number
  ux: number
  uy: number
}

export function roomEdge(room: Room, edgeIndex: number): Edge | null {
  const n = room.polygon.length
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return null
  const a = room.polygon[edgeIndex]
  const b = room.polygon[(edgeIndex + 1) % n]
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length === 0) return null
  return { a, b, length, ux: (b.x - a.x) / length, uy: (b.y - a.y) / length }
}

export function clampOffset(offset: number, width: number, edgeLength: number): number {
  if (edgeLength <= width) return roundCm(edgeLength / 2)
  return roundCm(Math.min(edgeLength - width / 2, Math.max(width / 2, offset)))
}

export function openingSpan(opening: Opening, room: Room): { a: Vec2; b: Vec2 } | null {
  const edge = roomEdge(room, opening.edgeIndex)
  if (!edge) return null
  const s = opening.offset - opening.width / 2
  const e = opening.offset + opening.width / 2
  return {
    a: { x: edge.a.x + edge.ux * s, y: edge.a.y + edge.uy * s },
    b: { x: edge.a.x + edge.ux * e, y: edge.a.y + edge.uy * e },
  }
}

export function projectOntoEdge(edge: Edge, p: Vec2): number {
  const t = (p.x - edge.a.x) * edge.ux + (p.y - edge.a.y) * edge.uy
  return Math.min(edge.length, Math.max(0, t))
}

export interface OpeningInterval {
  start: number
  end: number
  opening: Opening
}

export function openingsOnEdge(edgeA: Vec2, edgeB: Vec2, plan: Plan): OpeningInterval[] {
  const length = Math.hypot(edgeB.x - edgeA.x, edgeB.y - edgeA.y)
  if (length === 0) return []
  const ux = (edgeB.x - edgeA.x) / length
  const uy = (edgeB.y - edgeA.y) / length
  const distToLine = (p: Vec2) => Math.abs((p.x - edgeA.x) * uy - (p.y - edgeA.y) * ux)

  const result: OpeningInterval[] = []
  for (const opening of plan.openings) {
    const room = plan.rooms.find((r) => r.id === opening.roomId)
    if (!room) continue
    const span = openingSpan(opening, room)
    if (!span) continue
    if (distToLine(span.a) > COLLINEAR_EPS || distToLine(span.b) > COLLINEAR_EPS) continue
    const t1 = (span.a.x - edgeA.x) * ux + (span.a.y - edgeA.y) * uy
    const t2 = (span.b.x - edgeA.x) * ux + (span.b.y - edgeA.y) * uy
    const start = Math.max(0, Math.min(t1, t2))
    const end = Math.min(length, Math.max(t1, t2))
    if (end - start > MIN_OVERLAP) result.push({ start, end, opening })
  }
  return result
}

export interface Interval {
  start: number
  end: number
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ start: interval.start, end: interval.end })
  }
  return merged
}

export function openingWarnings(plan: Plan): Set<string> {
  const warned = new Set<string>()
  for (const opening of plan.openings) {
    const room = plan.rooms.find((r) => r.id === opening.roomId)
    if (!room) continue
    const edge = roomEdge(room, opening.edgeIndex)
    if (!edge) continue
    if (opening.width > edge.length + COLLINEAR_EPS) warned.add(opening.id)
    const intervals = openingsOnEdge(edge.a, edge.b, plan)
    const own = intervals.find((interval) => interval.opening.id === opening.id)
    if (!own) continue
    for (const other of intervals) {
      if (other.opening.id === opening.id) continue
      if (other.start < own.end - COLLINEAR_EPS && own.start < other.end - COLLINEAR_EPS) {
        warned.add(opening.id)
        break
      }
    }
  }
  return warned
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/model/openings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model
git commit -m "feat: pure openings geometry (spans, edge intervals, warnings)"
```

---

### Task 3: Selection union refactor

**Files:**
- Modify: `src/store/planStore.ts` (state shape + selection actions)
- Modify: `src/editor2d/Editor2D.tsx`, `src/ui/PropertiesPanel.tsx` (call sites)
- Test: `src/store/planStore.test.ts`, `src/store/persistence.test.ts`, `src/ui/App.test.tsx`, `src/ui/NumberField.test.tsx` (reset/assert updates)

**Interfaces:**
- Consumes: `Selection` from `../model/types` (Task 1).
- Produces: `PlanState.selection: Selection | null` (replaces `selectedRoomId`); `selectRoom(id: string | null)` keeps its signature but writes the union; new `selectOpening(id: string): void`. No opening CRUD yet — that is Task 4.
- Exit criterion: `grep -rn selectedRoomId src/` returns nothing; full suite green.

- [ ] **Step 1: Update the store**

In `src/store/planStore.ts`:
- Add `Selection` to the type import from `../model/types`.
- In `PlanState`, replace `selectedRoomId: string | null` with `selection: Selection | null` and add `selectOpening: (id: string) => void` after `selectRoom`.
- Replace the state/action implementations:

```ts
  selection: null,
```

```ts
  selectRoom: (id) => set({ selection: id ? { kind: 'room', id } : null }),

  selectOpening: (id) => set({ selection: { kind: 'opening', id } }),
```

- In `addRoom`, the returned patch's selection becomes:

```ts
      return { plan: { ...s.plan, rooms: [...s.plan.rooms, room] }, selection: { kind: 'room', id } }
```

- In `deleteRoom`:

```ts
  deleteRoom: (id) =>
    set((s) => ({
      plan: { ...s.plan, rooms: s.plan.rooms.filter((r) => r.id !== id) },
      selection: s.selection?.kind === 'room' && s.selection.id === id ? null : s.selection,
    })),
```

- In `loadPlan`:

```ts
  loadPlan: (plan) => set({ plan, selection: null }),
```

- [ ] **Step 2: Update the 2D editor call sites**

In `src/editor2d/Editor2D.tsx` there are two `selectedRoomId` readers. TS does not keep property narrowing inside nested closures, so bind the selection to a `const` first (same pattern as the existing `activeDrag`).

In the stage `pointerdown` handler, replace the selected-room lookup block with:

```tsx
  const sel = store.selection
  const selectedRoom =
    sel?.kind === 'room' ? store.plan.rooms.find((r) => r.id === sel.id) : undefined
  const selectedRect = selectedRoom ? polygonToRect(selectedRoom.polygon) : null
  if (selectedRoom && selectedRect) {
    const handle = hitHandle(selectedRect, viewport, { x: e.global.x, y: e.global.y })
    if (handle) {
      drag = { kind: 'resize', roomId: selectedRoom.id, handle }
      return
    }
  }
```

In the Delete/Backspace branch of `onKeyDown`, replace the body with:

```tsx
  const store = usePlanStore.getState()
  if (store.selection?.kind === 'room') store.deleteRoom(store.selection.id)
  return
```

In the ticker callback, replace the rooms/handles lines with:

```tsx
  const sel = store.selection
  const selectedRoomId = sel?.kind === 'room' ? sel.id : null
  drawRooms(layers.rooms, store.plan, selectedRoomId, viewport)
  drawGuides(layers.guides, guides, viewport, app.screen.width, app.screen.height)
  const selectedRoom = selectedRoomId
    ? store.plan.rooms.find((r) => r.id === selectedRoomId)
    : undefined
  drawHandles(layers.handles, selectedRoom ? polygonToRect(selectedRoom.polygon) : null, viewport)
```

(`drawGuides` keeps its existing arguments — only the surrounding lines change.)

- [ ] **Step 3: Update the properties panel**

In `src/ui/PropertiesPanel.tsx`, replace the selection lookup in `PropertiesPanel`:

```tsx
export function PropertiesPanel() {
  const plan = usePlanStore((s) => s.plan)
  const selection = usePlanStore((s) => s.selection)
  const room =
    selection?.kind === 'room' ? plan.rooms.find((r) => r.id === selection.id) : undefined

  return (
    <aside className="panel">
      {room ? <RoomProps room={room} /> : <ApartmentProps apartment={plan.apartment} />}
    </aside>
  )
}
```

- [ ] **Step 4: Update the tests**

Mechanical replacements:
- Every `usePlanStore.setState({ plan: createDefaultPlan(), selectedRoomId: null, mode: '2d' })` reset (in `src/store/planStore.test.ts`, `src/store/persistence.test.ts`, `src/ui/App.test.tsx`, and `src/ui/NumberField.test.tsx` if present) becomes `usePlanStore.setState({ plan: createDefaultPlan(), selection: null, mode: '2d' })`.
- In `src/store/planStore.test.ts`: `expect(s.selectedRoomId).toBe(id)` → `expect(s.selection).toEqual({ kind: 'room', id })`; `expect(s.selectedRoomId).toBeNull()` → `expect(s.selection).toBeNull()`.
- Add one test to the `loadPlan / setMode / selectRoom` describe block:

```ts
  it('selectOpening sets an opening selection', () => {
    usePlanStore.getState().selectOpening('o1')
    expect(usePlanStore.getState().selection).toEqual({ kind: 'opening', id: 'o1' })
  })
```

- [ ] **Step 5: Verify**

Run: `grep -rn selectedRoomId src/`
Expected: no output.
Run: `npm test` — PASS. Run: `npx tsc --noEmit` — clean.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "refactor: selection union (room | opening) replaces selectedRoomId"
```

---

### Task 4: Opening store actions, cascades, placement state

**Files:**
- Modify: `src/store/planStore.ts`
- Test: `src/store/planStore.test.ts` (extend)

**Interfaces:**
- Consumes: `OPENING_DEFAULTS`, `MIN_OPENING_WIDTH`, `clampOffset`, `roomEdge` from `../model/openings`; `Opening`, `OpeningKind` types.
- Produces (used by Tasks 8–9):
  - `placing: OpeningKind | null` state + `setPlacing(kind: OpeningKind | null): void` — arming placement deselects (`selection: null`); adding an opening disarms
  - `addOpening(kind: OpeningKind, roomId: string, edgeIndex: number, offset: number): string` — defaults per kind, clamped offset, selects the opening, returns id ('' and no-op on invalid room/edge/non-finite offset)
  - `moveOpening(id: string, offset: number): void` — clamped
  - `updateOpening(id: string, patch: Partial<Pick<Opening, 'width' | 'height' | 'sillHeight' | 'offset'>>): void` — clamps per Global Constraints; doors keep `sillHeight: 0`
  - `deleteOpening(id: string): void` — clears its selection
  - `updateRoomRect` re-clamps that room's openings' offsets; `deleteRoom` cascade-deletes the room's openings and clears a selected orphan opening
  - `loadPlan` also resets `placing: null`

- [ ] **Step 1: Write the failing tests**

Append to `src/store/planStore.test.ts` (and add `placing: null` to the `beforeEach` `setState` reset in this file, `src/store/persistence.test.ts`, and `src/ui/App.test.tsx`):

```ts
describe('openings', () => {
  const addRoomAndDoor = () => {
    const roomId = usePlanStore.getState().addRoom() // 3×3 room, edges of length 3
    const openingId = usePlanStore.getState().addOpening('door', roomId, 0, 1.5)
    return { roomId, openingId }
  }

  it('addOpening applies kind defaults, clamps offset, selects, disarms placement', () => {
    const roomId = usePlanStore.getState().addRoom()
    usePlanStore.getState().setPlacing('door')
    const id = usePlanStore.getState().addOpening('door', roomId, 0, 0.1)
    const s = usePlanStore.getState()
    expect(s.plan.openings).toHaveLength(1)
    expect(s.plan.openings[0]).toMatchObject({
      kind: 'door',
      roomId,
      edgeIndex: 0,
      offset: 0.45,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    })
    expect(s.selection).toEqual({ kind: 'opening', id })
    expect(s.placing).toBeNull()
  })

  it('addOpening no-ops and returns empty id for an unknown room or bad edge', () => {
    expect(usePlanStore.getState().addOpening('door', 'nope', 0, 1)).toBe('')
    const roomId = usePlanStore.getState().addRoom()
    expect(usePlanStore.getState().addOpening('window', roomId, 9, 1)).toBe('')
    expect(usePlanStore.getState().plan.openings).toHaveLength(0)
  })

  it('setPlacing deselects', () => {
    usePlanStore.getState().addRoom()
    usePlanStore.getState().setPlacing('window')
    const s = usePlanStore.getState()
    expect(s.placing).toBe('window')
    expect(s.selection).toBeNull()
  })

  it('moveOpening clamps along the edge', () => {
    const { openingId } = addRoomAndDoor()
    usePlanStore.getState().moveOpening(openingId, 5)
    expect(usePlanStore.getState().plan.openings[0].offset).toBe(2.55)
    usePlanStore.getState().moveOpening(openingId, Number.NaN)
    expect(usePlanStore.getState().plan.openings[0].offset).toBe(2.55)
  })

  it('updateOpening clamps width and keeps doors at sill 0', () => {
    const { openingId } = addRoomAndDoor()
    usePlanStore.getState().updateOpening(openingId, { width: 0.1, sillHeight: 1 })
    const o = usePlanStore.getState().plan.openings[0]
    expect(o.width).toBe(0.3)
    expect(o.sillHeight).toBe(0)
  })

  it('updateOpening clamps window height against the wall', () => {
    const roomId = usePlanStore.getState().addRoom()
    const id = usePlanStore.getState().addOpening('window', roomId, 0, 1.5)
    usePlanStore.getState().updateOpening(id, { height: 5 })
    const o = usePlanStore.getState().plan.openings[0]
    // wallHeight 2.7, sill 0.9 → height ≤ 2.7 − 0.1 − 0.9 = 1.7
    expect(o.height).toBe(1.7)
  })

  it('resizing the room re-clamps its openings', () => {
    const { roomId, openingId } = addRoomAndDoor()
    usePlanStore.getState().moveOpening(openingId, 2.55)
    usePlanStore.getState().updateRoomRect(roomId, { x: 3.5, y: 2.5, width: 1, height: 3 })
    // edge 0 is now 1 m long; door 0.9 wide → offset ∈ [0.45, 0.55]
    expect(usePlanStore.getState().plan.openings[0].offset).toBe(0.55)
  })

  it('deleting the room cascades its openings and clears their selection', () => {
    const { roomId } = addRoomAndDoor()
    usePlanStore.getState().deleteRoom(roomId)
    const s = usePlanStore.getState()
    expect(s.plan.openings).toHaveLength(0)
    expect(s.selection).toBeNull()
  })

  it('deleteOpening removes it and clears its selection', () => {
    const { openingId } = addRoomAndDoor()
    usePlanStore.getState().deleteOpening(openingId)
    const s = usePlanStore.getState()
    expect(s.plan.openings).toHaveLength(0)
    expect(s.selection).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/store/planStore.test.ts`
Expected: FAIL — `addOpening` is not a function.

- [ ] **Step 3: Implement**

In `src/store/planStore.ts`:

Add imports:

```ts
import { clampOffset, MIN_OPENING_WIDTH, OPENING_DEFAULTS, roomEdge } from '../model/openings'
import type { Apartment, Mode, Opening, OpeningKind, Plan, Rect, Selection } from '../model/types'
```

Extend `PlanState`:

```ts
  placing: OpeningKind | null
  setPlacing: (kind: OpeningKind | null) => void
  addOpening: (kind: OpeningKind, roomId: string, edgeIndex: number, offset: number) => string
  moveOpening: (id: string, offset: number) => void
  updateOpening: (
    id: string,
    patch: Partial<Pick<Opening, 'width' | 'height' | 'sillHeight' | 'offset'>>,
  ) => void
  deleteOpening: (id: string) => void
```

Add state/actions (initial `placing: null` next to `selection: null`):

```ts
  setPlacing: (placing) => set({ placing, selection: null }),

  addOpening: (kind, roomId, edgeIndex, offset) => {
    const id = crypto.randomUUID()
    let created = false
    set((s) => {
      if (!Number.isFinite(offset)) return s
      const room = s.plan.rooms.find((r) => r.id === roomId)
      const edge = room ? roomEdge(room, edgeIndex) : null
      if (!edge) return s
      const defaults = OPENING_DEFAULTS[kind]
      const opening: Opening = {
        id,
        kind,
        roomId,
        edgeIndex,
        ...defaults,
        offset: clampOffset(offset, defaults.width, edge.length),
      }
      created = true
      return {
        plan: { ...s.plan, openings: [...s.plan.openings, opening] },
        selection: { kind: 'opening', id } as Selection,
        placing: null,
      }
    })
    return created ? id : ''
  },

  moveOpening: (id, offset) =>
    set((s) => {
      if (!Number.isFinite(offset)) return s
      const opening = s.plan.openings.find((o) => o.id === id)
      const room = opening ? s.plan.rooms.find((r) => r.id === opening.roomId) : undefined
      const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
      if (!opening || !edge) return s
      const next = { ...opening, offset: clampOffset(offset, opening.width, edge.length) }
      return {
        plan: { ...s.plan, openings: s.plan.openings.map((o) => (o.id === id ? next : o)) },
      }
    }),

  updateOpening: (id, patch) =>
    set((s) => {
      for (const value of Object.values(patch)) {
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
      const next = { ...opening, width, height, sillHeight, offset }
      return {
        plan: { ...s.plan, openings: s.plan.openings.map((o) => (o.id === id ? next : o)) },
      }
    }),

  deleteOpening: (id) =>
    set((s) => ({
      plan: { ...s.plan, openings: s.plan.openings.filter((o) => o.id !== id) },
      selection: s.selection?.kind === 'opening' && s.selection.id === id ? null : s.selection,
    })),
```

Extend `updateRoomRect` — look the room up first, then re-clamp its openings against the NEW polygon's edge lengths. Replace the action's final `return` block with:

```ts
      const room = s.plan.rooms.find((r) => r.id === id)
      if (!room) return s
      const nextRoom = { ...room, polygon }
      const openings = s.plan.openings.map((o) => {
        if (o.roomId !== id) return o
        const edge = roomEdge(nextRoom, o.edgeIndex)
        if (!edge) return o
        return { ...o, offset: clampOffset(o.offset, o.width, edge.length) }
      })
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.map((r) => (r.id === id ? nextRoom : r)),
          openings,
        },
      }
```

Extend `deleteRoom`:

```ts
  deleteRoom: (id) =>
    set((s) => {
      const orphanSelected =
        s.selection?.kind === 'opening' &&
        s.plan.openings.some((o) => o.id === s.selection!.id && o.roomId === id)
      const roomSelected = s.selection?.kind === 'room' && s.selection.id === id
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.filter((r) => r.id !== id),
          openings: s.plan.openings.filter((o) => o.roomId !== id),
        },
        selection: roomSelected || orphanSelected ? null : s.selection,
      }
    }),
```

(If `s.selection!.id` trips strict null checks inside the `.some` callback, bind `const sel = s.selection` first and use `sel.id` — same closure-narrowing pattern as elsewhere.)

Extend `loadPlan`:

```ts
  loadPlan: (plan) => set({ plan, selection: null, placing: null }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/planStore.test.ts`
Expected: PASS. Then `npm test` — PASS; `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: opening store actions with clamps, cascades, placement state"
```

---

### Task 5: 3D — wall splitting and fills

**Files:**
- Modify: `src/viewer3d/walls.ts` (replace `wallsForPolygon` with `wallSegmentsForRoom` + `fillForOpening`)
- Modify: `src/viewer3d/Viewer3D.tsx`
- Test: `src/viewer3d/walls.test.ts` (rewrite)

**Interfaces:**
- Consumes: `openingsOnEdge`, `mergeIntervals`, `openingSpan` from `../model/openings`; `Opening`, `Plan`, `Room` types.
- Produces:
  - `WALL_THICKNESS = 0.1` (unchanged)
  - `interface WallPiece { center: [number, number, number]; size: [number, number, number]; rotationY: number }` — size is `[length, height, thickness]`
  - `wallSegmentsForRoom(room: Room, plan: Plan): WallPiece[]`
  - `interface OpeningFill { kind: 'door' | 'window'; center: [number, number, number]; size: [number, number, number]; rotationY: number }`
  - `fillForOpening(opening: Opening, plan: Plan): OpeningFill | null`
- `wallsForPolygon` is deleted; `Viewer3D.tsx` is updated in this task so the build stays green.

- [ ] **Step 1: Rewrite the tests**

Replace `src/viewer3d/walls.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { rectToPolygon } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { Opening, Plan, Room } from '../model/types'
import { fillForOpening, WALL_THICKNESS, wallSegmentsForRoom, type WallPiece } from './walls'

const roomAt = (x: number, y: number, w: number, h: number, id: string): Room => ({
  id,
  name: id,
  polygon: rectToPolygon({ x, y, width: w, height: h }),
  color: '#8ecae6',
})

const planWith = (rooms: Room[], openings: Opening[]): Plan => ({
  ...createDefaultPlan(), // wallHeight 2.7
  rooms,
  openings,
})

const roomA = roomAt(0, 0, 4, 3, 'A')

const doorA: Opening = {
  id: 'd1',
  kind: 'door',
  roomId: 'A',
  edgeIndex: 0, // top edge (0,0)→(4,0)
  offset: 2,
  width: 1,
  height: 2.1,
  sillHeight: 0,
}

const expectPiece = (piece: WallPiece, center: number[], size: number[]) => {
  piece.center.forEach((v, i) => expect(v).toBeCloseTo(center[i]))
  piece.size.forEach((v, i) => expect(v).toBeCloseTo(size[i]))
}

// pieces on roomA's edge 0 lie on the line z = 0
const onEdge0 = (pieces: WallPiece[]) => pieces.filter((p) => Math.abs(p.center[2]) < 0.2)

describe('wallSegmentsForRoom without openings', () => {
  it('produces one full-height piece per edge with v1 corner extension', () => {
    const pieces = wallSegmentsForRoom(roomA, planWith([roomA], []))
    expect(pieces).toHaveLength(4)
    expectPiece(pieces[0], [2, 1.35, 0], [4 + WALL_THICKNESS, 2.7, WALL_THICKNESS])
    expect(pieces[0].rotationY).toBeCloseTo(0)
  })
})

describe('wallSegmentsForRoom with a door', () => {
  it('splits the edge into two jamb pieces and a lintel', () => {
    const pieces = wallSegmentsForRoom(roomA, planWith([roomA], [doorA]))
    expect(pieces).toHaveLength(6) // 3 on the cut edge + 3 full edges
    const edge = onEdge0(pieces)
    expect(edge).toHaveLength(3)
    // left jamb: t ∈ [−0.05, 1.5]
    expectPiece(edge[0], [0.725, 1.35, 0], [1.55, 2.7, WALL_THICKNESS])
    // lintel above the door: y ∈ [2.1, 2.7]
    expectPiece(edge[1], [2, 2.4, 0], [1, 0.6, WALL_THICKNESS])
    // right jamb: t ∈ [2.5, 4.05]
    expectPiece(edge[2], [3.275, 1.35, 0], [1.55, 2.7, WALL_THICKNESS])
  })
})

describe('wallSegmentsForRoom with a window', () => {
  it('adds a breast below and a lintel above the pane', () => {
    const windowA: Opening = { ...doorA, id: 'w1', kind: 'window', width: 1.2, height: 1.2, sillHeight: 0.9 }
    const pieces = wallSegmentsForRoom(roomA, planWith([roomA], [windowA]))
    expect(pieces).toHaveLength(7) // 4 on the cut edge + 3 full edges
    const edge = onEdge0(pieces)
    expect(edge).toHaveLength(4)
    // breast: y ∈ [0, 0.9]
    expectPiece(edge[1], [2, 0.45, 0], [1.2, 0.9, WALL_THICKNESS])
    // lintel: y ∈ [2.1, 2.7]
    expectPiece(edge[2], [2, 2.4, 0], [1.2, 0.6, WALL_THICKNESS])
  })
})

describe('cut-through on shared edges', () => {
  it("a door owned by room A also cuts room B's coincident wall", () => {
    const roomB = roomAt(0, 3, 4, 3, 'B')
    // door on A's bottom edge (edge 2, running (4,3)→(0,3)), centered at x = 3
    const sharedDoor: Opening = { ...doorA, id: 'd2', edgeIndex: 2, offset: 1 }
    const plan = planWith([roomA, roomB], [sharedDoor])
    const piecesB = wallSegmentsForRoom(roomB, plan)
    expect(piecesB).toHaveLength(6) // B's top edge is cut into 3 pieces too
    const cutEdge = piecesB.filter((p) => Math.abs(p.center[2] - 3) < 0.2 && Math.abs(p.rotationY) < 0.01)
    expect(cutEdge).toHaveLength(3)
    const lintel = cutEdge.find((p) => p.size[1] < 1)!
    expectPiece(lintel, [3, 2.4, 3], [1, 0.6, WALL_THICKNESS])
  })
})

describe('overlapping openings', () => {
  it('merge into a single gap', () => {
    const d1: Opening = { ...doorA, id: 'd1', offset: 1.5 }
    const d2: Opening = { ...doorA, id: 'd2', offset: 2.2 }
    const pieces = wallSegmentsForRoom(roomA, planWith([roomA], [d1, d2]))
    const edge = onEdge0(pieces)
    expect(edge).toHaveLength(3) // left jamb, one merged lintel, right jamb
    const lintel = edge.find((p) => p.size[1] < 1)!
    // merged gap t ∈ [1, 2.7]
    expectPiece(lintel, [1.85, 2.4, 0], [1.7, 0.6, WALL_THICKNESS])
  })
})

describe('fillForOpening', () => {
  it('positions a door panel from the floor', () => {
    const fill = fillForOpening(doorA, planWith([roomA], [doorA]))!
    expect(fill.kind).toBe('door')
    expectPiece(fill as unknown as WallPiece, [2, 1.05, 0], [1, 2.1, 0.04])
  })

  it('positions a window pane at sill height and clips to the wall', () => {
    const tall: Opening = { ...doorA, id: 'w2', kind: 'window', width: 1.2, height: 5, sillHeight: 0.9 }
    const fill = fillForOpening(tall, planWith([roomA], [tall]))!
    expect(fill.kind).toBe('window')
    // top clipped to 2.69: y ∈ [0.9, 2.69]
    expectPiece(fill as unknown as WallPiece, [2, 1.795, 0], [1.2, 1.79, 0.02])
  })

  it('returns null for an orphaned opening', () => {
    expect(fillForOpening(doorA, planWith([], [doorA]))).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/viewer3d/walls.test.ts`
Expected: FAIL — `wallSegmentsForRoom` not exported.

- [ ] **Step 3: Rewrite the walls module**

Replace `src/viewer3d/walls.ts` with:

```ts
import { mergeIntervals, openingsOnEdge, openingSpan } from '../model/openings'
import type { Opening, Plan, Room } from '../model/types'

export const WALL_THICKNESS = 0.1

const MIN_PIECE = 0.01

export interface WallPiece {
  center: [number, number, number]
  size: [number, number, number] // [length, height, thickness]
  rotationY: number
}

export function wallSegmentsForRoom(room: Room, plan: Plan): WallPiece[] {
  const wallHeight = plan.apartment.wallHeight
  const pieces: WallPiece[] = []
  const n = room.polygon.length

  for (let i = 0; i < n; i++) {
    const a = room.polygon[i]
    const b = room.polygon[(i + 1) % n]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) continue
    const ux = (b.x - a.x) / length
    const uy = (b.y - a.y) / length
    const rotationY = -Math.atan2(b.y - a.y, b.x - a.x)

    const push = (t0: number, t1: number, y0: number, y1: number) => {
      // pieces touching a corner extend past it so corners stay closed (v1 behavior)
      const s0 = t0 === 0 ? t0 - WALL_THICKNESS / 2 : t0
      const s1 = t1 === length ? t1 + WALL_THICKNESS / 2 : t1
      const len = s1 - s0
      const height = y1 - y0
      if (len <= MIN_PIECE || height <= MIN_PIECE) return
      const mid = (s0 + s1) / 2
      pieces.push({
        center: [a.x + ux * mid, (y0 + y1) / 2, a.y + uy * mid],
        size: [len, height, WALL_THICKNESS],
        rotationY,
      })
    }

    const intervals = openingsOnEdge(a, b, plan)
    if (intervals.length === 0) {
      push(0, length, 0, wallHeight)
      continue
    }

    const gaps = mergeIntervals(intervals).map((gap) => {
      const inGap = intervals.filter((iv) => iv.start < gap.end && gap.start < iv.end)
      const bottom = Math.min(...inGap.map((iv) => iv.opening.sillHeight))
      const top = Math.max(...inGap.map((iv) => iv.opening.sillHeight + iv.opening.height))
      return {
        start: gap.start,
        end: gap.end,
        bottom: Math.min(Math.max(0, bottom), wallHeight),
        top: Math.min(Math.max(0, top), wallHeight),
      }
    })

    let cursor = 0
    for (const gap of gaps) {
      push(cursor, gap.start, 0, wallHeight) // full-height piece before the gap
      push(gap.start, gap.end, 0, gap.bottom) // breast below (windows)
      push(gap.start, gap.end, gap.top, wallHeight) // lintel above
      cursor = gap.end
    }
    push(cursor, length, 0, wallHeight)
  }
  return pieces
}

export interface OpeningFill {
  kind: Opening['kind']
  center: [number, number, number]
  size: [number, number, number]
  rotationY: number
}

export function fillForOpening(opening: Opening, plan: Plan): OpeningFill | null {
  const room = plan.rooms.find((r) => r.id === opening.roomId)
  if (!room) return null
  const span = openingSpan(opening, room)
  if (!span) return null
  const wallHeight = plan.apartment.wallHeight
  const bottom = Math.min(Math.max(0, opening.sillHeight), wallHeight)
  const top = Math.max(bottom, Math.min(opening.sillHeight + opening.height, wallHeight - 0.01))
  const height = top - bottom
  if (height <= MIN_PIECE) return null
  const dx = span.b.x - span.a.x
  const dy = span.b.y - span.a.y
  return {
    kind: opening.kind,
    center: [(span.a.x + span.b.x) / 2, (bottom + top) / 2, (span.a.y + span.b.y) / 2],
    size: [Math.hypot(dx, dy), height, opening.kind === 'door' ? 0.04 : 0.02],
    rotationY: -Math.atan2(dy, dx),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/viewer3d/walls.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the 3D viewer**

Replace `src/viewer3d/Viewer3D.tsx` with:

```tsx
import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { DoubleSide } from 'three'
import { polygonToRect } from '../model/geometry'
import type { Opening, Plan, Room } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { fillForOpening, wallSegmentsForRoom } from './walls'

export function Viewer3D() {
  const plan = usePlanStore((s) => s.plan)
  const { width, depth } = plan.apartment

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
          <RoomMesh key={room.id} room={room} plan={plan} />
        ))}
        {plan.openings.map((opening) => (
          <OpeningFillMesh key={opening.id} opening={opening} plan={plan} />
        ))}
      </group>

      <OrbitControls maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={80} />
    </Canvas>
  )
}

function RoomMesh({ room, plan }: { room: Room; plan: Plan }) {
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
      {wallSegmentsForRoom(room, plan).map((piece, i) => (
        <mesh key={i} position={piece.center} rotation-y={piece.rotationY} castShadow receiveShadow>
          <boxGeometry args={piece.size} />
          <meshStandardMaterial color="#f5f5f0" />
        </mesh>
      ))}
    </group>
  )
}

function OpeningFillMesh({ opening, plan }: { opening: Opening; plan: Plan }) {
  const fill = fillForOpening(opening, plan)
  if (!fill) return null
  return (
    <mesh position={fill.center} rotation-y={fill.rotationY} castShadow={fill.kind === 'door'}>
      <boxGeometry args={fill.size} />
      {fill.kind === 'door' ? (
        <meshStandardMaterial color="#9c6b3f" />
      ) : (
        <meshStandardMaterial color="#bfe0f2" transparent opacity={0.35} side={DoubleSide} />
      )}
    </mesh>
  )
}
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test` — PASS. `npx tsc --noEmit` — clean (no `wallsForPolygon` references remain).

- [ ] **Step 7: Commit**

```bash
git add src/viewer3d
git commit -m "feat: 3D walls split around openings with door/window fills"
```

---

### Task 6: 2D pure helpers — opening hit test and edge finding

**Files:**
- Modify: `src/editor2d/interactions.ts` (append)
- Test: `src/editor2d/interactions.test.ts` (append)

**Interfaces:**
- Consumes: `openingSpan`, `projectOntoEdge`, `roomEdge` from `../model/openings`; `roundCm` from `../model/geometry`; `worldToScreen`, `screenToWorld`, `Viewport` from `./viewport`; `Plan`, `Vec2` types.
- Produces:
  - `distToSegmentScreen(p: Vec2, a: Vec2, b: Vec2): number`
  - `hitOpening(plan: Plan, viewport: Viewport, screen: Vec2, radius = 8): string | null` — topmost (last in array) wins
  - `interface EdgeHit { roomId: string; edgeIndex: number; offset: number }`
  - `nearestEdge(plan: Plan, viewport: Viewport, screen: Vec2, radius = 10): EdgeHit | null` — nearest room edge within `radius` px; `offset` is the cm-rounded projection of the pointer onto that edge

- [ ] **Step 1: Write the failing tests**

Append to `src/editor2d/interactions.test.ts`:

```ts
import { createDefaultPlan } from '../model/serialization'
import type { Opening, Plan } from '../model/types'
import { distToSegmentScreen, hitOpening, nearestEdge } from './interactions'

const planWithOpenings = (openings: Opening[]): Plan => ({
  ...createDefaultPlan(),
  rooms: [roomAt(0, 0, 4, 3, 'A')],
  openings,
})

const doorA: Opening = {
  id: 'd1',
  kind: 'door',
  roomId: 'A',
  edgeIndex: 0,
  offset: 2,
  width: 1,
  height: 2.1,
  sillHeight: 0,
}

describe('distToSegmentScreen', () => {
  it('measures perpendicular and endpoint distances', () => {
    expect(distToSegmentScreen({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(distToSegmentScreen({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4)
  })
})

describe('hitOpening', () => {
  const viewport = { offsetX: 0, offsetY: 0, scale: 100 }

  it('hits an opening near its span', () => {
    // span (1.5,0)→(2.5,0) → screen (150,0)→(250,0)
    expect(hitOpening(planWithOpenings([doorA]), viewport, { x: 200, y: 5 })).toBe('d1')
  })

  it('misses outside the radius', () => {
    expect(hitOpening(planWithOpenings([doorA]), viewport, { x: 200, y: 20 })).toBeNull()
  })
})

describe('nearestEdge', () => {
  const viewport = { offsetX: 0, offsetY: 0, scale: 100 }

  it('finds the nearest room edge and projects the offset', () => {
    const hit = nearestEdge(planWithOpenings([]), viewport, { x: 200, y: -5 })
    expect(hit).toEqual({ roomId: 'A', edgeIndex: 0, offset: 2 })
  })

  it('returns null when no edge is within the radius', () => {
    expect(nearestEdge(planWithOpenings([]), viewport, { x: 200, y: 150 })).toBeNull()
  })
})
```

(`roomAt` already exists at the top of this test file from v1 — reuse it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/editor2d/interactions.test.ts`
Expected: FAIL — `distToSegmentScreen` not exported.

- [ ] **Step 3: Implement**

Append to `src/editor2d/interactions.ts` (extend the imports: add `roundCm` to the geometry import; add `import { openingSpan, projectOntoEdge, roomEdge } from '../model/openings'`; add `screenToWorld` to the viewport import; add `Plan` to the types import):

```ts
export function distToSegmentScreen(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

export function hitOpening(plan: Plan, viewport: Viewport, screen: Vec2, radius = 8): string | null {
  for (let i = plan.openings.length - 1; i >= 0; i--) {
    const opening = plan.openings[i]
    const room = plan.rooms.find((r) => r.id === opening.roomId)
    if (!room) continue
    const span = openingSpan(opening, room)
    if (!span) continue
    const a = worldToScreen(viewport, span.a)
    const b = worldToScreen(viewport, span.b)
    if (distToSegmentScreen(screen, a, b) <= radius) return opening.id
  }
  return null
}

export interface EdgeHit {
  roomId: string
  edgeIndex: number
  offset: number
}

export function nearestEdge(plan: Plan, viewport: Viewport, screen: Vec2, radius = 10): EdgeHit | null {
  let best: EdgeHit | null = null
  let bestDist = radius
  for (const room of plan.rooms) {
    for (let i = 0; i < room.polygon.length; i++) {
      const edge = roomEdge(room, i)
      if (!edge) continue
      const a = worldToScreen(viewport, edge.a)
      const b = worldToScreen(viewport, edge.b)
      const d = distToSegmentScreen(screen, a, b)
      if (d <= bestDist) {
        bestDist = d
        const world = screenToWorld(viewport, screen)
        best = { roomId: room.id, edgeIndex: i, offset: roundCm(projectOntoEdge(edge, world)) }
      }
    }
  }
  return best
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/editor2d/interactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor2d
git commit -m "feat: opening hit test and nearest-edge helpers"
```

---

### Task 7: 2D rendering — opening symbols and placement highlight

**Files:**
- Modify: `src/editor2d/render.ts` (append `drawOpenings`, `drawEdgeHighlight`)

**Interfaces:**
- Consumes: `openingSpan`, `openingWarnings`, `roomEdge` from `../model/openings`; `Selection`, `Plan` types; `EdgeHit` from `./interactions`.
- Produces:
  - `drawOpenings(g: Graphics, plan: Plan, selection: Selection | null, viewport: Viewport): void`
  - `drawEdgeHighlight(g: Graphics, hit: EdgeHit | null, plan: Plan, viewport: Viewport): void`
- No unit tests (Pixi drawing) — covered by E2E screenshots in Task 10; suite must stay green.

- [ ] **Step 1: Implement**

Append to `src/editor2d/render.ts` (extend imports: add `openingSpan`, `openingWarnings`, `roomEdge` from `../model/openings`; add `Selection` to the types import; add `import type { EdgeHit } from './interactions'`):

```ts
const GAP_COLOR = 0xf7f8fa // canvas background — paints the wall gap
const OPENING_COLOR = 0x475069
const OPENING_SELECTED = 0x1d4ed8
const OPENING_WARNING = 0xe07a5f

export function drawOpenings(g: Graphics, plan: Plan, selection: Selection | null, viewport: Viewport) {
  g.clear()
  const warnings = openingWarnings(plan)
  for (const opening of plan.openings) {
    const room = plan.rooms.find((r) => r.id === opening.roomId)
    if (!room) continue
    const span = openingSpan(opening, room)
    if (!span) continue
    const a = worldToScreen(viewport, span.a)
    const b = worldToScreen(viewport, span.b)

    // 1. gap: paint over the wall line
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 7, color: GAP_COLOR })

    const selected = selection?.kind === 'opening' && selection.id === opening.id
    const color = selected ? OPENING_SELECTED : warnings.has(opening.id) ? OPENING_WARNING : OPENING_COLOR

    // unit perpendicular in screen space
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len
    const py = dx / len

    // 2. jamb ticks at both ends
    const tick = 6
    g.moveTo(a.x - px * tick, a.y - py * tick).lineTo(a.x + px * tick, a.y + py * tick)
    g.moveTo(b.x - px * tick, b.y - py * tick).lineTo(b.x + px * tick, b.y + py * tick)

    // 3. symbol
    if (opening.kind === 'door') {
      // door leaf: single thin line across the gap
      g.moveTo(a.x, a.y).lineTo(b.x, b.y)
    } else {
      // window: double parallel lines
      const off = 2
      g.moveTo(a.x + px * off, a.y + py * off).lineTo(b.x + px * off, b.y + py * off)
      g.moveTo(a.x - px * off, a.y - py * off).lineTo(b.x - px * off, b.y - py * off)
    }
    g.stroke({ width: selected ? 2.5 : 1.5, color })
  }
}

export function drawEdgeHighlight(g: Graphics, hit: EdgeHit | null, plan: Plan, viewport: Viewport) {
  g.clear()
  if (!hit) return
  const room = plan.rooms.find((r) => r.id === hit.roomId)
  const edge = room ? roomEdge(room, hit.edgeIndex) : null
  if (!edge) return
  const a = worldToScreen(viewport, edge.a)
  const b = worldToScreen(viewport, edge.b)
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 5, color: 0x22c55e, alpha: 0.6 })
}
```

- [ ] **Step 2: Verify build and suite**

Run: `npx tsc --noEmit` — clean. `npm test` — PASS (nothing consumes the new functions yet).

- [ ] **Step 3: Commit**

```bash
git add src/editor2d
git commit -m "feat: 2D opening symbols and placement edge highlight"
```

---

### Task 8: Editor2D wiring — placement, opening selection & drag, Escape

**Files:**
- Modify: `src/editor2d/Editor2D.tsx`

**Interfaces:**
- Consumes: `hitOpening`, `nearestEdge`, `EdgeHit` from `./interactions`; `drawOpenings`, `drawEdgeHighlight` from `./render`; `roomEdge`, `projectOntoEdge` from `../model/openings`; `roundCm` from `../model/geometry`; store `placing`/`setPlacing`/`addOpening`/`moveOpening`/`selectOpening`/`deleteOpening`.
- Produces: complete 2D behavior — armed placement with hover highlight, click-to-place, opening select/slide-drag, Escape cancels placement (or deselects), Delete works on the selection union. No unit tests (Pixi glue, per project convention); suite stays green, behavior verified in Task 10 E2E.

- [ ] **Step 1: Extend imports, layers, and local state**

In `src/editor2d/Editor2D.tsx`:

Imports — extend the existing lines:

```tsx
import { roundCm, polygonToRect } from '../model/geometry'
import { projectOntoEdge, roomEdge } from '../model/openings'
import { applyResize, hitHandle, hitOpening, hitRoom, nearestEdge, type EdgeHit, type HandleId } from './interactions'
import { drawBoundary, drawEdgeHighlight, drawGrid, drawGuides, drawHandles, drawOpenings, drawRooms } from './render'
```

(Match however the current file groups these — the essential change is the added names.)

Layers — replace the `layers` object and `addChild` call:

```tsx
      const layers = {
        grid: new Graphics(),
        boundary: new Graphics(),
        rooms: new Container(),
        openings: new Graphics(),
        edgeHighlight: new Graphics(),
        guides: new Graphics(),
        handles: new Graphics(),
      }
      app.stage.addChild(
        layers.grid,
        layers.boundary,
        layers.rooms,
        layers.openings,
        layers.edgeHighlight,
        layers.guides,
        layers.handles,
      )
```

DragState — extend the union and add hover state next to `guides`:

```tsx
      type DragState =
        | { kind: 'idle' }
        | { kind: 'move'; roomId: string; grabOffset: Vec2 }
        | { kind: 'resize'; roomId: string; handle: HandleId }
        | { kind: 'moveOpening'; openingId: string }
      let drag: DragState = { kind: 'idle' }
      let hoverEdge: EdgeHit | null = null
```

- [ ] **Step 2: Replace the stage pointerdown handler**

```tsx
      app.stage.on('pointerdown', (e) => {
        if (e.button === 1 || spaceDown) {
          panning = { lastX: e.global.x, lastY: e.global.y }
          return
        }
        const store = usePlanStore.getState()
        const screen = { x: e.global.x, y: e.global.y }
        const world = screenToWorld(viewport, screen)

        // armed placement: click places on the nearest wall, or cancels
        if (store.placing) {
          const hit = nearestEdge(store.plan, viewport, screen)
          if (hit) store.addOpening(store.placing, hit.roomId, hit.edgeIndex, hit.offset)
          else store.setPlacing(null)
          hoverEdge = null
          markDirty()
          return
        }

        // openings are small targets on walls — they win over room bodies
        const openingId = hitOpening(store.plan, viewport, screen)
        if (openingId) {
          store.selectOpening(openingId)
          drag = { kind: 'moveOpening', openingId }
          markDirty()
          return
        }

        const sel = store.selection
        const selectedRoom =
          sel?.kind === 'room' ? store.plan.rooms.find((r) => r.id === sel.id) : undefined
        const selectedRect = selectedRoom ? polygonToRect(selectedRoom.polygon) : null
        if (selectedRoom && selectedRect) {
          const handle = hitHandle(selectedRect, viewport, screen)
          if (handle) {
            drag = { kind: 'resize', roomId: selectedRoom.id, handle }
            return
          }
        }
        const roomId = hitRoom(store.plan.rooms, world)
        store.selectRoom(roomId)
        if (roomId) {
          const rect = polygonToRect(store.plan.rooms.find((r) => r.id === roomId)!.polygon)
          if (rect) drag = { kind: 'move', roomId, grabOffset: { x: world.x - rect.x, y: world.y - rect.y } }
        }
      })
```

- [ ] **Step 3: Extend the stage pointermove handler**

Insert AFTER the panning branch and BEFORE the `if (drag.kind === 'idle') return` line:

```tsx
        const hoverStore = usePlanStore.getState()
        if (hoverStore.placing) {
          hoverEdge = nearestEdge(hoverStore.plan, viewport, { x: e.global.x, y: e.global.y })
          markDirty()
          return
        }
```

Append a `moveOpening` branch after the existing `resize` branch:

```tsx
        if (drag.kind === 'moveOpening') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const opening = store.plan.openings.find((o) => o.id === activeDrag.openingId)
          const room = opening ? store.plan.rooms.find((r) => r.id === opening.roomId) : undefined
          const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
          if (!opening || !edge) return
          const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          store.moveOpening(activeDrag.openingId, roundCm(projectOntoEdge(edge, world)))
          markDirty()
        }
```

- [ ] **Step 4: Extend the keyboard handler**

In `onKeyDown`, replace the Delete/Backspace branch and add an Escape branch before the Space branch:

```tsx
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && !isTypingTarget(ev)) {
          const store = usePlanStore.getState()
          if (store.selection?.kind === 'opening') store.deleteOpening(store.selection.id)
          else if (store.selection?.kind === 'room') store.deleteRoom(store.selection.id)
          return
        }
        if (ev.key === 'Escape' && !isTypingTarget(ev)) {
          if (drag.kind !== 'idle') {
            drag = { kind: 'idle' }
            guides = []
          }
          const store = usePlanStore.getState()
          if (store.placing) store.setPlacing(null)
          else store.selectRoom(null)
          hoverEdge = null
          markDirty()
          return
        }
```

- [ ] **Step 5: Extend the ticker**

In the ticker callback, after the `drawRooms(...)` line, add:

```tsx
        drawOpenings(layers.openings, store.plan, store.selection, viewport)
        drawEdgeHighlight(layers.edgeHighlight, store.placing ? hoverEdge : null, store.plan, viewport)
        app.canvas.style.cursor = store.placing ? 'crosshair' : 'default'
```

- [ ] **Step 6: Verify**

Run: `npm test` — PASS. `npx tsc --noEmit` — clean.
Run `npm run dev`, verify with curl that the page and `Editor2D.tsx` module serve without errors, then stop the server (full interaction verification happens in Task 10's browser E2E).

- [ ] **Step 7: Commit**

```bash
git add src/editor2d
git commit -m "feat: place, select, slide and delete openings in the 2D editor"
```

---

### Task 9: Toolbar placement buttons + opening properties panel

**Files:**
- Modify: `src/ui/Toolbar.tsx`, `src/ui/PropertiesPanel.tsx`
- Test: `src/ui/App.test.tsx` (extend)

**Interfaces:**
- Consumes: store `placing`/`setPlacing`/`addOpening`/`updateOpening`/`deleteOpening`/`selection`; `Opening` type; `NumberField`.
- Produces: `+ Door` / `+ Window` toolbar buttons (disabled until a room exists; `active` class while armed; clicking again disarms); `OpeningProps` panel section (heading "Door"/"Window"; Width/Height/Offset fields; "Sill height (m)" for windows only; "Delete door"/"Delete window" button).

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/App.test.tsx` (add `act` to the `@testing-library/react` import):

```tsx
it('disables door/window buttons until a room exists, then arms placement', () => {
  render(<App />)
  const doorButton = screen.getByText('+ Door')
  expect(doorButton).toBeDisabled()
  fireEvent.click(screen.getByText('+ Add room'))
  expect(doorButton).toBeEnabled()
  fireEvent.click(doorButton)
  expect(usePlanStore.getState().placing).toBe('door')
  fireEvent.click(doorButton) // clicking again disarms
  expect(usePlanStore.getState().placing).toBeNull()
})

it('shows door fields when an opening is selected and clamps width via the store', () => {
  render(<App />)
  fireEvent.click(screen.getByText('+ Add room'))
  const roomId = usePlanStore.getState().plan.rooms[0].id
  act(() => {
    usePlanStore.getState().addOpening('door', roomId, 0, 1.5)
  })
  expect(screen.getByRole('heading', { name: 'Door' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Sill height (m)')).toBeNull()
  const width = screen.getByLabelText('Width (m)')
  fireEvent.change(width, { target: { value: '0.1' } })
  fireEvent.blur(width)
  expect(usePlanStore.getState().plan.openings[0].width).toBe(0.3)
})

it('shows sill height for windows and deletes the opening from the panel', () => {
  render(<App />)
  fireEvent.click(screen.getByText('+ Add room'))
  const roomId = usePlanStore.getState().plan.rooms[0].id
  act(() => {
    usePlanStore.getState().addOpening('window', roomId, 0, 1.5)
  })
  expect(screen.getByRole('heading', { name: 'Window' })).toBeInTheDocument()
  expect(screen.getByLabelText('Sill height (m)')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Delete window'))
  expect(usePlanStore.getState().plan.openings).toHaveLength(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL — no `+ Door` button.

- [ ] **Step 3: Extend the Toolbar**

In `src/ui/Toolbar.tsx`, add store reads inside `Toolbar`:

```tsx
  const placing = usePlanStore((s) => s.placing)
  const setPlacing = usePlanStore((s) => s.setPlacing)
  const hasRooms = usePlanStore((s) => s.plan.rooms.length > 0)
```

and add these buttons right after the `+ Add room` button:

```tsx
      <button
        className={placing === 'door' ? 'active' : ''}
        disabled={!hasRooms}
        onClick={() => setPlacing(placing === 'door' ? null : 'door')}
      >
        + Door
      </button>
      <button
        className={placing === 'window' ? 'active' : ''}
        disabled={!hasRooms}
        onClick={() => setPlacing(placing === 'window' ? null : 'window')}
      >
        + Window
      </button>
```

Add to `src/ui/app.css`:

```css
.toolbar button.active { background: #16a34a; color: #fff; border-color: #16a34a; }
.toolbar button:disabled { opacity: 0.45; cursor: default; }
```

- [ ] **Step 4: Extend the PropertiesPanel**

In `src/ui/PropertiesPanel.tsx`, extend the type import with `Opening`, look up a selected opening in `PropertiesPanel`, and render `OpeningProps` first:

```tsx
export function PropertiesPanel() {
  const plan = usePlanStore((s) => s.plan)
  const selection = usePlanStore((s) => s.selection)
  const room =
    selection?.kind === 'room' ? plan.rooms.find((r) => r.id === selection.id) : undefined
  const opening =
    selection?.kind === 'opening' ? plan.openings.find((o) => o.id === selection.id) : undefined

  return (
    <aside className="panel">
      {opening ? (
        <OpeningProps opening={opening} />
      ) : room ? (
        <RoomProps room={room} />
      ) : (
        <ApartmentProps apartment={plan.apartment} />
      )}
    </aside>
  )
}
```

Append the new section component:

```tsx
function OpeningProps({ opening }: { opening: Opening }) {
  const updateOpening = usePlanStore((s) => s.updateOpening)
  const deleteOpening = usePlanStore((s) => s.deleteOpening)

  return (
    <>
      <h3>{opening.kind === 'door' ? 'Door' : 'Window'}</h3>
      <NumberField
        label="Width (m)"
        value={opening.width}
        onCommit={(v) => updateOpening(opening.id, { width: v })}
      />
      <NumberField
        label="Height (m)"
        value={opening.height}
        onCommit={(v) => updateOpening(opening.id, { height: v })}
      />
      {opening.kind === 'window' && (
        <NumberField
          label="Sill height (m)"
          value={opening.sillHeight}
          onCommit={(v) => updateOpening(opening.id, { sillHeight: v })}
        />
      )}
      <NumberField
        label="Offset (m)"
        value={opening.offset}
        onCommit={(v) => updateOpening(opening.id, { offset: v })}
      />
      <button onClick={() => deleteOpening(opening.id)}>
        Delete {opening.kind === 'door' ? 'door' : 'window'}
      </button>
    </>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat: door/window toolbar placement and opening properties panel"
```

---

### Task 10: Browser E2E, README, final verification

**Files:**
- Modify: `README.md`
- No src changes expected — this task verifies; fixes discovered here go through the controller/review loop.

**Interfaces:**
- Consumes: the complete feature.
- Produces: E2E evidence (screenshots + console-clean run), updated README.

- [ ] **Step 1: Update the README**

In `README.md`, extend the "Use" section — after the Rooms bullet, add:

```markdown
- **Doors & windows**: with a room in place, click "+ Door" or "+ Window", then
  click a wall to place the opening (the target wall highlights green). Drag an
  opening to slide it along its wall; edit width/height/sill in the panel.
  Escape cancels placement. Openings cut real gaps in the 3D walls — doors get
  a panel, windows a translucent pane. An opening too wide for its wall, or
  overlapping another opening, tints orange.
```

- [ ] **Step 2: Run the browser E2E**

Environment note: install nothing into the repo. Create a throwaway dir, e.g. `/tmp/home-plan-e2e`, run `npm init -y && npm i playwright-core`, and drive the installed Google Chrome via `chromium.launch({ channel: 'chrome', headless: true })` (macOS has no `timeout` command — poll with a shell loop). Start the dev server first (`npm run dev`, poll `http://localhost:5173`).

E2E script (adapt paths; screenshot after each phase and READ the screenshots):

```js
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('canvas')

// room + door via real clicks
await page.click('text=+ Add room')
const box = await (await page.$('canvas')).boundingBox()
// replicate fitApartment (padding 60) to find the room's top wall: world (5, 2.5)
const scale = Math.min((box.width - 120) / 10, (box.height - 120) / 8)
const ox = (box.width - 10 * scale) / 2
const oy = (box.height - 8 * scale) / 2
const sx = (wx) => box.x + ox + wx * scale
const sy = (wy) => box.y + oy + wy * scale
await page.click('text=+ Door')
await page.mouse.click(sx(5), sy(2.5)) // top edge of the centered 3×3 room
await page.waitForTimeout(300)
console.log('DOOR=' + JSON.stringify((await page.evaluate(() => JSON.parse(localStorage.getItem('home-plan.plan') ?? '{}').openings ?? 'unsaved'))))
await page.screenshot({ path: 'e2e-1-door-placed.png' })

// slide the door along the wall
await page.mouse.move(sx(5), sy(2.5))
await page.mouse.down()
await page.mouse.move(sx(4), sy(2.5), { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(300)

// window on the right wall, then 3D
await page.click('text=+ Window')
await page.mouse.click(sx(6.5), sy(4))
await page.waitForTimeout(300)
await page.screenshot({ path: 'e2e-2-window-placed.png' })
await page.click('.mode-toggle button:has-text("3D")')
await page.waitForTimeout(1500)
await page.screenshot({ path: 'e2e-3-3d.png' })

// v1 migration: inject a v1 payload and reload
await page.evaluate(() => {
  const v1 = {
    version: 1, id: 'legacy', name: 'Legacy', apartment: { width: 10, depth: 8, wallHeight: 2.7 },
    rooms: [{ id: 'r1', name: 'Old room', color: '#8ecae6',
      polygon: [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 4 }, { x: 1, y: 4 }] }],
  }
  localStorage.setItem('home-plan.plan', JSON.stringify(v1))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('canvas')
// autosave only rewrites storage on the next plan change — trigger one, then wait out the debounce
await page.click('text=+ Add room')
await page.waitForTimeout(800)
console.log('MIGRATED=' + JSON.stringify(await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('home-plan.plan') ?? '{}')
  return { version: p.version, openings: p.openings, rooms: (p.rooms ?? []).length }
})))
await page.screenshot({ path: 'e2e-4-migrated.png' })
console.log('ERRORS=' + JSON.stringify(errors))
await browser.close()
```

Verify from the output and screenshots:
1. Door placed on the top wall (gap + symbol visible in screenshot 1; store has 1 opening at edgeIndex 0 with width 0.9).
2. Door slid left (offset changed).
3. Window placed on the right wall; 3D screenshot shows a real gap in the wall, a door panel, and a translucent pane.
4. v1 payload migrated: `MIGRATED` shows `version: 2`, `openings: []`, `rooms: 2` (the legacy room plus the one added to trigger autosave).
5. `ERRORS` is `[]` (favicon 404s in the console are known/ignorable; pageerror must be empty).

Stop the dev server when done.

- [ ] **Step 3: Full suite + build**

Run: `npm test` — PASS. `npm run build` — clean.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: doors & windows usage; E2E verified"
```

