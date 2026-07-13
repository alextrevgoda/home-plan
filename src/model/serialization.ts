import { z } from 'zod'
import { polygonArea } from './geometry'
import type { Plan } from './types'

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

export const planSchema = z
  .object({
    version: z.literal(2),
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
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    ),
    openings: z.array(openingSchema),
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
  })

export function createDefaultPlan(): Plan {
  return {
    version: 2,
    id: crypto.randomUUID(),
    name: 'My apartment',
    apartment: { width: 10, depth: 8, wallHeight: 2.7 },
    rooms: [],
    openings: [],
  }
}

export function serializePlan(plan: Plan): string {
  return JSON.stringify(plan, null, 2)
}

function migrate(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object' && (raw as { version?: unknown }).version === 1) {
    return { ...(raw as object), version: 2, openings: [] }
  }
  return raw
}

export function parsePlan(json: string): Plan | null {
  try {
    const result = planSchema.safeParse(migrate(JSON.parse(json)))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
