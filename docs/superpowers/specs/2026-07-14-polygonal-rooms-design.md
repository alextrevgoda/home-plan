# Polygonal (Rectilinear) Room Editing — Design

Date: 2026-07-14
Status: approved
Follows: `2026-07-14-furniture-decoration-design.md` (schema v3)

## Purpose

Rooms are stored as polygons but editable only as rectangles. This iteration
makes any rectilinear outline — L, T, U, Z, any number of corners — editable
directly in the 2D editor, closing the long-deferred gap that non-rect
polygons are invisible and unselectable in 2D.

## Scope

In scope:

- Rectilinear room outlines: every edge horizontal or vertical, any number
  of corners
- Editing gestures: push a wall perpendicular (edge handle), move a corner
  (vertex handle), split a wall at a point (double-click) to enable notches
- Automatic collinear merge (pushing a notch flush removes it — this is the
  "undo" for a split; no explicit vertex-delete gesture)
- Attachment stability: doors, windows, and wall furniture survive push,
  split, and merge with correct edge references and offsets
- Polygon-aware selection (point-in-polygon), rendering, labels
  (name + area m² at the centroid), and 3D floors (ShapeGeometry)
- Store validation of the new invariants; zod tightening for imports

Not in scope (future iterations):

- Diagonal walls / arbitrary angles, curved walls
- Boolean room composition (merge two rooms, room-minus-room)
- Bounding-box numeric editing of non-rect rooms in the properties panel
- First-person walkthrough, multi-plan/backend (later roadmap items)

## Data model & invariants

No schema change — `Plan.version` stays 3; rooms keep `polygon: Vec2[]`.

The store enforces a tightened invariant on every commit:

- **Rectilinear:** every edge axis-aligned (dx = 0 xor dy = 0)
- **Simple:** no self-intersection
- **Winding:** the same order `rectToPolygon` produces today (all
  inward-normal math — wall snapping `(-uy, ux)`, wall furniture, 3D wall
  orientation — depends on it)
- **Min edge:** every edge ≥ 0.1 m (`MIN_EDGE`); `MIN_ROOM_SIZE` (0.5 m)
  continues to bound overall rect creation
- **Canonical:** no collinear adjacent edges (merged automatically after
  every edit), area > 0, all coordinates cm-rounded

Zod: v3 imports whose polygons violate rectilinearity or simplicity are
rejected with the standard toast. (Only hand-edited files can contain such
polygons — the app never produced one.)

## Pure geometry — `src/model/polygon.ts`

New module owning all polygon math (no Pixi/Three/React):

- Predicates: `isRectilinear`, `isSimplePolygon`, `pointInRectilinearPolygon`
- Metrics: `polygonAreaSigned`/reuse of `polygonArea`, `polygonCentroid`,
  `polygonBounds`
- Canonicalization: `mergeCollinear(polygon)`, winding normalization
- Editing primitives returning whole consistent plans (rooms + openings +
  wall furniture remapped together):
  - `pushRoomEdge(plan, roomId, edgeIndex, coordinate): Plan | null` —
    translates the edge perpendicular to `coordinate`; neighbors stretch;
    result merged/validated; `null` if invalid (e.g. pushed through the
    opposite wall, or an edge falls below `MIN_EDGE`)
  - `splitRoomEdge(plan, roomId, edgeIndex, t): Plan | null` — inserts a
    vertex at distance `t` along the edge (cm-rounded; both resulting
    segments ≥ `MIN_EDGE`)
  - `moveRoomVertex(plan, roomId, vertexIndex, point): Plan | null` — the
    corner's x follows its vertical neighbor edge, y its horizontal one
  - `translateRoom(plan, roomId, delta): Plan | null`

### Attachment remapping rules

Openings and wall furniture reference walls by `edgeIndex` + `offset`:

- **Push** (no topology change): indices unchanged; offsets on the room's
  edges re-clamped (neighbor edges change length)
- **Split at t:** indices after the split edge shift +1; items on the split
  edge re-home to the sub-edge containing their center, offset recomputed
  from the new edge start, clamped (a straddling item lands on its center's
  side; the existing overlap warning flags corner collisions)
- **Merge:** reverse mapping — items re-home onto the merged edge with
  offsets recomputed; subsequent indices shift −1

## Store

- New actions (validate → reject-as-no-op on `null`, same single-writer
  rule): `moveRoom(id, delta)`, `pushRoomEdge(id, edgeIndex, coordinate)`,
  `splitRoomEdge(id, edgeIndex, t)`, `moveRoomVertex(id, vertexIndex, point)`
- `updateRoomRect` remains only as the properties-panel path for pure-rect
  rooms
- `addRoom` still spawns a 3×3 rect
- Out-of-apartment placement follows the existing room paradigm: allowed,
  rendered with the orange warning tint (`rectInBounds` generalizes to a
  polygon-bounds check). The room-overlap warning likewise generalizes via
  bounding-box overlap — a deliberate approximation for non-convex shapes
  (two L-shapes whose boxes overlap but bodies don't will false-positive;
  acceptable for a warning tint)

## 2D editor

- **Handles:** the rect `nw/n/ne/…` handle system retires. Selected rooms
  show vertex handles (squares at corners) and edge handles (midpoints).
  Edge drag = perpendicular push; vertex drag = corner move. For 4-vertex
  rooms this reproduces today's resize behavior exactly.
- **Split:** double-click a wall splits it at the cm-rounded click point
  (rejected if either segment would fall below `MIN_EDGE`). One split per
  notch corner: L = one split + push; mid-wall alcove (T/U) = two splits +
  push the middle segment.
- **Snapping:** pushed edges and dragged vertices snap to the 0.1 m grid and
  other rooms' wall lines via the existing `snapScalar`; Alt disables.
- **Selection & render:** `hitRoom` uses point-in-polygon; `drawRooms` draws
  the polygon path (fill + floor tint + stroke); label (name + area m²) sits
  at the polygon centroid.
- **Room body drag** translates the whole polygon, with the usual snapping
  against other rooms' lines and the apartment boundary.
- Escape/delete/drag-revert semantics unchanged.

## Properties panel

All rooms: name, color, floor material, wall color, area (read-only),
delete. X/Y/Width/Height NumberFields render only when `polygonToRect`
succeeds; non-rect rooms are edited on canvas only.

## 3D viewer

Walls, openings, and wall furniture already iterate polygon edges —
untouched. Floors switch from rect `planeGeometry` to a `ShapeGeometry`
built from the polygon, for both plain-color and textured floors.
ShapeGeometry UVs equal shape (world) coordinates, preserving the
1-texture-tile-per-m² floor scale.

## Error handling

- Invalid edit results (self-intersection, sub-`MIN_EDGE` edges, zero area)
  never enter the store — actions are no-ops, consistent with existing
  invalid-edit handling; out-of-apartment placement stays a warning, not an
  error (see Store)
- Split rejected within `MIN_EDGE` of an edge end (no sliver segments)
- Imports with non-rectilinear/non-simple polygons reject with a toast
- Attachments that end up overlapping a corner after a split are kept and
  flagged by the existing opening-warning system

## Testing

- **Vitest, pure model:** rectilinearity/simplicity predicates,
  point-in-polygon (incl. notch interiors and boundary cases), centroid,
  collinear merge, push/split round-trips (split + push flush + merge
  returns the original), attachment remap tables across push/split/merge
  (openings and wall furniture, incl. straddling items), invalid-result
  rejection (push through opposite wall, sliver splits)
- **Store:** action validation and no-op rejection, re-clamping, rect-room
  equivalence (vertex/edge drags on a 4-vertex room reproduce
  `updateRoomRect` results)
- **Component:** properties panel hides X/Y/W/H for non-rect rooms
- **Browser E2E:** build an L and a U on canvas; split a wall carrying a
  door and verify the door survives on the correct segment; select a room
  by clicking inside its notch (point-in-polygon); screenshot the L-shaped
  floor (textured) in 2D and 3D

## Future direction (informs design, not in scope)

- Room merge/subtract booleans built on the same polygon module
- Diagonal walls (drops the rectilinear invariant; revisit snapping then)
- Numeric edge-length editing (click a wall, type its length)
