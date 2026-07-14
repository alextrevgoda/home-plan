import { Shape } from 'three'
import type { Vec2 } from '../model/types'

// Shape lives in the XY plane; the floor mesh is rotated -90° about X, which maps
// shape (x, y) to world (x, 0, -y) — so plan y must be negated to land on world +z.
export function floorShape(polygon: Vec2[]): Shape {
  const shape = new Shape()
  shape.moveTo(polygon[0].x, -polygon[0].y)
  for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i].x, -polygon[i].y)
  shape.closePath()
  return shape
}
