# Asset credits

All assets below are licensed **CC0 (public domain)**. No attribution is legally
required, but sources and authors are recorded here for provenance.

## 3D models

| Catalog id | Source model | Source | Author | License |
| --- | --- | --- | --- | --- |
| bed-double | Bed Double | Kenney "Furniture Kit" (kenney.nl/assets/furniture-kit) | Kenney (kenney.nl) | CC0 |
| bed-single | Bed Single | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| wardrobe | Vintage Cabinet 01 | Poly Haven (polyhaven.com/a/vintage_cabinet_01) | Rico Cilliers | CC0 |
| nightstand | Cabinet Bed Drawer | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| dresser | Side Table Drawers | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| sofa-3seat | Lounge Sofa | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| armchair | Lounge Chair | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| coffee-table | Table Coffee | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| tv-stand | Cabinet Television | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| bookshelf | Bookcase Open | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| dining-table | Table | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| dining-chair | Chair | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| kitchen-counter | Kitchen Cabinet | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| fridge | Kitchen Fridge Large | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| washing-machine | Washer | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| toilet | Toilet | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| sink-vanity | Bathroom Sink | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| bathtub | Bathtub | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| shower | Shower | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| rug-rect | Rug Rectangle | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| plant-potted | Potted Plant | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| floor-lamp | Lamp Round Floor | Kenney "Furniture Kit" | Kenney (kenney.nl) | CC0 |
| wall-art | Hanging Picture Frame 01 | Poly Haven (polyhaven.com/a/hanging_picture_frame_01) | James Ray Cock | CC0 |

**Removed catalog entry:** `wall-shelf` — no acceptable CC0 model was found. Poly Haven's
and the bundled Kenney kit's "shelf"/"shelving" models are all floor-standing units
(0.9–2.4 m tall bookcases/cabinets), not thin wall-mounted shelf planks matching this
item's proportions (`defaultSize` 0.8 × 0.25 × 0.05 m). Shipping one of those as a
placeholder would look wrong at any stretch, so the entry was removed from
`src/model/catalog.ts` per the task's sourcing rules. Its 2D symbol definition in
`src/editor2d/symbols.ts` (`'wall-shelf'`) was left in place since it is unused and
harmless.

Kenney's "Furniture Kit" (https://kenney.nl/assets/furniture-kit) is a single CC0 pack
covering 21 of the items above — its bundled `License.txt` states:

> License: (Creative Commons Zero, CC0)
> http://creativecommons.org/publicdomain/zero/1.0/
> This content is free to use in personal, educational and commercial projects.

Poly Haven publishes all of its assets under CC0 — see https://polyhaven.com/license.

## Floor textures

| Finish id | Source texture | Source | Author | License |
| --- | --- | --- | --- | --- |
| oak | Laminate Floor 02 | Poly Haven (polyhaven.com/a/laminate_floor_02) | Poly Haven | CC0 |
| walnut | Wood Floor | Poly Haven (polyhaven.com/a/wood_floor) | Poly Haven | CC0 |
| tile-light | Interior Tiles | Poly Haven (polyhaven.com/a/interior_tiles) | Poly Haven | CC0 |
| tile-dark | Worn Tile Floor | Poly Haven (polyhaven.com/a/worn_tile_floor) | Poly Haven | CC0 |
| carpet | Dirty Carpet | Poly Haven (polyhaven.com/a/dirty_carpet) | Poly Haven | CC0 |
| concrete | Scuffed Cement | Poly Haven (polyhaven.com/a/scuffed_cement) | Poly Haven | CC0 |

All floor textures were downloaded as the 1k JPEG diffuse map and re-encoded with
`sips -Z 1024` at reduced JPEG quality to fit under the 300 KB budget (Poly Haven's
authorship metadata for texture assets does not list an individual author name;
Poly Haven itself is the credited source per its site convention).

## Decoders

`public/basis/basis_transcoder.js` and `.wasm` are copied verbatim from
`node_modules/three/examples/jsm/libs/basis/` (three.js, MIT license), used by
`KTX2Loader` for future KTX2-compressed textures.
