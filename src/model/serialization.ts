import { z } from 'zod'
import { catalogItem, floorFinish } from './catalog'
import { clampFloorItemPosition } from './furniture'
import { normalizeRoundDeg, polygonArea, roundCm } from './geometry'
import { clampOffset, roomEdge } from './openings'
import type { Plan, PlacedItem } from './types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() })

const openingSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['door', 'window']),
  roomId: z.string().min(1),
  edgeIndex: z.number().int().min(0),
  offset: z.number().finite().min(0),
  width: z.number().finite().min(0.3),
  height: z.number().finite().positive(),
  sillHeight: z.number().finite().min(0),
})

const size3Schema = z.object({
  width: z.number().finite().positive(),
  depth: z.number().finite().positive(),
  height: z.number().finite().positive(),
})

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const knownCatalogId = z.string().min(1).refine((id) => !!catalogItem(id), { message: 'unknown catalog id' })

const floorItemSchema = z.object({
  id: z.string().min(1),
  catalogId: knownCatalogId,
  mount: z.literal('floor'),
  position: vec2Schema,
  rotation: z.number().finite(),
  size: size3Schema,
  color: hexColor.optional(),
})

const wallItemSchema = z.object({
  id: z.string().min(1),
  catalogId: knownCatalogId,
  mount: z.literal('wall'),
  roomId: z.string().min(1),
  edgeIndex: z.number().int().min(0),
  offset: z.number().finite(),
  elevation: z.number().finite(),
  size: size3Schema,
  color: hexColor.optional(),
})

const placedItemSchema = z.discriminatedUnion('mount', [floorItemSchema, wallItemSchema])

export const planSchema = z
  .object({
    version: z.literal(3),
    id: z.string().min(1),
    name: z.string(),
    apartment: z.object({
      width: z.number().min(1).max(100),
      depth: z.number().min(1).max(100),
      wallHeight: z.number().min(2).max(5),
    }),
    rooms: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        polygon: z
          .array(vec2Schema)
          .min(3)
          .refine((poly) => polygonArea(poly) > 0, { message: 'degenerate polygon' }),
        color: hexColor,
        floorMaterial: z.string().refine((id) => !!floorFinish(id), { message: 'unknown floor material' }).optional(),
        wallColor: hexColor.optional(),
      }),
    ),
    openings: z.array(openingSchema),
    furniture: z.array(placedItemSchema),
  })
  .superRefine((plan, ctx) => {
    plan.openings.forEach((opening, i) => {
      const room = plan.rooms.find((r) => r.id === opening.roomId)
      if (!room) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openings', i, 'roomId'],
          message: 'opening references unknown room',
        })
      } else if (opening.edgeIndex >= room.polygon.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openings', i, 'edgeIndex'],
          message: 'edge index out of range for room polygon',
        })
      }
    })
    plan.furniture.forEach((item, i) => {
      if (item.mount !== 'wall') return
      const room = plan.rooms.find((r) => r.id === item.roomId)
      if (!room) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['furniture', i, 'roomId'], message: 'wall item references unknown room' })
      } else if (item.edgeIndex >= room.polygon.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['furniture', i, 'edgeIndex'], message: 'edge index out of range for room polygon' })
      }
    })
  })

export function createDefaultPlan(): Plan {
  return {
    version: 3,
    id: crypto.randomUUID(),
    name: 'My apartment',
    apartment: { width: 10, depth: 8, wallHeight: 2.7 },
    rooms: [],
    openings: [],
    furniture: [],
  }
}

export function serializePlan(plan: Plan): string {
  return JSON.stringify(plan, null, 2)
}

function migrate(raw: unknown): unknown {
  let out = raw
  if (out !== null && typeof out === 'object' && (out as { version?: unknown }).version === 1) {
    out = { ...(out as object), version: 2, openings: [] }
  }
  if (out !== null && typeof out === 'object' && (out as { version?: unknown }).version === 2) {
    out = { ...(out as object), version: 3, furniture: [] }
  }
  return out
}

export function normalizePlan(plan: Plan): Plan {
  const furniture = plan.furniture.map((item): PlacedItem => {
    const cat = catalogItem(item.catalogId)!
    const size = {
      width: roundCm(clamp(item.size.width, cat.sizeBounds.min.width, cat.sizeBounds.max.width)),
      depth: roundCm(clamp(item.size.depth, cat.sizeBounds.min.depth, cat.sizeBounds.max.depth)),
      height: roundCm(clamp(item.size.height, cat.sizeBounds.min.height, cat.sizeBounds.max.height)),
    }
    if (item.mount === 'floor') {
      const rotation = normalizeRoundDeg(item.rotation)
      return {
        ...item,
        size,
        rotation,
        position: clampFloorItemPosition(item.position, rotation, size, plan.apartment),
      }
    }
    const room = plan.rooms.find((r) => r.id === item.roomId)
    const edge = room ? roomEdge(room, item.edgeIndex) : null
    return {
      ...item,
      size,
      offset: edge ? clampOffset(item.offset, size.width, edge.length) : item.offset,
      elevation: roundCm(clamp(item.elevation, 0, Math.max(0, plan.apartment.wallHeight - size.height))),
    }
  })
  return { ...plan, furniture }
}

export function parsePlan(json: string): Plan | null {
  try {
    const result = planSchema.safeParse(migrate(JSON.parse(json)))
    return result.success ? normalizePlan(result.data) : null
  } catch {
    return null
  }
}
