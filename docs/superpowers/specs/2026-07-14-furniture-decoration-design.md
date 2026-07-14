# Furniture & Decoration — Design

Date: 2026-07-14
Status: approved
Follows: `2026-07-14-doors-windows-design.md` (schema v2, openings)

## Purpose

Furniture and decoration are the app's original goal: plan how a real apartment
will look, not just its walls. This iteration adds placeable furniture and decor
in both views, plus per-room surface finishes. The user's stated priority is
**realistic visualization** — recognizable 3D furniture with real materials —
while keeping dimensions true to the real world so plans stay trustworthy.

## Scope

In scope:

- A bundled catalog (~24 items) of CC0 GLTF furniture/decor models across
  bedroom, living room, kitchen & dining, bathroom, and decor categories
- Placement, move, free-angle rotation, wall snapping, and per-axis resizing
  (within per-item bounds) in the 2D editor; architectural top-view symbols
- Solid-vs-solid collision blocking; rugs (underlay) and wall art (overlay)
  are exempt and layer freely
- Wall-mounted decor (wall art, wall shelf) attached to room edges using the
  same edge-attachment scheme as openings
- Per-room floor material (fixed list of ~6 textures) and wall color (free hex)
- Optional recoloring of one primary material slot per eligible item
- Rendering of all of the above in the read-only 3D viewer
- Plan schema v3 with migration from v2 (and transitively v1)

Not in scope (future iterations):

- User-imported models
- Polygonal (L-shaped) room editing, first-person walkthrough, multi-plan/backend
- Per-wall (as opposed to per-room) paint, wallpaper, ceiling treatment
- Physical stacking (objects on tables); overlay/underlay layering is 2D-visual only

## Data model

The catalog is static code (`src/model/catalog.ts`), not plan data. Plans store
only instance state and reference catalog entries by id.

```ts
interface CatalogItem {
  id: string                 // 'sofa-3seat', 'bed-double', 'rug-rect', …
  name: string
  category: 'bedroom' | 'living' | 'kitchen' | 'bathroom' | 'decor'
  mount: 'floor' | 'wall'
  layer: 'solid' | 'underlay' | 'overlay'  // only solids collide
  defaultSize: Size3         // real-world meters
  sizeBounds: { min: Size3; max: Size3 }   // clamps for resizing
  modelPath: string          // GLB under public/models/
  symbolId: string           // 2D vector symbol
  recolorable?: string       // name of the primary material slot, if any
}

interface Size3 { width: number; depth: number; height: number }
```

Placed items are a discriminated union on mount type:

```ts
interface FloorItem {
  id: string
  catalogId: string
  mount: 'floor'
  position: Vec2             // footprint center, meters
  rotation: number           // degrees CCW, 0 = catalog orientation
  size: Size3
  color?: string             // tint for the recolorable slot
}

interface WallItem {
  id: string
  catalogId: string
  mount: 'wall'
  roomId: string
  edgeIndex: number          // same scheme as Opening
  offset: number             // meters from edge start to item center
  elevation: number          // meters from floor to item bottom
  size: Size3
  color?: string
}

type PlacedItem = FloorItem | WallItem
```

Rooms gain two optional fields; absence means today's defaults:

```ts
interface Room {
  // …existing fields
  floorMaterial?: string     // id from the fixed finishes list
  wallColor?: string         // hex, room-facing wall side in 3D
}
```

`Plan.version` becomes `3` and the plan gains `furniture: PlacedItem[]`.
Selection extends to `{ kind: 'room' | 'opening' | 'furniture', id }`.

## Schema & migration

- Load-time migration chain: v1 → v2 (existing) → v3. The v2 → v3 step adds
  `furniture: []`; rooms need no changes because the new fields are optional.
- Zod validation (extending the existing schema):
  - `catalogId` must exist in the catalog; unknown ids reject the whole file
    with a clear toast (store never holds an invalid plan)
  - `size` clamps to the catalog item's `sizeBounds`
  - Floor-item positions clamp inside the apartment; wall-item `offset` and
    `elevation` clamp to the referenced edge's length and the wall height
  - `rotation` normalizes to [0, 360)
  - `floorMaterial` must be a known finish id; `wallColor` a valid hex
- Store remains the single writer: all placement/edit actions round to cm,
  clamp, and validate before committing.

## Catalog contents & assets

Initial catalog (curated to what good CC0 models exist; count approximate):

- **Bedroom:** double bed, single bed, wardrobe, nightstand, dresser
- **Living room:** 3-seat sofa, armchair, coffee table, TV stand, bookshelf
- **Kitchen & dining:** dining table, dining chair, kitchen counter unit,
  fridge, washing machine
- **Bathroom:** toilet, sink vanity, bathtub, shower stall
- **Decor:** rug (underlay), potted plant, floor lamp, wall art (wall-mounted,
  overlay), wall shelf (wall-mounted)

Asset pipeline (one-time preprocessing, results committed to the repo):

- Source: CC0 libraries with realistic-leaning models (Poly Haven and similar);
  per-file attribution recorded in `public/models/CREDITS.md`
- `gltf-transform`: meshopt compression, textures ≤ 1K KTX2, target ≤ ~1.5 MB
  per GLB
- Normalized orientation (front faces −Y in plan coordinates) and origin at the
  footprint center on the floor plane
- Meshopt/KTX2 decoder wasm ships with the app — no CDN dependency
- If no acceptable CC0 model exists for an item, the item is dropped from the
  catalog rather than shipped as a placeholder

Expected repo cost ≈ 36 MB of models. Lazy loading keeps runtime cost
proportional to what a plan actually uses.

## Store & selection

New store actions (all validating, cm-rounding, clamping):

- `placeFurniture(catalogId, placement)` — from placement mode; rejects
  colliding/out-of-bounds drops
- `moveFurniture(id, position | {edgeIndex, offset})`, `rotateFurniture(id, deg)`,
  `resizeFurniture(id, size)`, `recolorFurniture(id, color | undefined)`,
  `deleteFurniture(id)`
- `setRoomFloorMaterial(roomId, id | undefined)`, `setRoomWallColor(roomId, hex | undefined)`
- Invalid drops (solid collision, out of bounds) revert to the pre-drag state,
  reusing the existing invalid-edit revert pattern
- Deleting a room cascades to its wall-mounted items (same as openings);
  floor furniture is not room-owned and survives
- Apartment resize clamps stranded floor items back inside bounds (same rule
  as rooms)

## 2D editor

- **Catalog panel:** a "Furniture" toolbar button toggles a left-side panel
  with category tabs; items show their 2D symbol and name. Clicking an item
  enters placement mode; the panel stays open for repeated placement. Escape
  or re-clicking exits. 2D-mode only.
- **Placement mode:** ghost symbol follows the cursor; invalid (collision /
  out of bounds) renders red and click is a no-op. Valid click drops the item
  at `defaultSize` and exits placement mode. Wall items ghost along room edges
  like door placement and attach to the nearest edge.
- **Symbols:** each `symbolId` maps to a Pixi vector-drawing function drawing
  an architectural top view inside the item's footprint; rotates with the item
  and stays crisp at any zoom.
- **Selection & rotation:** standard selection styling plus a rotation handle
  above the footprint; dragging rotates with 15° snap ticks, Shift for free
  angle.
- **Move & snap:** floor items drag freely (cm-rounded). Within ~15 cm of a
  wall, the item snaps flush and aligns rotation to the wall. Wall items slide
  along their edge (reusing opening-slide) and can jump to another edge when
  dragged near it. Colliding solids render red during drag; dropping reverts.
- **Collision math** (pure `src/model/`): SAT overlap between oriented solid
  footprints plus apartment containment. Room-agnostic — furniture may
  straddle room boundaries.
- **Z-order:** room fills → floor-material tint → rugs → solid furniture →
  wall items → walls/openings. Picking is reverse z-order (topmost wins).
- **Finishes in 2D:** floor material renders as a subtle tint over the room
  fill; wall color has no 2D representation (3D only).
- Escape continues to cancel drags and never leaks into typing targets
  (existing guard).

## 3D viewer

- GLTFLoader with meshopt/KTX2 support; models lazy-load on first use, cached
  per `catalogId`, cloned per instance
- Loaded models normalize to `defaultSize`, then scale non-uniformly to the
  instance size; `sizeBounds` keep distortion acceptable
- `color` tints only the catalog-named material slot; other materials untouched
- Wall items hang against the wall face at their `elevation`
- Room floors render their material texture with world-scale UVs (true tile
  size); walls tint with the room's `wallColor` on the room-facing side
- Model load failure: gray box at correct dimensions plus a one-time toast;
  plan data untouched
- Viewer stays read-only

## Properties panel

- **Furniture selected:** catalog name, width/depth/height NumberFields
  (live-clamped to `sizeBounds`), rotation field, color swatch + reset when
  recolorable, Delete. Wall items show offset-along-wall and elevation instead
  of position.
- **Room selected:** existing fields plus a floor-material swatch row and a
  wall-color picker, each with a "default" reset.

## Error handling

- Unknown `catalogId`, bad finish id, or malformed fields on import: zod
  rejects the file with a clear toast
- Model fetch/decode failure in 3D: gray-box fallback + toast (see above)
- Collision and bounds violations never enter the store — blocked at action
  level with the revert pattern

## Testing

- **Vitest, pure model:** SAT collision (rotated rects, touching-not-
  overlapping, containment), wall-snap distance + angle alignment, catalog
  integrity (unique ids, valid bounds/symbols/paths, defaultSize within
  bounds), v2 → v3 migration, zod round-trips including clamping and
  unknown-id rejection
- **Store:** place/move/rotate/resize/recolor/delete, collision revert,
  room-delete cascade, apartment-resize clamping, finishes set/reset
- **Component (Testing Library):** properties panel ↔ store wiring for
  furniture fields and room finishes; catalog panel placement-mode toggling
- **Browser E2E** (playwright-core driving installed Chrome, headless): place
  a sofa, rotate it, wall-snap it, verify a blocked collision drop, set a
  floor material, screenshot 2D and 3D

## Future direction (informs design, not in scope)

- User-imported GLTF models (the catalog/instance split is designed so a
  "user catalog" can sit beside the static one)
- Per-wall finishes and wallpaper
- Physical stacking and surface attachment (lamp on nightstand)
- Catalog growth: more items per category, size variants
