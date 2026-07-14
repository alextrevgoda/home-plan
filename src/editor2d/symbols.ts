export type SymbolCmd =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }

const rect = (x: number, y: number, w: number, h: number): SymbolCmd => ({ kind: 'rect', x, y, w, h })
const line = (x1: number, y1: number, x2: number, y2: number): SymbolCmd => ({ kind: 'line', x1, y1, x2, y2 })
const circle = (cx: number, cy: number, r: number): SymbolCmd => ({ kind: 'circle', cx, cy, r })
const box = (w: number, h: number) => rect(-w / 2, -h / 2, w, h)

type SymbolFn = (w: number, h: number) => SymbolCmd[]

// back (wall side) at −h/2, front at +h/2
const SYMBOLS: Record<string, SymbolFn> = {
  'bed-double': (w, h) => [
    box(w, h),
    rect(-w * 0.42, -h * 0.45, w * 0.36, h * 0.18), // pillows at the headboard
    rect(w * 0.06, -h * 0.45, w * 0.36, h * 0.18),
    line(-w / 2, -h * 0.15, w / 2, -h * 0.15), // blanket fold
  ],
  'bed-single': (w, h) => [
    box(w, h),
    rect(-w * 0.35, -h * 0.45, w * 0.7, h * 0.18),
    line(-w / 2, -h * 0.15, w / 2, -h * 0.15),
  ],
  wardrobe: (w, h) => [box(w, h), line(-w / 2, 0, w / 2, 0), line(0, -h / 4, 0, h / 4)],
  nightstand: (w, h) => [box(w, h), circle(0, 0, Math.min(w, h) * 0.15)],
  dresser: (w, h) => [box(w, h), circle(-w * 0.2, 0, Math.min(w, h) * 0.08), circle(w * 0.2, 0, Math.min(w, h) * 0.08)],
  sofa: (w, h) => [
    box(w, h),
    rect(-w / 2, -h / 2, w, h * 0.22), // back rest
    rect(-w / 2, -h / 2, w * 0.12, h), // arms
    rect(w / 2 - w * 0.12, -h / 2, w * 0.12, h),
    line(0, -h / 2 + h * 0.22, 0, h / 2), // cushion split
  ],
  armchair: (w, h) => [
    box(w, h),
    rect(-w / 2, -h / 2, w, h * 0.22),
    rect(-w / 2, -h / 2, w * 0.15, h),
    rect(w / 2 - w * 0.15, -h / 2, w * 0.15, h),
  ],
  'coffee-table': (w, h) => [box(w, h), rect(-w * 0.4, -h * 0.35, w * 0.8, h * 0.7)],
  'tv-stand': (w, h) => [box(w, h), rect(-w * 0.35, -h * 0.2, w * 0.7, h * 0.25)],
  bookshelf: (w, h) => [box(w, h), line(-w / 6, -h / 2, -w / 6, h / 2), line(w / 6, -h / 2, w / 6, h / 2)],
  'dining-table': (w, h) => [box(w, h), rect(-w * 0.42, -h * 0.38, w * 0.84, h * 0.76)],
  chair: (w, h) => [box(w, h), rect(-w / 2, -h / 2, w, h * 0.18)],
  counter: (w, h) => [box(w, h), line(-w / 2, -h / 2 + h * 0.25, w / 2, -h / 2 + h * 0.25)],
  fridge: (w, h) => [box(w, h), line(-w / 2, h * 0.3, w / 2, h * 0.3)],
  washer: (w, h) => [box(w, h), circle(0, 0, Math.min(w, h) * 0.32)],
  toilet: (w, h) => [rect(-w / 2, -h / 2, w, h * 0.3), circle(0, h * 0.15, Math.min(w, h * 0.7) * 0.42)],
  sink: (w, h) => [box(w, h), circle(0, 0, Math.min(w, h) * 0.28), circle(0, -h * 0.3, Math.min(w, h) * 0.06)],
  bathtub: (w, h) => [box(w, h), rect(-w * 0.42, -h * 0.32, w * 0.84, h * 0.64), circle(-w * 0.32, 0, Math.min(w, h) * 0.08)],
  shower: (w, h) => [box(w, h), line(-w / 2, -h / 2, w / 2, h / 2), line(-w / 2, h / 2, w / 2, -h / 2)],
  rug: (w, h) => [box(w, h), rect(-w * 0.42, -h * 0.42, w * 0.84, h * 0.84)],
  plant: (w, h) => [
    circle(0, 0, Math.min(w, h) * 0.48),
    line(0, 0, 0, -h * 0.4), line(0, 0, w * 0.34, h * 0.2), line(0, 0, -w * 0.34, h * 0.2),
  ],
  'floor-lamp': (w, h) => [
    circle(0, 0, Math.min(w, h) * 0.48),
    line(-w * 0.3, -h * 0.3, w * 0.3, h * 0.3), line(-w * 0.3, h * 0.3, w * 0.3, -h * 0.3),
  ],
  'wall-art': (w, h) => [box(w, h), rect(-w * 0.4, -h * 0.3, w * 0.8, h * 0.6)],
}

export const SYMBOL_IDS = Object.keys(SYMBOLS)

export function symbolPaths(symbolId: string, w: number, h: number): SymbolCmd[] | null {
  const fn = SYMBOLS[symbolId]
  return fn ? fn(w, h) : null
}
