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

export interface Plan {
  version: 2
  id: string
  name: string
  apartment: Apartment
  rooms: Room[]
  openings: Opening[]
}

export interface Selection {
  kind: 'room' | 'opening'
  id: string
}

export type Mode = '2d' | '3d'
