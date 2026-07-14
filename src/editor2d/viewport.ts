import type { Apartment, Vec2 } from '../model/types'

export interface Viewport {
  offsetX: number
  offsetY: number
  scale: number
}

export function worldToScreen(v: Viewport, p: Vec2): Vec2 {
  return { x: p.x * v.scale + v.offsetX, y: p.y * v.scale + v.offsetY }
}

export function screenToWorld(v: Viewport, p: Vec2): Vec2 {
  return { x: (p.x - v.offsetX) / v.scale, y: (p.y - v.offsetY) / v.scale }
}

export function zoomAt(v: Viewport, screenPoint: Vec2, factor: number, min = 5, max = 400): Viewport {
  const scale = Math.min(max, Math.max(min, v.scale * factor))
  const k = scale / v.scale
  return {
    scale,
    offsetX: screenPoint.x - (screenPoint.x - v.offsetX) * k,
    offsetY: screenPoint.y - (screenPoint.y - v.offsetY) * k,
  }
}

export function fitApartment(
  canvasWidth: number,
  canvasHeight: number,
  apartment: Apartment,
  padding = 60,
): Viewport {
  const scale = Math.min(
    (canvasWidth - padding * 2) / apartment.width,
    (canvasHeight - padding * 2) / apartment.depth,
  )
  return {
    scale,
    offsetX: (canvasWidth - apartment.width * scale) / 2,
    offsetY: (canvasHeight - apartment.depth * scale) / 2,
  }
}

export interface CanvasSize {
  width: number
  height: number
}

export function recenterViewport(v: Viewport, oldSize: CanvasSize, newSize: CanvasSize): Viewport {
  return {
    ...v,
    offsetX: v.offsetX + (newSize.width - oldSize.width) / 2,
    offsetY: v.offsetY + (newSize.height - oldSize.height) / 2,
  }
}
