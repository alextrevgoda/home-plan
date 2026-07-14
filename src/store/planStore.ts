import { create } from 'zustand'
import { catalogItem, floorFinish } from '../model/catalog'
import { clampFloorItemPosition, floorItemCollides, floorItemInBounds } from '../model/furniture'
import { MIN_ROOM_SIZE, normalizeRoundDeg, polygonArea, rectToPolygon, roundCm } from '../model/geometry'
import { clampOffset, MIN_OPENING_WIDTH, OPENING_DEFAULTS, roomEdge } from '../model/openings'
import {
  mergeRoomCollinear as mergeRoomCollinearOp,
  moveRoomVertex as moveRoomVertexOp,
  pushRoomEdge as pushRoomEdgeOp,
  splitRoomEdge as splitRoomEdgeOp,
  translateRoom,
} from '../model/polygon'
import { createDefaultPlan } from '../model/serialization'
import type {
  Apartment, FloorItem, Mode, Opening, OpeningKind, PlacedItem, Plan, Rect, Selection, Size3, Vec2, WallItem,
} from '../model/types'

const HEX = /^#[0-9a-fA-F]{6}$/

const ROOM_COLORS = ['#8ecae6', '#ffb703', '#90be6d', '#f4a7b9', '#bdb2ff', '#f9c74f']

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export type Placement =
  | { mount: 'floor'; position: Vec2; rotation: number }
  | { mount: 'wall'; roomId: string; edgeIndex: number; offset: number }

export interface PlanState {
  plan: Plan
  selection: Selection | null
  mode: Mode
  setMode: (mode: Mode) => void
  selectRoom: (id: string | null) => void
  selectOpening: (id: string) => void
  setApartment: (patch: Partial<Apartment>) => void
  addRoom: () => string
  updateRoomRect: (id: string, rect: Rect) => void
  moveRoom: (id: string, delta: Vec2) => void
  pushRoomEdge: (id: string, edgeIndex: number, coordinate: number) => void
  splitRoomEdge: (id: string, edgeIndex: number, t: number) => void
  moveRoomVertex: (id: string, vertexIndex: number, point: Vec2) => void
  mergeRoomCollinear: (id: string) => void
  renameRoom: (id: string, name: string) => void
  setRoomColor: (id: string, color: string) => void
  deleteRoom: (id: string) => void
  loadPlan: (plan: Plan) => void
  placing: OpeningKind | null
  setPlacing: (kind: OpeningKind | null) => void
  addOpening: (kind: OpeningKind, roomId: string, edgeIndex: number, offset: number) => string
  moveOpening: (id: string, offset: number) => void
  updateOpening: (
    id: string,
    patch: Partial<Pick<Opening, 'width' | 'height' | 'sillHeight' | 'offset'>>,
  ) => void
  deleteOpening: (id: string) => void
  placingFurniture: string | null
  catalogOpen: boolean
  setCatalogOpen: (open: boolean) => void
  setPlacingFurniture: (catalogId: string | null) => void
  apartmentPropsOpen: boolean
  setApartmentPropsOpen: (open: boolean) => void
  selectFurniture: (id: string) => void
  placeFurniture: (catalogId: string, placement: Placement) => string
  moveFloorItem: (id: string, position: Vec2, rotation?: number) => void
  moveWallItem: (id: string, roomId: string, edgeIndex: number, offset: number) => void
  updateWallItem: (id: string, patch: Partial<Pick<WallItem, 'offset' | 'elevation'>>) => void
  rotateFurniture: (id: string, rotation: number) => void
  resizeFurniture: (id: string, patch: Partial<Size3>) => void
  recolorFurniture: (id: string, color: string | undefined) => void
  deleteFurniture: (id: string) => void
  setRoomFloorMaterial: (roomId: string, materialId: string | undefined) => void
  setRoomWallColor: (roomId: string, color: string | undefined) => void
}

export const usePlanStore = create<PlanState>((set) => ({
  plan: createDefaultPlan(),
  selection: null,
  mode: '2d',
  placing: null,

  setMode: (mode) => set({ mode }),

  selectRoom: (id) => set({ selection: id ? { kind: 'room', id } : null }),

  selectOpening: (id) => set({ selection: { kind: 'opening', id } }),

  setApartment: (patch) =>
    set((s) => {
      if (patch.width !== undefined && !Number.isFinite(patch.width)) return s
      if (patch.depth !== undefined && !Number.isFinite(patch.depth)) return s
      if (patch.wallHeight !== undefined && !Number.isFinite(patch.wallHeight)) return s
      const a = { ...s.plan.apartment, ...patch }
      const apartment: Apartment = {
        width: roundCm(clamp(a.width, 1, 100)),
        depth: roundCm(clamp(a.depth, 1, 100)),
        wallHeight: roundCm(clamp(a.wallHeight, 2, 5)),
      }
      const furniture = s.plan.furniture.map((f) =>
        f.mount === 'floor'
          ? { ...f, position: clampFloorItemPosition(f.position, f.rotation, f.size, apartment) }
          : {
              ...f,
              elevation: roundCm(clamp(f.elevation, 0, Math.max(0, apartment.wallHeight - f.size.height))),
            },
      )
      return { plan: { ...s.plan, apartment, furniture } }
    }),

  addRoom: () => {
    const id = crypto.randomUUID()
    set((s) => {
      const { width, depth } = s.plan.apartment
      const rect: Rect = {
        x: roundCm(width / 2 - 1.5),
        y: roundCm(depth / 2 - 1.5),
        width: 3,
        height: 3,
      }
      const room = {
        id,
        name: `Room ${s.plan.rooms.length + 1}`,
        polygon: rectToPolygon(rect),
        color: ROOM_COLORS[s.plan.rooms.length % ROOM_COLORS.length],
      }
      return { plan: { ...s.plan, rooms: [...s.plan.rooms, room] }, selection: { kind: 'room', id } }
    })
    return id
  },

  updateRoomRect: (id, rect) =>
    set((s) => {
      if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
        return s
      }
      const clamped: Rect = {
        x: roundCm(rect.x),
        y: roundCm(rect.y),
        width: roundCm(Math.max(MIN_ROOM_SIZE, rect.width)),
        height: roundCm(Math.max(MIN_ROOM_SIZE, rect.height)),
      }
      const polygon = rectToPolygon(clamped)
      if (!(polygonArea(polygon) > 0)) return s
      const room = s.plan.rooms.find((r) => r.id === id)
      if (!room) return s
      const nextRoom = { ...room, polygon }
      const openings = s.plan.openings.map((o) => {
        if (o.roomId !== id) return o
        const edge = roomEdge(nextRoom, o.edgeIndex)
        if (!edge) return o
        return { ...o, offset: clampOffset(o.offset, o.width, edge.length) }
      })
      const furniture = s.plan.furniture.map((f) => {
        if (f.mount !== 'wall' || f.roomId !== id) return f
        const edge = roomEdge(nextRoom, f.edgeIndex)
        if (!edge) return f
        return { ...f, offset: clampOffset(f.offset, f.size.width, edge.length) }
      })
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.map((r) => (r.id === id ? nextRoom : r)),
          openings,
          furniture,
        },
      }
    }),

  moveRoom: (id, delta) =>
    set((s) => {
      const next = translateRoom(s.plan, id, delta)
      return next ? { plan: next } : s
    }),

  pushRoomEdge: (id, edgeIndex, coordinate) =>
    set((s) => {
      const next = pushRoomEdgeOp(s.plan, id, edgeIndex, coordinate)
      return next ? { plan: next } : s
    }),

  splitRoomEdge: (id, edgeIndex, t) =>
    set((s) => {
      const next = splitRoomEdgeOp(s.plan, id, edgeIndex, t)
      return next ? { plan: next } : s
    }),

  moveRoomVertex: (id, vertexIndex, point) =>
    set((s) => {
      const next = moveRoomVertexOp(s.plan, id, vertexIndex, point)
      return next ? { plan: next } : s
    }),

  mergeRoomCollinear: (id) =>
    set((s) => ({ plan: mergeRoomCollinearOp(s.plan, id) })),

  renameRoom: (id, name) =>
    set((s) => ({
      plan: { ...s.plan, rooms: s.plan.rooms.map((r) => (r.id === id ? { ...r, name } : r)) },
    })),

  setRoomColor: (id, color) =>
    set((s) => ({
      plan: { ...s.plan, rooms: s.plan.rooms.map((r) => (r.id === id ? { ...r, color } : r)) },
    })),

  deleteRoom: (id) =>
    set((s) => {
      const sel = s.selection
      const orphanSelected =
        sel?.kind === 'opening' && s.plan.openings.some((o) => o.id === sel.id && o.roomId === id)
      const orphanFurnitureSelected =
        sel?.kind === 'furniture' &&
        s.plan.furniture.some((f) => f.id === sel.id && f.mount === 'wall' && f.roomId === id)
      const roomSelected = sel?.kind === 'room' && sel.id === id
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.filter((r) => r.id !== id),
          openings: s.plan.openings.filter((o) => o.roomId !== id),
          furniture: s.plan.furniture.filter((f) => f.mount !== 'wall' || f.roomId !== id),
        },
        selection: roomSelected || orphanSelected || orphanFurnitureSelected ? null : s.selection,
      }
    }),

  loadPlan: (plan) => set({ plan, selection: null, placing: null, placingFurniture: null }),

  setPlacing: (placing) => set({ placing, placingFurniture: null, selection: null }),

  addOpening: (kind, roomId, edgeIndex, offset) => {
    const id = crypto.randomUUID()
    let created = false
    set((s) => {
      if (!Number.isFinite(offset)) return s
      const room = s.plan.rooms.find((r) => r.id === roomId)
      const edge = room ? roomEdge(room, edgeIndex) : null
      if (!edge) return s
      const defaults = OPENING_DEFAULTS[kind]
      const opening: Opening = {
        id,
        kind,
        roomId,
        edgeIndex,
        ...defaults,
        offset: clampOffset(offset, defaults.width, edge.length),
      }
      created = true
      return {
        plan: { ...s.plan, openings: [...s.plan.openings, opening] },
        selection: { kind: 'opening', id } as Selection,
        placing: null,
      }
    })
    return created ? id : ''
  },

  moveOpening: (id, offset) =>
    set((s) => {
      if (!Number.isFinite(offset)) return s
      const opening = s.plan.openings.find((o) => o.id === id)
      const room = opening ? s.plan.rooms.find((r) => r.id === opening.roomId) : undefined
      const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
      if (!opening || !edge) return s
      const next = { ...opening, offset: clampOffset(offset, opening.width, edge.length) }
      return {
        plan: { ...s.plan, openings: s.plan.openings.map((o) => (o.id === id ? next : o)) },
      }
    }),

  updateOpening: (id, patch) =>
    set((s) => {
      for (const value of Object.values(patch)) {
        if (value !== undefined && !Number.isFinite(value)) return s
      }
      const opening = s.plan.openings.find((o) => o.id === id)
      const room = opening ? s.plan.rooms.find((r) => r.id === opening.roomId) : undefined
      const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
      if (!opening || !edge) return s
      const wallHeight = s.plan.apartment.wallHeight
      const width = roundCm(Math.max(MIN_OPENING_WIDTH, patch.width ?? opening.width))
      const sillHeight =
        opening.kind === 'door'
          ? 0
          : roundCm(clamp(patch.sillHeight ?? opening.sillHeight, 0, wallHeight - 0.4))
      const height = roundCm(
        clamp(patch.height ?? opening.height, 0.3, wallHeight - 0.1 - sillHeight),
      )
      const offset = clampOffset(patch.offset ?? opening.offset, width, edge.length)
      const next = { ...opening, width, height, sillHeight, offset }
      return {
        plan: { ...s.plan, openings: s.plan.openings.map((o) => (o.id === id ? next : o)) },
      }
    }),

  deleteOpening: (id) =>
    set((s) => ({
      plan: { ...s.plan, openings: s.plan.openings.filter((o) => o.id !== id) },
      selection: s.selection?.kind === 'opening' && s.selection.id === id ? null : s.selection,
    })),

  placingFurniture: null,
  catalogOpen: false,

  // Closing the catalog also disarms furniture placement — an armed ghost with no
  // visible catalog is disorienting and was a long-standing papercut.
  setCatalogOpen: (catalogOpen) =>
    set((s) => ({ catalogOpen, placingFurniture: catalogOpen ? s.placingFurniture : null })),

  apartmentPropsOpen: false,

  setApartmentPropsOpen: (apartmentPropsOpen) => set({ apartmentPropsOpen }),

  setPlacingFurniture: (placingFurniture) =>
    set({ placingFurniture, placing: null, selection: null }),

  selectFurniture: (id) => set({ selection: { kind: 'furniture', id } }),

  placeFurniture: (catalogId, placement) => {
    const id = crypto.randomUUID()
    let created = false
    set((s) => {
      const cat = catalogItem(catalogId)
      if (!cat || cat.mount !== placement.mount) return s
      const size: Size3 = { ...cat.defaultSize }
      let item: PlacedItem
      if (placement.mount === 'floor') {
        if (!Number.isFinite(placement.position.x) || !Number.isFinite(placement.position.y) || !Number.isFinite(placement.rotation)) return s
        const rotation = normalizeRoundDeg(placement.rotation)
        const position = {
          x: roundCm(placement.position.x),
          y: roundCm(placement.position.y),
        }
        const candidate = { position, rotation, size }
        if (!floorItemInBounds(candidate, s.plan.apartment)) return s
        if (cat.layer === 'solid' && floorItemCollides(candidate, s.plan)) return s
        item = { id, catalogId, mount: 'floor', position, rotation, size }
      } else {
        if (!Number.isFinite(placement.offset)) return s
        const room = s.plan.rooms.find((r) => r.id === placement.roomId)
        const edge = room ? roomEdge(room, placement.edgeIndex) : null
        if (!edge) return s
        const wallHeight = s.plan.apartment.wallHeight
        item = {
          id, catalogId, mount: 'wall',
          roomId: placement.roomId, edgeIndex: placement.edgeIndex,
          offset: clampOffset(placement.offset, size.width, edge.length),
          elevation: roundCm(clamp(cat.defaultElevation ?? 1.2, 0, Math.max(0, wallHeight - size.height))),
          size,
        }
      }
      created = true
      return {
        plan: { ...s.plan, furniture: [...s.plan.furniture, item] },
        selection: { kind: 'furniture', id } as Selection,
        placingFurniture: null,
      }
    })
    return created ? id : ''
  },

  moveFloorItem: (id, position, rotation) =>
    set((s) => {
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return s
      if (rotation !== undefined && !Number.isFinite(rotation)) return s
      const item = s.plan.furniture.find((f) => f.id === id)
      if (!item || item.mount !== 'floor') return s
      const nextRotation = rotation === undefined ? item.rotation : normalizeRoundDeg(rotation)
      const next: FloorItem = {
        ...item,
        rotation: nextRotation,
        position: clampFloorItemPosition(position, nextRotation, item.size, s.plan.apartment),
      }
      return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
    }),

  moveWallItem: (id, roomId, edgeIndex, offset) =>
    set((s) => {
      if (!Number.isFinite(offset)) return s
      const item = s.plan.furniture.find((f) => f.id === id)
      if (!item || item.mount !== 'wall') return s
      const room = s.plan.rooms.find((r) => r.id === roomId)
      const edge = room ? roomEdge(room, edgeIndex) : null
      if (!edge) return s
      const next: WallItem = { ...item, roomId, edgeIndex, offset: clampOffset(offset, item.size.width, edge.length) }
      return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
    }),

  updateWallItem: (id, patch) =>
    set((s) => {
      for (const v of Object.values(patch)) if (v !== undefined && !Number.isFinite(v)) return s
      const item = s.plan.furniture.find((f) => f.id === id)
      if (!item || item.mount !== 'wall') return s
      const room = s.plan.rooms.find((r) => r.id === item.roomId)
      const edge = room ? roomEdge(room, item.edgeIndex) : null
      if (!edge) return s
      const wallHeight = s.plan.apartment.wallHeight
      const next: WallItem = {
        ...item,
        offset: clampOffset(patch.offset ?? item.offset, item.size.width, edge.length),
        elevation: roundCm(clamp(patch.elevation ?? item.elevation, 0, Math.max(0, wallHeight - item.size.height))),
      }
      return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
    }),

  rotateFurniture: (id, rotation) =>
    set((s) => {
      if (!Number.isFinite(rotation)) return s
      const item = s.plan.furniture.find((f) => f.id === id)
      if (!item || item.mount !== 'floor') return s
      const deg = normalizeRoundDeg(rotation)
      const next: FloorItem = {
        ...item,
        rotation: deg,
        position: clampFloorItemPosition(item.position, deg, item.size, s.plan.apartment),
      }
      return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
    }),

  resizeFurniture: (id, patch) =>
    set((s) => {
      for (const v of Object.values(patch)) if (v !== undefined && !Number.isFinite(v)) return s
      const item = s.plan.furniture.find((f) => f.id === id)
      const cat = item ? catalogItem(item.catalogId) : undefined
      if (!item || !cat) return s
      const size: Size3 = {
        width: roundCm(clamp(patch.width ?? item.size.width, cat.sizeBounds.min.width, cat.sizeBounds.max.width)),
        depth: roundCm(clamp(patch.depth ?? item.size.depth, cat.sizeBounds.min.depth, cat.sizeBounds.max.depth)),
        height: roundCm(clamp(patch.height ?? item.size.height, cat.sizeBounds.min.height, cat.sizeBounds.max.height)),
      }
      let next: PlacedItem
      if (item.mount === 'floor') {
        next = { ...item, size, position: clampFloorItemPosition(item.position, item.rotation, size, s.plan.apartment) }
      } else {
        const room = s.plan.rooms.find((r) => r.id === item.roomId)
        const edge = room ? roomEdge(room, item.edgeIndex) : null
        const wallHeight = s.plan.apartment.wallHeight
        next = {
          ...item,
          size,
          offset: edge ? clampOffset(item.offset, size.width, edge.length) : item.offset,
          elevation: roundCm(clamp(item.elevation, 0, Math.max(0, wallHeight - size.height))),
        }
      }
      return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
    }),

  recolorFurniture: (id, color) =>
    set((s) => {
      const item = s.plan.furniture.find((f) => f.id === id)
      const cat = item ? catalogItem(item.catalogId) : undefined
      if (!item || !cat?.recolorMaterial) return s
      if (color !== undefined && !HEX.test(color)) return s
      const next = { ...item, color }
      return { plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === id ? next : f)) } }
    }),

  deleteFurniture: (id) =>
    set((s) => ({
      plan: { ...s.plan, furniture: s.plan.furniture.filter((f) => f.id !== id) },
      selection: s.selection?.kind === 'furniture' && s.selection.id === id ? null : s.selection,
    })),

  setRoomFloorMaterial: (roomId, materialId) =>
    set((s) => {
      if (materialId !== undefined && !floorFinish(materialId)) return s
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.map((r) => (r.id === roomId ? { ...r, floorMaterial: materialId } : r)),
        },
      }
    }),

  setRoomWallColor: (roomId, color) =>
    set((s) => {
      if (color !== undefined && !HEX.test(color)) return s
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.map((r) => (r.id === roomId ? { ...r, wallColor: color } : r)),
        },
      }
    }),
}))
