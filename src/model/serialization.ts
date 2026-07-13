import { z } from 'zod'
import { polygonArea } from './geometry'
import type { Plan } from './types'

const vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() })

export const planSchema = z.object({
  version: z.literal(1),
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
})

export function createDefaultPlan(): Plan {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: 'My apartment',
    apartment: { width: 10, depth: 8, wallHeight: 2.7 },
    rooms: [],
  }
}

export function serializePlan(plan: Plan): string {
  return JSON.stringify(plan, null, 2)
}

export function parsePlan(json: string): Plan | null {
  try {
    const result = planSchema.safeParse(JSON.parse(json))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
