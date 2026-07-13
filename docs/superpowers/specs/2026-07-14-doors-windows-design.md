# Doors & Windows — Design

**Date**: 2026-07-14
**Status**: Approved
**Builds on**: `2026-07-13-apartment-planner-design.md` (v1)

## Purpose

Add doors and windows to the apartment planner as wall-attached openings: placed
and slid along room walls in the 2D editor, rendered as real gaps (with simple
fills) in the 3D view. Openings belong to rooms and move with them.

## Scope

**In scope**
- Openings (`door` | `window`) attached to a room edge, with width, height, and
  (windows) sill height; doors carry no swing/type detail — just a positioned
  gap with editable width and height
- 2D: placement mode (click a wall), slide-along-wall dragging, gap + symbol
  rendering, selection, warnings, properties-panel editing, Delete
- 3D: walls split into sub-boxes around openings (jambs, lintels, window
  breasts); openings cut through BOTH coincident walls on a shared edge; simple
  fills (door panel, translucent window pane)
- Plan schema `version: 2` with v1 → v2 migration (`openings: []`)
- Selection model generalized to room-or-opening

**Out of scope**
- Door swing arcs, hinge sides, door/window types (single/double/sliding)
- Resizing openings by dragging handles in 2D (panel-only)
- Openings on apartment boundary walls (there are none — v1 renders no boundary
  walls in 3D; openings attach to room edges only)
- Furniture, polygonal rooms, walkthrough camera (later roadmap items)

## Data model

```ts
interface Opening {
  id: string
  kind: 'door' | 'window'
  roomId: string        // owning room
  edgeIndex: number     // 0..polygon.length-1; edge = polygon[i] → polygon[(i+1) % n]
  offset: number        // meters from edge start to opening CENTER, cm-rounded
  width: number         // door default 0.9, window default 1.2; min 0.3
  height: number        // door default 2.1, window default 1.2; clamped ≤ wallHeight − 0.1
  sillHeight: number    // doors: always 0; windows default 0.9
}

interface Plan {
  version: 2
  // ...v1 fields unchanged...
  openings: Opening[]   // new top-level list
}
```

A door is an opening with `sillHeight: 0` — one code path for wall cutting, two
for symbols and defaults.

**Derived-geometry contract** (pure, `src/model/openings.ts`):
- `openingSpan(opening, room)` → the opening's world-space segment on its edge
  (center from `offset`, direction from the edge).
- `openingsOnEdge(edgeA, edgeB, plan)` → every opening in the plan — any owner —
  whose span is collinear with and overlapping the segment `edgeA → edgeB`.
  This single function implements "cut through both walls": the neighbouring
  room's wall asks the same question and receives the same openings.
- Interval helpers to merge overlapping opening spans on one edge.

**Invariants (store-enforced)**
- `offset` clamped to `[width/2, edgeLength − width/2]` on create, move, and
  whenever the owning room is resized.
- If an edge is shorter than an opening's width, the opening is kept (offset
  clamped to edge center) and flagged by a derived `tooWide` check — warning
  tint in 2D, never silent deletion.
- All values cm-rounded; non-finite input rejected; deleting a room deletes its
  openings.

## Schema & migration

`parsePlan` becomes parse → migrate → validate:
- `version: 1` payloads migrate by adding `openings: []` and `version: 2`, then
  validate against the v2 schema. Existing localStorage plans and exported
  files keep loading.
- Unknown versions still reject (→ backup + fresh plan), as in v1.
- The v2 schema validates openings hard: finite numbers, `width ≥ 0.3`,
  `sillHeight ≥ 0`, `height > 0`, `kind` enum, and cross-references — `roomId`
  must name an existing room and `edgeIndex` must be in range for that room's
  polygon. Violations reject the whole plan.
- A v2 file opened by a stale v1 app rejects safely (v1's `version: 1` literal)
  instead of silently stripping openings.

## Store & selection

New actions (all clamped/rounded like v1):
- `addOpening(kind, roomId, edgeIndex, offset): string` — defaults per kind,
  selects the new opening, returns its id
- `moveOpening(id, offset)` — clamp along the edge
- `updateOpening(id, patch)` — width/height/sillHeight/offset with clamps
  (`sillHeight + height ≤ wallHeight − 0.1`, applied when the opening is
  edited; lowering `wallHeight` later does not retroactively rewrite openings —
  the 3D renderer clips defensively instead)
- `deleteOpening(id)`
- `updateRoomRect` re-clamps that room's openings' offsets; `deleteRoom`
  cascade-deletes its openings.

Selection generalizes:

```ts
selection: { kind: 'room'; id: string } | { kind: 'opening'; id: string } | null
```

with `selectRoom(id)`, `selectOpening(id)`, `deselect()`. The 2D editor, the
properties panel, and Delete-key handling migrate from `selectedRoomId` to this
union in one contained refactor.

## 2D editor

**Placement**: toolbar gains `+ Door` and `+ Window`, enabled only when at
least one room exists. Clicking one arms placement mode. While armed, hovering
within ~10 px (screen space) of a room edge highlights that edge; clicking
drops the opening at the click point projected onto the edge (offset clamped),
selects it, and disarms. `Escape` or clicking away from any wall cancels the
mode. Pan/zoom stay live while armed.

**Rendering**: an opening paints a background-colored gap over its wall line,
plus a symbol: door = perpendicular jamb ticks with a thin leaf outline;
window = double parallel lines across the gap. Selected opening renders blue;
warning (tooWide, or overlapping another opening on the same edge) renders the
v1 orange. On shared edges the gap is drawn once per opening (by owner).

**Editing**: dragging a selected opening slides it along its own edge — the
pointer is projected onto the edge line and the offset clamped, so it can
never leave the wall. Width/height/sill are edited only in the properties
panel. `hitOpening` (screen-space distance to the opening's span, ~8 px) runs
before `hitRoom` so small targets win. Delete/Backspace removes whichever is
selected.

**Properties panel**: opening selected → kind label ("Door"/"Window"), Width,
Height, Sill height (windows only), Offset (m along wall), Delete button. Same
NumberField semantics as v1 (commit on blur/Enter, revert on invalid, store
clamps).

## 3D viewer

`wallsForPolygon(polygon, wallHeight)` is replaced by
`wallSegmentsForRoom(room, plan)` in `src/viewer3d/walls.ts`:
- Per edge: collect opening intervals via `openingsOnEdge`, clamp them to the
  edge, merge overlaps, then emit boxes —
  - full-height wall pieces between/beside openings,
  - a lintel above each opening (top of opening → ceiling),
  - a breast below each window (floor → sill).
- All boxes keep v1's thickness (0.1) and derive-only philosophy; heights are
  defensively clipped to `[0, wallHeight]`.
- Degenerate sub-boxes (length or height ≤ 1 cm) are skipped.

**Fills** render once per opening by its owner (no duplicates on shared
walls): door = 4 cm wood-toned panel filling the gap; window = translucent
pale-blue pane (opacity ≈ 0.35, double-sided) from sill to sill + height.

## Error handling

- Schema v2 rejections and migration handled as above; corrupt data keeps the
  v1 backup/recovery path.
- Store: non-finite patches rejected; all clamps at the action boundary; the
  store never holds an opening referencing a missing room (cascade delete) or
  an out-of-range edge (rect rooms always have 4 edges; `edgeIndex` validated
  at creation).
- Renderers stay defensive-free except the 3D height clipping noted above.

## Testing

- **Unit (model)**: `openingSpan` resolution on all 4 rect edges; offset
  clamping incl. too-short edges; `openingsOnEdge` collinear-overlap detection
  across shared edges (neighbour's openings found) and rejection of parallel
  non-collinear edges; interval merging.
- **Unit (walls)**: door mid-wall → 3 boxes (two jamb pieces + lintel); window
  → 4 boxes (+ breast); opening at an edge end → 2 boxes; two overlapping
  openings merge into one gap; opening on a shared edge cuts the neighbouring
  room's wall; degenerate pieces skipped.
- **Unit (serialization/store)**: v1 → v2 migration; v2 round-trip with
  openings; cross-reference rejections; addOpening defaults/clamps; room
  resize re-clamps offsets; deleteRoom cascades; selection actions.
- **Component**: properties panel for a selected opening (fields, clamps,
  delete).
- **E2E (headless Chrome)**: place a door and a window, slide the door, check
  panel values, switch to 3D and screenshot (gap + pane visible), reload
  (autosave round-trips v2), import a v1 export (migration live).
- Canvas interaction feel verified in the E2E screenshots as in v1.

## Deployment note

The repo auto-deploys to GitHub Pages (`alextrevgoda.github.io/home-plan`) on
every push to main; merging this feature publishes it.

## Future direction (informs design, not in scope)

Swing arcs and door types slot into `Opening` as optional fields; polygonal
rooms already work with `edgeIndex` semantics; furniture will reuse the
selection union.
