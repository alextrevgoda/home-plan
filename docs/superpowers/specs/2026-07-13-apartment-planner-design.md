# Apartment Planner — v1 Design

**Date**: 2026-07-13
**Status**: Approved

## Purpose

A web app for planning apartment decoration. V1 covers the foundation: define the
apartment's real dimensions, then add, resize, move, and snap rooms to recreate the
real apartment layout — viewable in 2D (editing) and 3D (visualization). Doors,
windows, and furniture come in later iterations.

Personal project, built to grow: single plan and no backend for now, but the data
model and persistence are designed so multiple plans, sharing, and a backend can be
added without a rewrite.

## Scope

**In scope (v1)**
- Apartment dimensions (width × depth, wall height), metric units (meters, cm precision)
- Rooms as axis-aligned rectangles: add, select, move, resize, rename, recolor, delete
- Snapping: grid, other rooms' edges, apartment boundary
- 2D editor (PixiJS) and read-only 3D viewer (Three.js), toggleable
- Persistence: localStorage autosave + JSON export/import

**Out of scope (v1)**
- Doors, windows, furniture, decoration
- L-shaped/polygonal room editing (data model supports it; editor does not)
- First-person walkthrough (architecture supports adding it later)
- Multiple plans, accounts, backend, sharing

## Architecture

**Stack**: Vite + React 18 + TypeScript. PixiJS v8 for the 2D editor; Three.js via
react-three-fiber + drei for the 3D viewer. Zustand for state. Zod for validation.

```
src/
  model/        # Plan types, geometry helpers, serialization — pure TS, no rendering deps
  store/        # Zustand store: plan state + actions (addRoom, moveRoom, resizeRoom, ...)
  editor2d/     # Pixi canvas component + interaction logic (select, drag, resize, snap)
  viewer3d/     # r3f scene: floors, extruded walls, orbit controls
  ui/           # React shell: toolbar, mode toggle, properties panel
```

**Core rule**: both renderers are pure views of the store. The 2D editor dispatches
actions; the 3D viewer only reads. Neither knows the other exists. Mode switch
unmounts one view and mounts the other; nothing is lost because all state lives in
the store. `model/` has zero dependencies on Pixi/Three/React, so geometry and
snapping logic is unit-testable.

**Persistence**: autosave to localStorage on change (debounced), plus JSON
export/import buttons. The schema carries a `version` field from day one so a future
backend reuses the same serializer.

## Data model

Meters internally, cm precision (values rounded to 0.01). 2D coordinates are Y-down,
matching screen space; the 3D view maps plan (x, y) → (x, z).

```ts
interface Plan {
  version: 1;
  id: string;
  name: string;
  apartment: { width: number; depth: number; wallHeight: number }; // wallHeight default 2.7
  rooms: Room[];
}

interface Room {
  id: string;
  name: string;          // "Bedroom", "Kitchen"...
  polygon: Vec2[];       // CCW outline; v1 editor only creates axis-aligned rectangles
  color: string;         // fill tint in 2D, floor tint in 3D
}
```

Rooms are **stored as polygons but edited as rectangles**: the editor derives
`x/y/w/h` from the axis-aligned polygon and writes back a 4-point polygon. When
L-shapes arrive later, the model, serializer, and 3D extrusion already handle them —
only the editor grows new tools. Walls are derived at render time (extruded polygon
edges, 10 cm thick), never stored.

## 2D Editor (PixiJS)

Infinite pannable/zoomable canvas (wheel = zoom to cursor, space-drag or middle-drag
= pan) with a meter grid: light lines every 0.1 m, stronger every 1 m. The apartment
boundary renders as a thick outline; rooms as filled rects with the room name and
live dimensions ("4.20 × 3.50") centered inside.

**Interactions**
- **Add room** — toolbar button drops a default 3×3 m room in the center, selected.
- **Select** — click a room: 8 resize handles + highlight. Click empty space
  deselects. Delete/Backspace removes.
- **Move** — drag the room body. **Resize** — drag a handle; the opposite edge stays
  anchored.
- **Snapping** (move and resize): to the 0.1 m grid, to other rooms' edges, and to
  the apartment boundary. Edge snap wins over grid snap within a 10 px screen-space
  threshold; active snap lines render as colored guides. Holding Alt disables
  snapping.
- **Properties panel** (React, right side) — selected room: name, exact
  x/y/width/height inputs, color swatch. Apartment width/depth/wall-height appear
  when nothing is selected.

Minimum room size 0.5×0.5 m. Rooms may overlap each other or extend past the
apartment boundary — instead of blocking the drag, the offending room tints
red/orange as a warning.

## 3D Viewer (react-three-fiber)

Read-only in v1. The scene derives entirely from the store: a ground plane, per-room
floor slabs tinted with the room color, and walls extruded from each room's polygon
edges — 10 cm thick, `wallHeight` tall. Shared edges between adjacent rooms
naturally read as a single wall since both rooms extrude to the same line. Lighting:
soft ambient + one directional with shadows. Camera: orbit controls (rotate, zoom,
pan) with limits preventing going under the floor. The camera is a swappable
component so the future first-person mode is a new camera + controls, not a rewrite.

The `2D | 3D` mode toggle sits in the top toolbar.

## Error handling

- **Load**: plan JSON is validated with zod (localStorage or imported file).
  Corrupt or unknown-version data → start with a fresh default plan, preserve the
  bad payload under a `home-plan.backup` localStorage key, show a toast.
- **Input**: numeric fields clamp (room ≥ 0.5 m per side, apartment 1–100 m per
  side, wall height 2–5 m); invalid text reverts to the previous value.
- **Geometry**: degenerate polygons (< 3 points, zero area) are rejected by store
  actions — the store never holds an invalid plan, so renderers don't defend
  against one.

## Testing

- **Vitest unit tests** for everything in `model/` and `store/`: rect↔polygon
  conversion, snapping math (room edges + drag position → snapped position),
  clamping, serialization round-trip, zod validation/rejection paths.
- **Component smoke tests** (Testing Library) for properties panel ↔ store wiring.
- Canvas interactions (drag/resize/orbit) are verified manually in the browser;
  automated WebGL interaction tests are not worth it at this stage.

## Future direction (not in v1, informs design)

- Doors and windows as wall-attached openings
- Furniture/decoration placement in both 2D and 3D
- Polygonal (L-shaped) room editing
- First-person walkthrough camera
- Multiple plans, backend persistence, shareable links
