# Mobile View Support — Design

**Date:** 2026-07-14
**Status:** Approved
**Scope decision:** Full editing parity on phones. Primary verification target: iPhone Safari.

## Goal

The app currently has a desktop-only shell (fixed side panels, one-row toolbar, no media queries) and mouse-only 2D navigation (wheel zoom, middle-button pan). On a phone the panels crush the canvas and the plan cannot be panned or zoomed at all. This feature makes the full editing experience work on a phone: create/move/resize rooms, place doors/windows/furniture, edit properties, and navigate both views by touch.

Approach chosen: **responsive adaptation of the existing app** — one codebase, same components, CSS-driven layout changes plus touch gestures added to the existing Pixi editor. No separate mobile component tree.

## Detection

Two independent signals used for different things:

- **Layout** is driven purely by the CSS media query `(max-width: 768px)`. One React hook `useIsMobileLayout()` (a `matchMedia` wrapper over the same query) exists only where the component tree must differ (rendering panels as bottom sheets).
- **Touch sizing** is driven per-event by `pointerType === 'touch'`, never by screen size. An iPad with a mouse gets precise targets; a touchscreen laptop gets large ones regardless of window width.

Desktop at ≥769px stays pixel-identical to today.

## Responsive shell

- **Toolbar:** stays a single row but becomes horizontally scrollable with compact buttons at the breakpoint; the "Home Plan" title is hidden. No overflow/hamburger menu — every action remains one tap away.
- **Bottom sheets:** the Catalog and Properties panels are the same components restyled as bottom sheets on mobile.
  - Properties slides up (max ~40% viewport height) whenever something is selected, with a close/deselect affordance.
  - Catalog opens as a taller sheet (~55%) when Furniture is toggled.
  - Only one sheet is visible at a time: opening the catalog wins over a selection sheet (explicit user action); selecting something closes the catalog sheet **and clears `placingFurniture`** (this also fixes the known deferred bug where closing the catalog didn't disarm placement).
  - The canvas stays visible and interactive above the sheet; sheets overlay rather than squeeze, so no canvas refit is needed when they open.
- **Height:** app shell uses `100dvh` so the iOS Safari collapsing address bar doesn't produce dead space or a clipped toolbar.
- **Viewport refit on window resize / orientation change** is added (previously a deferred follow-up).

## 2D editor touch interaction

The canvas gets `touch-action: none` — the app owns all gestures. A new pure module `src/editor2d/gestures.ts` tracks active pointers and classifies the gesture; `Editor2D.tsx` only wires events into it. This keeps the math unit-testable and respects the pure-model architecture rule.

- **One finger on an item/handle/opening:** existing drag/resize/rotate/place interactions unchanged. Hit-test radii roughly double when the event's `pointerType` is `'touch'`: handles 8→16 px, rotation handle 9→18, edge/opening hit 10→20. Rotation always angle-snaps on touch (no Shift key exists).
- **One finger on empty canvas:** pans the viewport (touch only; desktop left-drag behavior is unchanged).
- **Two fingers:** pinch-zoom about the finger midpoint with simultaneous two-finger pan, built on the existing `zoomAt` (zoom limits already clamped 5–400 px/m). If a second finger lands mid-drag of an item, the drag cancels and the item reverts to its drag-start position — the same revert path Escape uses today. This doubles as the touch replacement for Escape-cancel.
- **Double-tap on empty canvas:** re-fits the apartment via the existing `fitApartment`.
- **Placement modes** (door/window/furniture): a tap places at the tap point through the same code path as a click. The hover ghost simply never appears on touch (no hover) — accepted.
- **Non-goal (v1):** Alt-based modifier behavior has no touch equivalent.

## 3D viewer

Verify-only: drei `OrbitControls` already supports one-finger orbit and two-finger pinch/pan. Confirm the canvas resizes correctly on orientation change.

## iOS Safari specifics

- `touch-action: manipulation` on all buttons (removes the double-tap-zoom tap delay).
- `overscroll-behavior: none` on the shell (no rubber-banding under the canvas).
- Number inputs get `inputMode` (numeric keyboard).
- Bottom sheets pad for the home-indicator safe-area inset (`env(safe-area-inset-bottom)`).

## Testing

- **Unit (vitest):** gesture module — pinch math (zoom factor and midpoint anchoring), two-finger pan, gesture classification, mid-drag second-finger cancel; viewport refit on resize.
- **E2E:** playwright-core driving installed Chrome (`channel: 'chrome'`, headless) with iPhone viewport + touch emulation. Screenshot-verified flows: pan/zoom the 2D plan, resize a room by touch, place furniture from the catalog sheet, edit properties in the sheet, orbit/pinch in 3D.
- **Manual:** spot-check on a physical iPhone (Safari) after deploy.

## Error handling

No new error surfaces: gestures never write invalid state to the store (all mutations go through existing store actions, which clamp/round); a cancelled drag reverts via the existing shared revert helper; unknown/extra pointers (3+ fingers) are ignored beyond the first two.
