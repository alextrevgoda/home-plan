import { Container, Graphics, Text } from 'pixi.js'
import { catalogItem, floorFinish } from '../model/catalog'
import { polygonArea, rectInBounds, rectsOverlap } from '../model/geometry'
import { collidingFurnitureIds, wallItemSpan } from '../model/furniture'
import { openingSpan, openingWarnings, roomEdge } from '../model/openings'
import { polygonBounds, polygonCentroid } from '../model/polygon'
import type { SnapGuide } from '../model/snapping'
import type { Apartment, FloorItem, PlacedItem, Plan, Rect, Selection, Vec2 } from '../model/types'
import { handlePositions, rotationHandleScreen } from './interactions'
import type { EdgeHit } from './interactions'
import { symbolPaths, type SymbolCmd } from './symbols'
import { screenToWorld, worldToScreen, type Viewport } from './viewport'

const isMajor = (v: number) => Math.abs(v - Math.round(v)) < 1e-6

export function drawGrid(g: Graphics, viewport: Viewport, screenW: number, screenH: number) {
  g.clear()
  const topLeft = screenToWorld(viewport, { x: 0, y: 0 })
  const bottomRight = screenToWorld(viewport, { x: screenW, y: screenH })

  // minor lines every 0.1 m, hidden when zoomed out
  if (viewport.scale > 40) {
    const step = 0.1
    for (let x = Math.floor(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
      if (isMajor(x)) continue
      const sx = worldToScreen(viewport, { x, y: 0 }).x
      g.moveTo(sx, 0).lineTo(sx, screenH)
    }
    for (let y = Math.floor(topLeft.y / step) * step; y <= bottomRight.y; y += step) {
      if (isMajor(y)) continue
      const sy = worldToScreen(viewport, { x: 0, y }).y
      g.moveTo(0, sy).lineTo(screenW, sy)
    }
    g.stroke({ width: 1, color: 0xe8eaee })
  }

  // major lines every 1 m
  for (let x = Math.floor(topLeft.x); x <= bottomRight.x; x += 1) {
    const sx = worldToScreen(viewport, { x, y: 0 }).x
    g.moveTo(sx, 0).lineTo(sx, screenH)
  }
  for (let y = Math.floor(topLeft.y); y <= bottomRight.y; y += 1) {
    const sy = worldToScreen(viewport, { x: 0, y }).y
    g.moveTo(0, sy).lineTo(screenW, sy)
  }
  g.stroke({ width: 1, color: 0xd0d4d9 })
}

export function drawBoundary(g: Graphics, viewport: Viewport, apartment: Apartment) {
  g.clear()
  const tl = worldToScreen(viewport, { x: 0, y: 0 })
  g.rect(tl.x, tl.y, apartment.width * viewport.scale, apartment.depth * viewport.scale).stroke({
    width: 3,
    color: 0x2b2f36,
  })
}

const WARNING_COLOR = '#e07a5f'

export function drawRooms(container: Container, plan: Plan, selectedId: string | null, viewport: Viewport) {
  for (const child of container.removeChildren()) child.destroy(true)

  const entries = plan.rooms.map((room) => ({ room, bounds: polygonBounds(room.polygon) }))

  for (const { room, bounds } of entries) {
    const overlapping = entries.some(
      (other) => other.room.id !== room.id && rectsOverlap(bounds, other.bounds),
    )
    const warning = overlapping || !rectInBounds(bounds, plan.apartment)
    const selected = room.id === selectedId

    const pts = room.polygon.flatMap((p) => {
      const s = worldToScreen(viewport, p)
      return [s.x, s.y]
    })

    const g = new Graphics()
    g.poly(pts)
      .fill({ color: warning ? WARNING_COLOR : room.color, alpha: 0.55 })
      .stroke({ width: selected ? 3 : 1.5, color: selected ? 0x1d4ed8 : 0x475069 })
    container.addChild(g)

    const finish = room.floorMaterial ? floorFinish(room.floorMaterial) : undefined
    if (finish) {
      const tintG = new Graphics()
      tintG.poly(pts).fill({ color: finish.tint, alpha: 0.35 })
      container.addChild(tintG)
    }

    const c = worldToScreen(viewport, polygonCentroid(room.polygon))
    const label = new Text({
      text: `${room.name}\n${polygonArea(room.polygon).toFixed(1)} m²`,
      style: { fontSize: 13, fill: 0x1f2430, align: 'center' },
    })
    label.anchor.set(0.5)
    label.position.set(c.x, c.y)
    container.addChild(label)
  }
}

export function drawHandles(g: Graphics, rect: Rect | null, viewport: Viewport) {
  g.clear()
  if (!rect) return
  for (const pos of Object.values(handlePositions(rect))) {
    const s = worldToScreen(viewport, pos)
    g.rect(s.x - 4, s.y - 4, 8, 8).fill({ color: 0xffffff }).stroke({ width: 1.5, color: 0x1d4ed8 })
  }
}

export function drawGuides(
  g: Graphics,
  guides: SnapGuide[],
  viewport: Viewport,
  screenW: number,
  screenH: number,
) {
  g.clear()
  if (guides.length === 0) return
  for (const guide of guides) {
    if (guide.axis === 'x') {
      const sx = worldToScreen(viewport, { x: guide.position, y: 0 }).x
      g.moveTo(sx, 0).lineTo(sx, screenH)
    } else {
      const sy = worldToScreen(viewport, { x: 0, y: guide.position }).y
      g.moveTo(0, sy).lineTo(screenW, sy)
    }
  }
  g.stroke({ width: 1.5, color: 0xd946ef })
}

const GAP_COLOR = 0xf7f8fa // canvas background — paints the wall gap
const OPENING_COLOR = 0x475069
const OPENING_SELECTED = 0x1d4ed8
const OPENING_WARNING = 0xe07a5f

export function drawOpenings(g: Graphics, plan: Plan, selection: Selection | null, viewport: Viewport) {
  g.clear()
  const warnings = openingWarnings(plan)
  for (const opening of plan.openings) {
    const room = plan.rooms.find((r) => r.id === opening.roomId)
    if (!room) continue
    const span = openingSpan(opening, room)
    if (!span) continue
    const a = worldToScreen(viewport, span.a)
    const b = worldToScreen(viewport, span.b)

    // 1. gap: paint over the wall line
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 7, color: GAP_COLOR })

    const selected = selection?.kind === 'opening' && selection.id === opening.id
    const color = selected ? OPENING_SELECTED : warnings.has(opening.id) ? OPENING_WARNING : OPENING_COLOR

    // unit perpendicular in screen space
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len
    const py = dx / len

    // 2. jamb ticks at both ends
    const tick = 6
    g.moveTo(a.x - px * tick, a.y - py * tick).lineTo(a.x + px * tick, a.y + py * tick)
    g.moveTo(b.x - px * tick, b.y - py * tick).lineTo(b.x + px * tick, b.y + py * tick)

    // 3. symbol
    if (opening.kind === 'door') {
      // door leaf: single thin line across the gap
      g.moveTo(a.x, a.y).lineTo(b.x, b.y)
    } else {
      // window: double parallel lines
      const off = 2
      g.moveTo(a.x + px * off, a.y + py * off).lineTo(b.x + px * off, b.y + py * off)
      g.moveTo(a.x - px * off, a.y - py * off).lineTo(b.x - px * off, b.y - py * off)
    }
    g.stroke({ width: selected ? 2.5 : 1.5, color })
  }
}

export function drawEdgeHighlight(g: Graphics, hit: EdgeHit | null, plan: Plan, viewport: Viewport) {
  g.clear()
  if (!hit) return
  const room = plan.rooms.find((r) => r.id === hit.roomId)
  const edge = room ? roomEdge(room, hit.edgeIndex) : null
  if (!edge) return
  const a = worldToScreen(viewport, edge.a)
  const b = worldToScreen(viewport, edge.b)
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 5, color: 0x22c55e, alpha: 0.6 })
}

export function paintSymbol(g: Graphics, cmds: SymbolCmd[]) {
  for (const c of cmds) {
    if (c.kind === 'rect') g.rect(c.x, c.y, c.w, c.h)
    else if (c.kind === 'line') g.moveTo(c.x1, c.y1).lineTo(c.x2, c.y2)
    else g.circle(c.cx, c.cy, c.r)
  }
}

const FURNITURE_COLOR = 0x39414f
const FURNITURE_SELECTED = 0x1d4ed8
const FURNITURE_WARNING = 0xe07a5f

export function drawFurniture(container: Container, plan: Plan, selection: Selection | null, viewport: Viewport) {
  for (const child of container.removeChildren()) child.destroy(true)
  const colliding = collidingFurnitureIds(plan)
  const layerRank = (item: PlacedItem) => {
    if (item.mount === 'wall') return 2
    return catalogItem(item.catalogId)?.layer === 'underlay' ? 0 : 1
  }
  const ordered = [...plan.furniture].sort((a, b) => layerRank(a) - layerRank(b))

  for (const item of ordered) {
    const cat = catalogItem(item.catalogId)
    if (!cat) continue
    const selected = selection?.kind === 'furniture' && selection.id === item.id
    const color = selected ? FURNITURE_SELECTED : colliding.has(item.id) ? FURNITURE_WARNING : FURNITURE_COLOR
    const g = new Graphics()

    if (item.mount === 'floor') {
      const w = item.size.width * viewport.scale
      const h = item.size.depth * viewport.scale
      const cmds = symbolPaths(cat.symbolId, w, h)
      if (!cmds) continue
      if (cat.layer === 'underlay') g.rect(-w / 2, -h / 2, w, h).fill({ color: 0xd8cfc0, alpha: 0.5 })
      if (selected) g.rect(-w / 2, -h / 2, w, h).fill({ color, alpha: 0.08 })
      paintSymbol(g, cmds)
      g.stroke({ width: selected ? 2.5 : 1.5, color })
      const s = worldToScreen(viewport, item.position)
      g.position.set(s.x, s.y)
      g.rotation = (item.rotation * Math.PI) / 180
    } else {
      const room = plan.rooms.find((r) => r.id === item.roomId)
      const span = room ? wallItemSpan(item, room) : null
      if (!span) continue
      const a = worldToScreen(viewport, span.a)
      const b = worldToScreen(viewport, span.b)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const px = -dy / len
      const py = dx / len
      const off = 5 // draw just inside the room
      g.moveTo(a.x + px * off, a.y + py * off).lineTo(b.x + px * off, b.y + py * off)
      g.moveTo(a.x + px * 2, a.y + py * 2).lineTo(a.x + px * (off + 3), a.y + py * (off + 3))
      g.moveTo(b.x + px * 2, b.y + py * 2).lineTo(b.x + px * (off + 3), b.y + py * (off + 3))
      g.stroke({ width: selected ? 3 : 2, color })
    }
    container.addChild(g)
  }
}

export interface FurnitureGhost {
  catalogId: string
  position: Vec2
  rotation: number
  valid: boolean
}

const GHOST_VALID = 0x1d4ed8
const GHOST_INVALID = 0xe07a5f

export function drawFurnitureGhost(g: Graphics, ghost: FurnitureGhost | null, viewport: Viewport) {
  g.clear()
  g.rotation = 0
  g.position.set(0, 0)
  if (!ghost) return
  const cat = catalogItem(ghost.catalogId)
  if (!cat) return
  const w = cat.defaultSize.width * viewport.scale
  const h = cat.defaultSize.depth * viewport.scale
  const cmds = symbolPaths(cat.symbolId, w, h)
  if (!cmds) return
  const color = ghost.valid ? GHOST_VALID : GHOST_INVALID
  const s = worldToScreen(viewport, ghost.position)
  g.position.set(s.x, s.y)
  g.rotation = (ghost.rotation * Math.PI) / 180
  g.rect(-w / 2, -h / 2, w, h).fill({ color, alpha: 0.12 })
  paintSymbol(g, cmds)
  g.stroke({ width: 1.5, color, alpha: 0.8 })
}

export function drawRotationHandle(g: Graphics, item: FloorItem | null, viewport: Viewport) {
  g.clear()
  if (!item) return
  const t = (item.rotation * Math.PI) / 180
  const dir = { x: Math.sin(t), y: -Math.cos(t) }
  const top = worldToScreen(viewport, {
    x: item.position.x + dir.x * (item.size.depth / 2),
    y: item.position.y + dir.y * (item.size.depth / 2),
  })
  const p = rotationHandleScreen(item, viewport)
  g.moveTo(top.x, top.y).lineTo(p.x, p.y).stroke({ width: 1.5, color: 0x1d4ed8 })
  g.circle(p.x, p.y, 6).fill({ color: 0xffffff }).stroke({ width: 1.5, color: 0x1d4ed8 })
}
