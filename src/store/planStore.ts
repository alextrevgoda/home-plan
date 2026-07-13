import { create } from 'zustand'
import { MIN_ROOM_SIZE, polygonArea, rectToPolygon, roundCm } from '../model/geometry'
import { createDefaultPlan } from '../model/serialization'
import type { Apartment, Mode, Plan, Rect } from '../model/types'

const ROOM_COLORS = ['#8ecae6', '#ffb703', '#90be6d', '#f4a7b9', '#bdb2ff', '#f9c74f']

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export interface PlanState {
  plan: Plan
  selectedRoomId: string | null
  mode: Mode
  setMode: (mode: Mode) => void
  selectRoom: (id: string | null) => void
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
  selectedRoomId: null,
  mode: '2d',

  setMode: (mode) => set({ mode }),

  selectRoom: (selectedRoomId) => set({ selectedRoomId }),

  setApartment: (patch) =>
    set((s) => {
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
      return { plan: { ...s.plan, rooms: [...s.plan.rooms, room] }, selectedRoomId: id }
    })
    return id
  },

  updateRoomRect: (id, rect) =>
    set((s) => {
      const clamped: Rect = {
        x: roundCm(rect.x),
        y: roundCm(rect.y),
        width: roundCm(Math.max(MIN_ROOM_SIZE, rect.width)),
        height: roundCm(Math.max(MIN_ROOM_SIZE, rect.height)),
      }
      const polygon = rectToPolygon(clamped)
      if (polygonArea(polygon) === 0) return s
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
      selectedRoomId: s.selectedRoomId === id ? null : s.selectedRoomId,
    })),

  loadPlan: (plan) => set({ plan, selectedRoomId: null }),
}))
