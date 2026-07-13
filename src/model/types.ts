export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Apartment {
  width: number
  depth: number
  wallHeight: number
}

export interface Room {
  id: string
  name: string
  polygon: Vec2[]
  color: string
}

export interface Plan {
  version: 1
  id: string
  name: string
  apartment: Apartment
  rooms: Room[]
}

export type Mode = '2d' | '3d'
