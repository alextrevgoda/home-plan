# Opening Drag-Resize + Door Swing State — Design

Date: 2026-07-15
Status: approved for planning

## Goal

Two additions to the apartment planner's doors & windows:

1. **Drag-resize** — resize a selected door or window by dragging either jamb in the 2D editor (width along the wall; height/sill stay numeric-only in the properties panel).
2. **Door swing state** — every door gets a persisted hinge side, swing direction, and open/closed state, rendered in both the 2D symbol and the 3D leaf.

## Schema — plan v4

`Opening` gains three fields, **doors only**:

```ts
interface Opening {
  // ...existing: id, kind, roomId, edgeIndex, offset, width, height, sillHeight
  hinge?: 'start' | 'end'   // jamb the leaf pivots on, in edge direction (polygon[i] → polygon[i+1])
  swing?: 'in' | 'out'      // 'in' = into the owning room, 'out' = away from it
  open?: boolean
}
```

- Zod: required on `kind === 'door'`, rejected/stripped on windows.
- Plan `version` bumps 3 → 4. Migration on load: v3 doors get `hinge: 'start'`, `swing: 'in'`, `open: false`. v1/v2/v3 files continue to chain-migrate.
- Room polygons are winding-normalized (positive signed area), so the interior side of any edge is deterministic. A pure helper in `src/model/openings.ts`:

```ts
doorSwing(opening, room): { hingePoint, leafEnd, arcStart, arcEnd } | null
```

returns world-space geometry for the leaf (closed position = across the gap toward the far jamb; open position = rotated 90° into the swing quadrant) and the quarter-circle arc between them. Model stays pure — no Pixi/Three/React.

## Store ops (single writer, never an invalid plan)

- **New** `resizeOpeningEnd(id, end: 'start' | 'end', t: number)` — `t` is the cm-rounded distance along the edge for the dragged jamb. Pins the opposite jamb, derives `width` + `offset` atomically, clamps to `MIN_OPENING_WIDTH` (0.3) and `[0, edgeLength]`. The fixed jamb never moves during a drag, including at clamp boundaries.
- `updateOpening(id, patch)` accepts `hinge`, `swing`, `open` for doors; strips them for windows. Non-finite numeric guards unchanged.
- Room-edit clamping: when an edge shrinks below an opening's width, the opening's **width now re-clamps** to the edge length (fixes a latent gap from the doors/windows final review, where only offset was clamped).

## 2D editor

- **Jamb handles**: selected opening shows square handles at both jambs (same visual language as polygon vertex handles). Hit priority: jamb handle → opening body (move, existing behavior). Touch: hit radii double via existing `hitRadius(base, pointerType)`.
- **New drag kind** `resizeOpening { openingId, end, startWidth, startOffset }` in Editor2D: pointer capture as per existing drags; Escape and second-finger-cancel revert to `startWidth`/`startOffset`; drag calls `resizeOpeningEnd` with `roundCm(projectOntoEdge(edge, world))`.
- **Door symbol** (replaces the current line-across-gap): always hinge-aware.
  - Closed: leaf line across the gap from the hinge jamb + faint quarter swing arc.
  - Open: leaf line perpendicular, rotated into the swing quadrant + arc.
  - Selected/warning colors unchanged. Windows keep the double-line symbol.

## 3D viewer

- Closed door: current brown slab, unchanged.
- Open door: leaf box wrapped in a group anchored at the hinge jamb, rotated 90° (`rotationY` ±π/2 by swing side and edge orientation) so the doorway is visually passable. This is the geometry hook the future first-person walkthrough will use.
- Windows unchanged.

## Properties panel

Door-selected panel adds, below the existing number fields:

- **Open / Closed** toggle
- **Hinge: left / right** segmented pair
- **Swings: inward / outward** segmented pair

Left/right is presented as seen facing the wall from inside the owning room (label mapping computed from edge direction + winding, stored value stays `start`/`end`). Mobile bottom-sheet inherits these for free.

## Edge cases & errors

- Resize clamps rather than rejects (consistent with NumberField/store behavior).
- Overlapping openings remain allowed with the existing warning highlight; resize adds no prevention.
- Hand-edited files with swing fields on windows fail zod per-field and strip cleanly; missing fields on doors get migration defaults.
- Doors on very short edges: min-width clamp wins; a door can equal the full edge length.
- Swing arc may cross neighboring rooms/furniture in 2D — purely visual, no collision semantics.

## Testing

- Unit: `doorSwing` all 4 hinge×swing combos across multiple edge orientations (horizontal/vertical/reversed); `resizeOpeningEnd` pin-invariance at clamp boundaries; edge-shrink width re-clamp; v3→v4 migration; zod door/window field rules; round-trip serialization.
- Interaction: jamb-handle hit priority over opening body; touch radius doubling.
- E2E (inline browser, `playwright-core` + installed Chrome, headless): drag a jamb to resize, toggle open, flip hinge/swing, verify 2D symbol and 3D leaf via screenshots; mobile touch spot-check of the resize drag.

## Out of scope

- Open angle other than 90° (boolean only; walkthrough can treat open = 90°).
- Sliding/pocket/double doors.
- Drag-editing height or sill in 2D (top-down view can't express them).
- Walkthrough collision/traversal itself (future feature; this only provides the state).
