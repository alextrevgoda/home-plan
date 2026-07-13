import { Graphics } from 'pixi.js'
import type { Apartment } from '../model/types'
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
