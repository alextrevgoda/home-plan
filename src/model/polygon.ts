import { clampOffset, fitOpeningWidth, roomEdge } from './openings'
import { roundCm } from './geometry'
import type { Opening, Plan, Rect, Room, Vec2 } from './types'

export const MIN_EDGE = 0.1

const EPS = 1e-9

export function isRectilinear(polygon: Vec2[]): boolean {
  const n = polygon.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    if ((dx === 0) === (dy === 0)) return false // degenerate or diagonal
  }
  return true
}

interface Seg {
  a: Vec2
  b: Vec2
  horizontal: boolean
}

function seg(polygon: Vec2[], i: number): Seg {
  const a = polygon[i]
  const b = polygon[(i + 1) % polygon.length]
  return { a, b, horizontal: a.y === b.y }
}

const lo = (s: Seg) => (s.horizontal ? Math.min(s.a.x, s.b.x) : Math.min(s.a.y, s.b.y))
const hi = (s: Seg) => (s.horizontal ? Math.max(s.a.x, s.b.x) : Math.max(s.a.y, s.b.y))
const level = (s: Seg) => (s.horizontal ? s.a.y : s.a.x)

function segsTouch(p: Seg, q: Seg): boolean {
  if (p.horizontal === q.horizontal) {
    // parallel: touch only if on the same line with overlapping extents
    return level(p) === level(q) && lo(p) <= hi(q) + EPS && lo(q) <= hi(p) + EPS
  }
  const h = p.horizontal ? p : q
  const v = p.horizontal ? q : p
  return (
    level(v) >= lo(h) - EPS && level(v) <= hi(h) + EPS &&
    level(h) >= lo(v) - EPS && level(h) <= hi(v) + EPS
  )
}

export function isSimplePolygon(polygon: Vec2[]): boolean {
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) continue
      if (segsTouch(seg(polygon, i), seg(polygon, j))) return false
    }
  }
  return true
}

export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function polygonCentroid(polygon: Vec2[]): Vec2 {
  let area2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]
    const q = polygon[(i + 1) % polygon.length]
    const cross = p.x * q.y - q.x * p.y
    area2 += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  if (area2 === 0) return polygon[0]
  return { x: cx / (3 * area2), y: cy / (3 * area2) }
}

export function polygonBounds(polygon: Vec2[]): Rect {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export function minEdgeLength(polygon: Vec2[]): number {
  let min = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    min = Math.min(min, Math.hypot(b.x - a.x, b.y - a.y))
  }
  return min
}

export function signedPolygonArea(polygon: Vec2[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function validateRoomPolygon(polygon: Vec2[]): boolean {
  return (
    isRectilinear(polygon) &&
    isSimplePolygon(polygon) &&
    minEdgeLength(polygon) >= MIN_EDGE - EPS &&
    signedPolygonArea(polygon) > 0 // positive = rectToPolygon winding; negative = reversed, rejected
  )
}

export interface MergeResult {
  polygon: Vec2[]
  edgeIndexMap: number[]
  offsetShift: number[]
}

export function mergeCollinear(polygon: Vec2[]): MergeResult {
  const n = polygon.length
  const keep = polygon.map((_, i) => {
    const prev = polygon[(i - 1 + n) % n]
    const cur = polygon[i]
    const next = polygon[(i + 1) % n]
    const prevVertical = prev.x === cur.x
    const nextVertical = cur.x === next.x
    return prevVertical !== nextVertical // corners stay, straight-throughs go
  })
  if (keep.every(Boolean)) {
    return {
      polygon: [...polygon],
      edgeIndexMap: polygon.map((_, i) => i),
      offsetShift: polygon.map(() => 0),
    }
  }
  const first = keep.findIndex(Boolean)
  const outVertices: Vec2[] = []
  const edgeIndexMap = new Array<number>(n)
  const offsetShift = new Array<number>(n)
  let newEdge = -1
  let acc = 0
  for (let k = 0; k < n; k++) {
    const oi = (k + first) % n
    if (keep[oi]) {
      outVertices.push(polygon[oi])
      newEdge += 1
      acc = 0
    } else {
      const prev = polygon[(oi - 1 + n) % n]
      const cur = polygon[oi]
      acc += Math.hypot(cur.x - prev.x, cur.y - prev.y)
    }
    edgeIndexMap[oi] = newEdge
    offsetShift[oi] = acc
  }
  return { polygon: outVertices, edgeIndexMap, offsetShift }
}

interface AttachmentRemap {
  edgeIndex: (old: number) => number
  offsetShift: (old: number) => number
}

const IDENTITY: AttachmentRemap = { edgeIndex: (i) => i, offsetShift: () => 0 }

function withRoomPolygon(
  plan: Plan,
  roomId: string,
  polygon: Vec2[],
  remap: AttachmentRemap,
): Plan | null {
  if (!validateRoomPolygon(polygon)) return null
  const nextRoom = { ...plan.rooms.find((r) => r.id === roomId)!, polygon }
  const homeEdge = (edgeIndex: number, offset: number, width: number) => {
    const newIndex = remap.edgeIndex(edgeIndex)
    const edge = roomEdge(nextRoom, newIndex)
    const raw = offset + remap.offsetShift(edgeIndex)
    return { edgeIndex: newIndex, offset: edge ? clampOffset(raw, width, edge.length) : raw }
  }
  const openings = plan.openings.map((o) => {
    if (o.roomId !== roomId) return o
    const newIndex = remap.edgeIndex(o.edgeIndex)
    const edge = roomEdge(nextRoom, newIndex)
    const raw = o.offset + remap.offsetShift(o.edgeIndex)
    if (!edge) return { ...o, edgeIndex: newIndex, offset: raw }
    const width = fitOpeningWidth(o.width, edge.length)
    return { ...o, edgeIndex: newIndex, width, offset: clampOffset(raw, width, edge.length) }
  })
  const furniture = plan.furniture.map((f) =>
    f.mount === 'wall' && f.roomId === roomId
      ? { ...f, ...homeEdge(f.edgeIndex, f.offset, f.size.width) }
      : f,
  )
  return {
    ...plan,
    rooms: plan.rooms.map((r) => (r.id === roomId ? nextRoom : r)),
    openings,
    furniture,
  }
}

export function translateRoom(plan: Plan, roomId: string, delta: Vec2): Plan | null {
  const r = plan.rooms.find((room) => room.id === roomId)
  if (!r || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return null
  const polygon = r.polygon.map((p) => ({ x: roundCm(p.x + delta.x), y: roundCm(p.y + delta.y) }))
  return withRoomPolygon(plan, roomId, polygon, IDENTITY)
}

// Rotates a cyclic vertex array left by `k` (new[i] = arr[(i + k) % n]). Used so pushRoomEdge
// can always operate as if the pushed edge starts at index 0 — eliminating the wrap case
// (edgeIndex === n − 1, whose edge otherwise straddles the end/start of the array) as a special
// case. rotateRight is its inverse, applied to the (possibly resized, post-insert/dedupe) result
// using THAT array's own length for the modulus — rotating out by the same amount `k` used to
// rotate in restores the original cyclic starting point.
function rotateLeft<T>(arr: T[], k: number): T[] {
  const n = arr.length
  const s = ((k % n) + n) % n
  return s === 0 ? arr.slice() : arr.slice(s).concat(arr.slice(0, s))
}

function rotateRight<T>(arr: T[], k: number): T[] {
  const n = arr.length
  const s = ((k % n) + n) % n
  return s === 0 ? arr.slice() : arr.slice(n - s).concat(arr.slice(0, n - s))
}

export function pushRoomEdge(plan: Plan, roomId: string, edgeIndex: number, coordinate: number): Plan | null {
  const r = plan.rooms.find((room) => room.id === roomId)
  if (!r || !Number.isFinite(coordinate)) return null
  const n = r.polygon.length
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return null

  // Work in a frame rotated so the pushed edge is always edge 0 → its endpoints are always
  // work[0] and work[1], never wrapping across the array boundary.
  const shift = edgeIndex
  const work = rotateLeft(r.polygon, shift)
  const a = work[0]
  const b = work[1]
  const horizontal = a.y === b.y
  const c = roundCm(coordinate)
  const movedA = horizontal ? { ...a, y: c } : { ...a, x: c }
  const movedB = horizontal ? { ...b, y: c } : { ...b, x: c }

  // A neighbor edge PARALLEL to the pushed edge (the split-vertex case) needs a perpendicular
  // connector: keep the original endpoint as an inserted vertex. Perpendicular neighbors just
  // stretch, as before.
  const prevV = work[n - 1]
  const nextV = work[2 % n]
  const prevParallel = horizontal ? prevV.y === a.y : prevV.x === a.x
  const nextParallel = horizontal ? nextV.y === b.y : nextV.x === b.x

  // The prev-parallel connector is appended LAST (after all the untouched vertices), not
  // inserted before movedA. That keeps the pushed edge (movedA→movedB) at work-frame index 0
  // no matter which neighbors are parallel — a drag that captures edgeIndex once at pointerdown
  // keeps pushing the same edge on every subsequent move. The unmoved prev-neighbor edge
  // (work[n-1]→a) becomes the new second-to-last edge (unchanged, as before); the connector
  // itself (a→movedA) becomes the new last edge — a brand-new edge that never had attachments.
  const rebuilt: Vec2[] = [movedA, movedB]
  if (nextParallel) rebuilt.push(b) // connector vertex (unmoved copy)
  for (let i = 2; i < n; i++) rebuilt.push(work[i])
  if (prevParallel) rebuilt.push(a) // connector vertex (unmoved copy), appended last

  // index remap for the insertions (before dedupe), expressed in the rotated (work) frame where
  // the pushed edge is always index 0. Only the next-parallel insertion (in front of work[2..])
  // shifts later edges; the prev-parallel insertion sits at the tail and shifts nothing.
  const insAfter = nextParallel ? 1 : 0
  const afterInsert = (workOld: number): number => (workOld === 0 ? 0 : workOld + insAfter)

  // a flush push collapses a connector to zero length — dedupe consecutive equal vertices,
  // remapping edges that collapse onto the following edge (offset clamps to that edge)
  const { polygon: workResult, dedupeMap } = dedupeZeroEdges(rebuilt)
  const polygon = rotateRight(workResult, shift)
  if (!validateRoomPolygon(polygon)) return null
  const m = workResult.length
  const remap: AttachmentRemap = {
    edgeIndex: (old) => {
      const workOld = ((old - shift) % n + n) % n
      const workNew = dedupeMap[afterInsert(workOld)]
      return (workNew + shift) % m
    },
    offsetShift: () => 0,
  }
  return withRoomPolygon(plan, roomId, polygon, remap)
}

function dedupeZeroEdges(polygon: Vec2[]): { polygon: Vec2[]; dedupeMap: number[] } {
  const n = polygon.length
  const out: Vec2[] = []
  const dedupeMap = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const cur = polygon[i]
    const next = polygon[(i + 1) % n]
    const zero = cur.x === next.x && cur.y === next.y
    dedupeMap[i] = zero ? -1 : -2 // fill below once final indices are known
    if (!zero) out.push(cur)
  }
  if (out.length === 0) return { polygon: out, dedupeMap: dedupeMap.map(() => 0) } // fully degenerate; caller validates and rejects
  // assign final edge indices: each kept old edge maps in order; a collapsed edge maps to the
  // NEXT kept edge (attachments on a zero-length edge re-home there, offset clamps to 0-ish)
  let newIdx = 0
  const firstPass = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    if (dedupeMap[i] === -2) firstPass[i] = newIdx++
    else firstPass[i] = -1
  }
  for (let i = 0; i < n; i++) {
    if (firstPass[i] !== -1) {
      dedupeMap[i] = firstPass[i]
    } else {
      // walk forward to the next kept edge (wrapping)
      let j = i
      while (firstPass[j % n] === -1) j++
      dedupeMap[i] = firstPass[j % n]
    }
  }
  return { polygon: out, dedupeMap }
}

export function splitRoomEdge(plan: Plan, roomId: string, edgeIndex: number, t: number): Plan | null {
  const r = plan.rooms.find((room) => room.id === roomId)
  const edge = r ? roomEdge(r, edgeIndex) : null
  if (!r || !edge || !Number.isFinite(t)) return null
  const tc = roundCm(t)
  if (tc < MIN_EDGE || tc > edge.length - MIN_EDGE) return null
  const point = { x: roundCm(edge.a.x + edge.ux * tc), y: roundCm(edge.a.y + edge.uy * tc) }
  const polygon = [...r.polygon]
  polygon.splice(edgeIndex + 1, 0, point)
  if (!validateRoomPolygon(polygon)) return null
  const nextRoom = { ...r, polygon }
  // one-pass routing: items before the split edge keep their index; after it shift +1;
  // ON it, the item's CENTER picks the sub-edge and the offset is re-based for the second
  const route = <T extends { edgeIndex: number; offset: number }>(item: T, width: number): T => {
    if (item.edgeIndex < edgeIndex) return item
    if (item.edgeIndex > edgeIndex) return { ...item, edgeIndex: item.edgeIndex + 1 }
    const toSecond = item.offset >= tc
    const newIndex = toSecond ? edgeIndex + 1 : edgeIndex
    const e = roomEdge(nextRoom, newIndex)!
    const rebased = toSecond ? item.offset - tc : item.offset
    return { ...item, edgeIndex: newIndex, offset: clampOffset(rebased, width, e.length) }
  }
  // openings additionally shrink to fit the (shorter) sub-edge they re-home to
  const routeOpening = (o: Opening): Opening => {
    if (o.edgeIndex !== edgeIndex) return route(o, o.width)
    const toSecond = o.offset >= tc
    const newIndex = toSecond ? edgeIndex + 1 : edgeIndex
    const e = roomEdge(nextRoom, newIndex)!
    const rebased = toSecond ? o.offset - tc : o.offset
    const width = fitOpeningWidth(o.width, e.length)
    return { ...o, edgeIndex: newIndex, width, offset: clampOffset(rebased, width, e.length) }
  }
  return {
    ...plan,
    rooms: plan.rooms.map((room) => (room.id === roomId ? nextRoom : room)),
    openings: plan.openings.map((o) => (o.roomId === roomId ? routeOpening(o) : o)),
    furniture: plan.furniture.map((f) =>
      f.mount === 'wall' && f.roomId === roomId ? route(f, f.size.width) : f,
    ),
  }
}

export function moveRoomVertex(plan: Plan, roomId: string, vertexIndex: number, point: Vec2): Plan | null {
  const r = plan.rooms.find((room) => room.id === roomId)
  if (!r || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
  const n = r.polygon.length
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= n) return null
  const prev = (vertexIndex - 1 + n) % n
  const next = (vertexIndex + 1) % n
  const prevVertical = r.polygon[prev].x === r.polygon[vertexIndex].x
  const nextVertical = r.polygon[vertexIndex].x === r.polygon[next].x
  if (prevVertical === nextVertical) return null // straight-through vertex: not directly draggable
  const p = { x: roundCm(point.x), y: roundCm(point.y) }
  const polygon = r.polygon.map((v, i) => {
    if (i === vertexIndex) return p
    if (i === prev) return prevVertical ? { ...v, x: p.x } : { ...v, y: p.y }
    if (i === next) return nextVertical ? { ...v, x: p.x } : { ...v, y: p.y }
    return v
  })
  return withRoomPolygon(plan, roomId, polygon, IDENTITY)
}

export function mergeRoomCollinear(plan: Plan, roomId: string): Plan {
  const r = plan.rooms.find((room) => room.id === roomId)
  if (!r) return plan
  const merged = mergeCollinear(r.polygon)
  if (merged.polygon.length === r.polygon.length) return plan
  const remap: AttachmentRemap = {
    edgeIndex: (old) => merged.edgeIndexMap[old],
    offsetShift: (old) => merged.offsetShift[old],
  }
  return withRoomPolygon(plan, roomId, merged.polygon, remap) ?? plan
}
