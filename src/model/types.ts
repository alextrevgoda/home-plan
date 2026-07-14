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
  floorMaterial?: string
  wallColor?: string
}

export type OpeningKind = 'door' | 'window'

export interface Opening {
  id: string
  kind: OpeningKind
  roomId: string
  edgeIndex: number // edge = polygon[edgeIndex] → polygon[(edgeIndex + 1) % n]
  offset: number // meters from edge start to opening CENTER
  width: number
  height: number
  sillHeight: number // doors: always 0
}

export interface Size3 {
  width: number
  depth: number
  height: number
}

export interface FloorItem {
  id: string
  catalogId: string
  mount: 'floor'
  position: Vec2
  rotation: number
  size: Size3
  color?: string
}

export interface WallItem {
  id: string
  catalogId: string
  mount: 'wall'
  roomId: string
  edgeIndex: number
  offset: number
  elevation: number
  size: Size3
  color?: string
}

export type PlacedItem = FloorItem | WallItem

export interface Plan {
  version: 3
  id: string
  name: string
  apartment: Apartment
  rooms: Room[]
  openings: Opening[]
  furniture: PlacedItem[]
}

export interface Selection {
  kind: 'room' | 'opening' | 'furniture'
  id: string
}

export type Mode = '2d' | '3d'
