import type { Size3 } from './types'

export type Category = 'bedroom' | 'living' | 'kitchen' | 'bathroom' | 'decor'
export type Mount = 'floor' | 'wall'
export type Layer = 'solid' | 'underlay' | 'overlay'

export interface CatalogItem {
  id: string
  name: string
  category: Category
  mount: Mount
  layer: Layer
  defaultSize: Size3
  sizeBounds: { min: Size3; max: Size3 }
  defaultElevation?: number
  modelPath: string
  symbolId: string
  recolorMaterial?: string
  modelRotationY?: number
}

export interface FloorFinish {
  id: string
  name: string
  texturePath: string
  tint: string
}

const b = (min: Size3, max: Size3) => ({ min, max })
const s = (width: number, depth: number, height: number): Size3 => ({ width, depth, height })

export const CATALOG: CatalogItem[] = [
  // bedroom
  { id: 'bed-double', name: 'Double bed', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(1.6, 2.0, 0.5), sizeBounds: b(s(1.2, 1.9, 0.35), s(2.0, 2.2, 0.7)), modelPath: 'models/bed-double.glb', symbolId: 'bed-double', recolorMaterial: 'carpet' },
  { id: 'bed-single', name: 'Single bed', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(0.9, 2.0, 0.5), sizeBounds: b(s(0.8, 1.8, 0.35), s(1.2, 2.2, 0.7)), modelPath: 'models/bed-single.glb', symbolId: 'bed-single', recolorMaterial: 'carpet' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(1.5, 0.6, 2.2), sizeBounds: b(s(0.8, 0.5, 1.8), s(3.0, 0.8, 2.6)), modelPath: 'models/wardrobe.glb', symbolId: 'wardrobe' },
  { id: 'nightstand', name: 'Nightstand', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(0.45, 0.4, 0.55), sizeBounds: b(s(0.35, 0.3, 0.4), s(0.6, 0.5, 0.7)), modelPath: 'models/nightstand.glb', symbolId: 'nightstand' },
  { id: 'dresser', name: 'Dresser', category: 'bedroom', mount: 'floor', layer: 'solid', defaultSize: s(1.0, 0.45, 0.8), sizeBounds: b(s(0.6, 0.35, 0.6), s(1.6, 0.6, 1.1)), modelPath: 'models/dresser.glb', symbolId: 'dresser' },
  // living room
  { id: 'sofa-3seat', name: 'Sofa (3-seat)', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(2.2, 0.95, 0.85), sizeBounds: b(s(1.6, 0.8, 0.7), s(2.8, 1.1, 1.0)), modelPath: 'models/sofa-3seat.glb', symbolId: 'sofa', recolorMaterial: 'sofa_02' },
  { id: 'armchair', name: 'Armchair', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(0.85, 0.85, 0.85), sizeBounds: b(s(0.7, 0.7, 0.7), s(1.1, 1.1, 1.0)), modelPath: 'models/armchair.glb', symbolId: 'armchair', recolorMaterial: 'modern_arm_chair_01_pillow' },
  { id: 'coffee-table', name: 'Coffee table', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(1.1, 0.6, 0.45), sizeBounds: b(s(0.6, 0.4, 0.3), s(1.5, 0.9, 0.6)), modelPath: 'models/coffee-table.glb', symbolId: 'coffee-table', modelRotationY: Math.PI / 2 },
  { id: 'tv-stand', name: 'TV stand', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(1.6, 0.4, 0.5), sizeBounds: b(s(1.0, 0.3, 0.4), s(2.4, 0.6, 0.7)), modelPath: 'models/tv-stand.glb', symbolId: 'tv-stand' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'living', mount: 'floor', layer: 'solid', defaultSize: s(0.9, 0.3, 1.9), sizeBounds: b(s(0.6, 0.25, 1.2), s(1.6, 0.45, 2.4)), modelPath: 'models/bookshelf.glb', symbolId: 'bookshelf' },
  // kitchen & dining
  { id: 'dining-table', name: 'Dining table', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(1.6, 0.9, 0.75), sizeBounds: b(s(1.0, 0.7, 0.7), s(2.4, 1.2, 0.8)), modelPath: 'models/dining-table.glb', symbolId: 'dining-table' },
  { id: 'dining-chair', name: 'Dining chair', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(0.45, 0.5, 0.9), sizeBounds: b(s(0.4, 0.4, 0.8), s(0.55, 0.6, 1.1)), modelPath: 'models/dining-chair.glb', symbolId: 'chair' },
  { id: 'kitchen-counter', name: 'Kitchen counter', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(1.8, 0.6, 0.9), sizeBounds: b(s(0.6, 0.55, 0.85), s(3.6, 0.7, 0.95)), modelPath: 'models/kitchen-counter.glb', symbolId: 'counter' },
  { id: 'fridge', name: 'Fridge', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(0.7, 0.7, 1.8), sizeBounds: b(s(0.55, 0.6, 1.4), s(0.95, 0.8, 2.1)), modelPath: 'models/fridge.glb', symbolId: 'fridge' },
  { id: 'washing-machine', name: 'Washing machine', category: 'kitchen', mount: 'floor', layer: 'solid', defaultSize: s(0.6, 0.6, 0.85), sizeBounds: b(s(0.55, 0.55, 0.8), s(0.7, 0.7, 0.9)), modelPath: 'models/washing-machine.glb', symbolId: 'washer' },
  // bathroom
  { id: 'toilet', name: 'Toilet', category: 'bathroom', mount: 'floor', layer: 'solid', defaultSize: s(0.4, 0.65, 0.8), sizeBounds: b(s(0.35, 0.55, 0.7), s(0.5, 0.75, 0.9)), modelPath: 'models/toilet.glb', symbolId: 'toilet' },
  { id: 'sink-vanity', name: 'Sink vanity', category: 'bathroom', mount: 'floor', layer: 'solid', defaultSize: s(0.8, 0.5, 0.85), sizeBounds: b(s(0.5, 0.4, 0.75), s(1.4, 0.6, 0.95)), modelPath: 'models/sink-vanity.glb', symbolId: 'sink' },
  { id: 'bathtub', name: 'Bathtub', category: 'bathroom', mount: 'floor', layer: 'solid', defaultSize: s(1.7, 0.75, 0.6), sizeBounds: b(s(1.4, 0.7, 0.5), s(1.9, 0.9, 0.65)), modelPath: 'models/bathtub.glb', symbolId: 'bathtub' },
  { id: 'shower', name: 'Shower stall', category: 'bathroom', mount: 'floor', layer: 'solid', defaultSize: s(0.9, 0.9, 2.0), sizeBounds: b(s(0.75, 0.75, 1.9), s(1.2, 1.2, 2.2)), modelPath: 'models/shower.glb', symbolId: 'shower' },
  // decor
  { id: 'rug-rect', name: 'Rug', category: 'decor', mount: 'floor', layer: 'underlay', defaultSize: s(2.0, 1.4, 0.01), sizeBounds: b(s(0.8, 0.5, 0.01), s(4.0, 3.0, 0.02)), modelPath: 'models/rug-rect.glb', symbolId: 'rug', recolorMaterial: 'carpet' },
  { id: 'plant-potted', name: 'Potted plant', category: 'decor', mount: 'floor', layer: 'solid', defaultSize: s(0.4, 0.4, 1.2), sizeBounds: b(s(0.25, 0.25, 0.5), s(0.7, 0.7, 2.0)), modelPath: 'models/plant-potted.glb', symbolId: 'plant' },
  { id: 'floor-lamp', name: 'Floor lamp', category: 'decor', mount: 'floor', layer: 'solid', defaultSize: s(0.35, 0.35, 1.6), sizeBounds: b(s(0.25, 0.25, 1.2), s(0.5, 0.5, 1.9)), modelPath: 'models/floor-lamp.glb', symbolId: 'floor-lamp' },
  { id: 'wall-art', name: 'Wall art', category: 'decor', mount: 'wall', layer: 'overlay', defaultSize: s(0.8, 0.05, 0.6), sizeBounds: b(s(0.3, 0.02, 0.2), s(1.6, 0.08, 1.2)), defaultElevation: 1.4, modelPath: 'models/wall-art.glb', symbolId: 'wall-art' },
  // 'wall-shelf' removed: no acceptable CC0 model found (available libraries only had floor-standing
  // shelving units, not thin wall-mounted shelves matching this item's proportions) — see task-11-report.md.
]

const byId = new Map(CATALOG.map((c) => [c.id, c]))
export const catalogItem = (id: string): CatalogItem | undefined => byId.get(id)

export const FLOOR_MATERIALS: FloorFinish[] = [
  { id: 'oak', name: 'Oak', texturePath: 'textures/floors/oak.jpg', tint: '#c8a06a' },
  { id: 'walnut', name: 'Walnut', texturePath: 'textures/floors/walnut.jpg', tint: '#8a5f3e' },
  { id: 'tile-light', name: 'Light tile', texturePath: 'textures/floors/tile-light.jpg', tint: '#d9d9d2' },
  { id: 'tile-dark', name: 'Dark tile', texturePath: 'textures/floors/tile-dark.jpg', tint: '#6d6d68' },
  { id: 'carpet', name: 'Carpet', texturePath: 'textures/floors/carpet.jpg', tint: '#b9b3a6' },
  { id: 'concrete', name: 'Concrete', texturePath: 'textures/floors/concrete.jpg', tint: '#a3a3a0' },
]

const finishById = new Map(FLOOR_MATERIALS.map((m) => [m.id, m]))
export const floorFinish = (id: string): FloorFinish | undefined => finishById.get(id)
