import { create } from 'zustand'
import { MIN_ROOM_SIZE, polygonArea, rectToPolygon, roundCm } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { Apartment, Mode, Plan, Rect, Selection } from '../model/types'

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
}

export const usePlanStore = create<PlanState>((set) => ({
  plan: createDefaultPlan(),
  selection: null,
  mode: '2d',

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
      return {
        plan: {
          ...s.plan,
          rooms: s.plan.rooms.map((r) => (r.id === id ? { ...r, polygon } : r)),
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
    set((s) => ({
      plan: { ...s.plan, rooms: s.plan.rooms.filter((r) => r.id !== id) },
      selection: s.selection?.kind === 'room' && s.selection.id === id ? null : s.selection,
    })),

  loadPlan: (plan) => set({ plan, selection: null }),
}))
