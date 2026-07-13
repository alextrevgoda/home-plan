import { create } from 'zustand'
import { MIN_ROOM_SIZE, polygonArea, rectToPolygon, roundCm } from '../model/geometry'
import { clampOffset, MIN_OPENING_WIDTH, OPENING_DEFAULTS, roomEdge } from '../model/openings'
import { createDefaultPlan } from '../model/serialization'
import type { Apartment, Mode, Opening, OpeningKind, Plan, Rect, Selection } from '../model/types'

const ROOM_COLORS = ['#8ecae6', '#ffb703', '#90be6d', '#f4a7b9', '#bdb2ff', '#f9c74f']

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

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
      return { plan: { ...s.plan, apartment } }
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
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.map((r) => (r.id === id ? nextRoom : r)),
          openings,
        },
      }
    }),

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
      const roomSelected = sel?.kind === 'room' && sel.id === id
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.filter((r) => r.id !== id),
          openings: s.plan.openings.filter((o) => o.roomId !== id),
        },
        selection: roomSelected || orphanSelected ? null : s.selection,
      }
    }),

  loadPlan: (plan) => set({ plan, selection: null, placing: null }),

  setPlacing: (placing) => set({ placing, selection: null }),

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
}))
