import { useState } from 'react'
import { CATALOG, type CatalogItem, type Category } from '../model/catalog'
import { symbolPaths } from '../editor2d/symbols'
import { usePlanStore } from '../store/planStore'

const CATEGORIES: Array<[Category, string]> = [
  ['bedroom', 'Bedroom'],
  ['living', 'Living'],
  ['kitchen', 'Kitchen'],
  ['bathroom', 'Bathroom'],
  ['decor', 'Decor'],
]

function SymbolIcon({ item }: { item: CatalogItem }) {
  const scale = 36 / Math.max(item.defaultSize.width, item.defaultSize.depth)
  const w = item.defaultSize.width * scale
  const h = item.defaultSize.depth * scale
  const cmds = symbolPaths(item.symbolId, w, h) ?? []
  return (
    <svg viewBox="-22 -22 44 44" width={44} height={44} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth={1.4}>
        {cmds.map((c, i) =>
          c.kind === 'rect' ? (
            <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} />
          ) : c.kind === 'line' ? (
            <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} />
          ) : (
            <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />
          ),
        )}
      </g>
    </svg>
  )
}

export function CatalogPanel() {
  const [category, setCategory] = useState<Category>('bedroom')
  const placingFurniture = usePlanStore((s) => s.placingFurniture)
  const setPlacingFurniture = usePlanStore((s) => s.setPlacingFurniture)
  const setCatalogOpen = usePlanStore((s) => s.setCatalogOpen)

  return (
    <aside className="catalog">
      <button className="sheet-close mobile-only" aria-label="Close catalog" onClick={() => setCatalogOpen(false)}>
        ✕
      </button>
      <div className="catalog-tabs" role="tablist">
        {CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={category === id}
            className={category === id ? 'active' : ''}
            onClick={() => setCategory(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="catalog-items">
        {CATALOG.filter((c) => c.category === category).map((item) => (
          <button
            key={item.id}
            className={placingFurniture === item.id ? 'active' : ''}
            onClick={() => setPlacingFurniture(placingFurniture === item.id ? null : item.id)}
          >
            <SymbolIcon item={item} />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
