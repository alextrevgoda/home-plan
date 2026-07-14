# Home Plan

Plan your apartment layout in 2D, view it in 3D.

## Run

    npm install
    npm run dev

## Use

- **Apartment**: with nothing selected, set width/depth/wall height in the right panel (meters).
- **Rooms**: "+ Add room", then drag to move, drag handles to resize. Rooms snap to
  the 0.1 m grid, other rooms' edges, and the apartment boundary — hold **Alt** to
  disable snapping. **Delete** removes the selected room. Overlapping or
  out-of-bounds rooms tint orange as a warning.
- **Doors & windows**: with a room in place, click "+ Door" or "+ Window", then
  click a wall to place the opening (the target wall highlights green). Drag an
  opening to slide it along its wall; edit width/height/sill in the panel.
  Escape cancels placement. Openings cut real gaps in the 3D walls — doors get
  a panel, windows a translucent pane. An opening too wide for its wall, or
  overlapping another opening, tints orange.
- **Furniture & decor**: "Furniture" opens the catalog — pick an item and click to
  place it (blue ghost = valid, red = blocked). Drag to move (snaps flush to
  walls), drag the circle handle to rotate (15° steps, Shift for free angle),
  edit sizes in the panel. Solid items can't be dropped overlapping; rugs and
  wall art layer freely. Wall art attaches to walls — drag along the wall, set
  elevation in the panel.
- **Finishes**: select a room to pick a floor material and wall color; floors
  show a tint in 2D and real textures in 3D.
- **Canvas**: mouse wheel zooms, space-drag or middle-drag pans.
- **3D**: toggle in the toolbar; drag to orbit, wheel to zoom.
- **Persistence**: autosaved to localStorage; Export/Import as JSON in the toolbar.

## Develop

    npm test        # vitest unit + component tests
    npm run build   # typecheck + production build

Design spec: `docs/superpowers/specs/2026-07-13-apartment-planner-design.md`.
