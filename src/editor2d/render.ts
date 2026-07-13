import { Container, Graphics, Text } from 'pixi.js'
import { polygonToRect, rectInBounds, rectsOverlap } from '../model/geometry'
import { openingSpan, openingWarnings, roomEdge } from '../model/openings'
import type { SnapGuide } from '../model/snapping'
import type { Apartment, Plan, Rect, Selection } from '../model/types'
import { handlePositions } from './interactions'
import type { EdgeHit } from './interactions'
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

  const rects = plan.rooms.map((room) => ({ room, rect: polygonToRect(room.polygon) }))

  for (const { room, rect } of rects) {
    if (!rect) continue
    const overlapping = rects.some(
      (other) => other.room.id !== room.id && other.rect && rectsOverlap(rect, other.rect),
    )
    const warning = overlapping || !rectInBounds(rect, plan.apartment)
    const selected = room.id === selectedId

    const tl = worldToScreen(viewport, { x: rect.x, y: rect.y })
    const w = rect.width * viewport.scale
    const h = rect.height * viewport.scale

    const g = new Graphics()
    g.rect(tl.x, tl.y, w, h)
      .fill({ color: warning ? WARNING_COLOR : room.color, alpha: 0.55 })
      .stroke({ width: selected ? 3 : 1.5, color: selected ? 0x1d4ed8 : 0x475069 })
    container.addChild(g)

    const label = new Text({
      text: `${room.name}\n${rect.width.toFixed(2)} × ${rect.height.toFixed(2)}`,
      style: { fontSize: 13, fill: 0x1f2430, align: 'center' },
    })
    label.anchor.set(0.5)
    label.position.set(tl.x + w / 2, tl.y + h / 2)
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
