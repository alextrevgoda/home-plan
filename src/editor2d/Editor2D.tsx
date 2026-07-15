import { Application, Container, Graphics, type FederatedPointerEvent } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { catalogItem } from '../model/catalog'
import { roundCm } from '../model/geometry'
import { floorItemCollides, floorItemInBounds, isSolidFloorItem, snapFloorItemToWall } from '../model/furniture'
import { projectOntoEdge, roomEdge } from '../model/openings'
import { polygonBounds } from '../model/polygon'
import { collectSnapLines, snapMove, snapScalar, type SnapGuide, type SnapOptions } from '../model/snapping'
import type { Plan, Rect, Room, Vec2 } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { useToast } from '../ui/toast'
import { isDoubleTap, pinchTransform, type Tap } from './gestures'
import {
  edgeIsHorizontal,
  hitFurniture,
  hitOpening,
  hitOpeningJamb,
  hitPolygonHandle,
  hitRadius,
  hitRoom,
  hitRotationHandle,
  nearestEdge,
  nearestRoomEdge,
  rotationFromPointer,
  type EdgeHit,
} from './interactions'
import {
  drawBoundary,
  drawEdgeHighlight,
  drawFurniture,
  drawFurnitureGhost,
  drawGrid,
  drawGuides,
  drawOpenings,
  drawPolygonHandles,
  drawRooms,
  drawRotationHandle,
  type FurnitureGhost,
} from './render'
import { fitApartment, recenterViewport, screenToWorld, zoomAt, type Viewport } from './viewport'

function isTypingTarget(ev: KeyboardEvent) {
  const t = ev.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
}

export function Editor2D() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current!
    const app = new Application()
    let destroyed = false
    const cleanups: Array<() => void> = []

    app.init({ resizeTo: host, antialias: true, background: '#f7f8fa' }).then(() => {
      if (destroyed) {
        app.destroy(true)
        return
      }
      host.appendChild(app.canvas)
      app.canvas.style.touchAction = 'none' // the editor owns all gestures on the canvas

      const layers = {
        grid: new Graphics(),
        boundary: new Graphics(),
        rooms: new Container(),
        furniture: new Container(),
        openings: new Graphics(),
        edgeHighlight: new Graphics(),
        ghost: new Graphics(),
        guides: new Graphics(),
        handles: new Graphics(),
        furnitureHandles: new Graphics(),
      }
      app.stage.addChild(
        layers.grid,
        layers.boundary,
        layers.rooms,
        layers.furniture,
        layers.openings,
        layers.edgeHighlight,
        layers.ghost,
        layers.guides,
        layers.handles,
        layers.furnitureHandles,
      )

      let viewport: Viewport = fitApartment(
        app.screen.width,
        app.screen.height,
        usePlanStore.getState().plan.apartment,
      )
      let dirty = true
      const markDirty = () => {
        dirty = true
      }

      cleanups.push(usePlanStore.subscribe(markDirty))
      app.renderer.on('resize', markDirty)

      // `resizeTo` only reacts to window resize events (pixi's ResizePlugin). Layout changes that
      // resize `host` without resizing the window — e.g. toggling the furniture catalog panel —
      // need an explicit refit, so observe the host element directly.
      let lastSize = { width: app.screen.width, height: app.screen.height }
      const resizeObserver = new ResizeObserver(() => {
        app.resize()
        const nextSize = { width: app.screen.width, height: app.screen.height }
        viewport = recenterViewport(viewport, lastSize, nextSize)
        lastSize = nextSize
        markDirty()
      })
      resizeObserver.observe(host)
      cleanups.push(() => resizeObserver.disconnect())

      let panning: { lastX: number; lastY: number; downX: number; downY: number } | null = null
      let spaceDown = false

      // Every mutating drag kind records its drag-start state so a second finger joining
      // mid-drag (pinch) can revert the plan exactly (see revertDragToStart). Room moves
      // record the start bounds origin; pushEdge/moveVertex record the whole drag-start
      // plan, because those store ops clamp opening/wall-item offsets as edges shrink and
      // re-running the op with the start value cannot restore them. Plans are immutable,
      // so holding the reference is free.
      type DragState =
        | { kind: 'idle' }
        | { kind: 'move'; roomId: string; grabOffset: Vec2; start: Vec2 }
        | { kind: 'pushEdge'; roomId: string; edgeIndex: number; horizontal: boolean; startPlan: Plan }
        | { kind: 'moveVertex'; roomId: string; vertexIndex: number; startPlan: Plan }
        | { kind: 'moveOpening'; openingId: string; start: number }
        | { kind: 'resizeOpening'; openingId: string; end: 'start' | 'end'; startWidth: number; startOffset: number }
        | { kind: 'moveFloorItem'; itemId: string; grabOffset: Vec2; start: { position: Vec2; rotation: number } }
        | { kind: 'moveWallItem'; itemId: string; start: { roomId: string; edgeIndex: number; offset: number } }
        | { kind: 'rotateFurniture'; itemId: string; start: { position: Vec2; rotation: number } }
      let drag: DragState = { kind: 'idle' }
      // Tracks whether the current pushEdge/moveVertex drag has actually mutated the plan (as
      // opposed to every push being rejected below the engage threshold, or a zero-movement
      // handle click). endInteraction only merges collinear vertices when this is true — otherwise
      // a no-op drag would silently discard a pending split (see finding I1).
      let dragMutated = false
      // touch gesture state: active touch contacts, whether a two-finger pinch is
      // running, the previous tap for double-tap detection, and an armed-placement
      // tap that's deferred until pointerup (see pendingPlacement below)
      const touchPoints = new Map<number, Vec2>()
      let pinching = false
      let lastTap: Tap | null = null
      let pendingPlacement: { pointerId: number; x: number; y: number } | null = null
      // pinchSession stays true from the moment a second finger joins until the next fresh
      // first-finger contact — pixi still emits a pointertap for each pinch finger's lift,
      // and those must never count toward a double-tap (see the pointertap handler).
      let pinchSession = false
      // Down position of the current single-finger touch, so the pointertap handler can tell
      // a genuine tap from a pan/drag that happened to end near where it started in time.
      let touchDown: { pointerId: number; x: number; y: number } | null = null
      // Set whenever an armed placement consumed a press (placed, or missed and disarmed).
      // The pointertap fired by that same press must not count toward a double gesture.
      let justPlaced = false
      let hoverEdge: EdgeHit | null = null
      let ghost: FurnitureGhost | null = null
      let guides: SnapGuide[] = []
      let altDown = false
      let shiftDown = false

      const snapOpts = (): SnapOptions => ({
        gridStep: 0.1,
        gridThreshold: 10 / viewport.scale,
        edgeThreshold: 10 / viewport.scale,
      })

      const otherRooms = (excludeId: string): Room[] =>
        usePlanStore
          .getState()
          .plan.rooms.filter((r) => r.id !== excludeId)

      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen

      // Pointer capture keeps mid-drag `pointermove` deliveries flowing to the canvas even once
      // the pointer leaves its bounds (without it, dragging an item off-canvas stalls the drag
      // until the pointer re-enters; pointerupoutside only catches the eventual release).
      const capturePointer = (pointerId: number) => {
        try {
          app.canvas.setPointerCapture(pointerId)
        } catch {
          // not every environment/pointer type supports capture; drags still work via
          // pointerupoutside, just without moves continuing past the canvas edge
        }
      }
      const releasePointer = (pointerId: number) => {
        try {
          app.canvas.releasePointerCapture(pointerId)
        } catch {
          // no-op if capture was never established for this pointer
        }
      }

      // If the in-progress drag left a solid floor item colliding with another solid, snap it
      // back to where the drag started. Shared by the normal pointerup end-of-drag path and the
      // Escape-to-cancel path, so a colliding position never survives the end of an interaction.
      const revertDragIfColliding = () => {
        if (drag.kind === 'moveFloorItem' || drag.kind === 'rotateFurniture') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const item = store.plan.furniture.find((f) => f.id === activeDrag.itemId)
          if (item && isSolidFloorItem(item) && floorItemCollides(item, store.plan, item.id)) {
            store.moveFloorItem(item.id, activeDrag.start.position, activeDrag.start.rotation)
          }
        }
      }

      // Second-finger cancel (touch) must revert every drag kind to its exact
      // drag-start state — not just colliding solid floor items, since a pinch
      // can start mid-drag of a room, opening, or wall item too. Used ONLY by
      // the second-finger cancel path; Escape and normal pointerup keep using
      // revertDragIfColliding so desktop behavior is unchanged.
      const revertDragToStart = () => {
        const store = usePlanStore.getState()
        if (drag.kind === 'move') {
          const activeDrag = drag
          const room = store.plan.rooms.find((r) => r.id === activeDrag.roomId)
          if (room) {
            const b = polygonBounds(room.polygon)
            store.moveRoom(activeDrag.roomId, { x: roundCm(activeDrag.start.x - b.x), y: roundCm(activeDrag.start.y - b.y) })
          }
        } else if (drag.kind === 'pushEdge' || drag.kind === 'moveVertex') {
          // pushRoomEdge/moveRoomVertex clamp opening and wall-item offsets as edges
          // shrink, so replaying the op with the start value cannot restore them —
          // restore the exact drag-start plan snapshot instead.
          usePlanStore.setState({ plan: drag.startPlan })
        } else if (drag.kind === 'moveOpening') {
          store.moveOpening(drag.openingId, drag.start)
        } else if (drag.kind === 'resizeOpening') {
          store.updateOpening(drag.openingId, { width: drag.startWidth, offset: drag.startOffset })
        } else if (drag.kind === 'moveWallItem') {
          store.moveWallItem(drag.itemId, drag.start.roomId, drag.start.edgeIndex, drag.start.offset)
        } else if (drag.kind === 'moveFloorItem' || drag.kind === 'rotateFurniture') {
          store.moveFloorItem(drag.itemId, drag.start.position, drag.start.rotation)
        }
      }

      // Shared placement logic, used by both the mouse/pen pointerdown path (fires
      // immediately) and the deferred touch pointerup path (fires only if the tap
      // didn't turn into a pan/pinch — see pendingPlacement).
      const executeOpeningPlacement = (screen: Vec2, pointerType?: string) => {
        const store = usePlanStore.getState()
        if (!store.placing) return
        justPlaced = true
        const hit = nearestEdge(store.plan, viewport, screen, hitRadius(10, pointerType))
        if (hit) store.addOpening(store.placing, hit.roomId, hit.edgeIndex, hit.offset)
        else store.setPlacing(null)
        hoverEdge = null
        ghost = null
        markDirty()
      }

      const executeFurniturePlacement = (screen: Vec2, pointerType?: string) => {
        const store = usePlanStore.getState()
        if (!store.placingFurniture) return
        justPlaced = true
        const world = screenToWorld(viewport, screen)
        const cat = catalogItem(store.placingFurniture)
        if (cat?.mount === 'floor') {
          const snap = altDown ? null : snapFloorItemToWall(world, cat.defaultSize, store.plan)
          const position = snap?.position ?? world
          const rotation = snap?.rotation ?? 0
          const candidate = { position, rotation, size: cat.defaultSize }
          const valid =
            floorItemInBounds(candidate, store.plan.apartment) &&
            (cat.layer !== 'solid' || !floorItemCollides(candidate, store.plan))
          if (valid) {
            store.placeFurniture(cat.id, { mount: 'floor', position, rotation })
            ghost = null
          }
        } else if (cat) {
          const hit = nearestEdge(store.plan, viewport, screen, hitRadius(10, pointerType))
          if (hit) {
            store.placeFurniture(cat.id, { mount: 'wall', roomId: hit.roomId, edgeIndex: hit.edgeIndex, offset: hit.offset })
            hoverEdge = null
          }
        }
        markDirty()
      }

      const handlePointerDown = (e: FederatedPointerEvent) => {
        if (e.pointerType === 'touch') {
          if (touchPoints.size >= 2) return // ignore 3rd+ finger entirely
          touchPoints.set(e.pointerId, { x: e.global.x, y: e.global.y })
          if (touchPoints.size === 1) {
            // fresh touch gesture: remember where it started (tap-vs-drag telling in
            // pointertap) and clear the previous gesture's pinch suppression
            touchDown = { pointerId: e.pointerId, x: e.global.x, y: e.global.y }
            pinchSession = false
          }
          if (touchPoints.size === 2) {
            // Second finger: abandon any one-finger interaction and navigate instead.
            revertDragToStart()
            drag = { kind: 'idle' }
            dragMutated = false
            guides = []
            panning = null
            pinching = true
            pinchSession = true
            pendingPlacement = null
            lastTap = null
            markDirty()
            return
          }
        }
        if (e.button === 1 || spaceDown) {
          panning = { lastX: e.global.x, lastY: e.global.y, downX: e.global.x, downY: e.global.y }
          return
        }
        const store = usePlanStore.getState()
        const screen = { x: e.global.x, y: e.global.y }
        const world = screenToWorld(viewport, screen)

        // armed placement: click places on the nearest wall, or cancels. On touch,
        // defer the decision to pointerup so starting a pinch doesn't commit a
        // placement at the first finger's down point.
        if (store.placing) {
          if (e.pointerType === 'touch') {
            pendingPlacement = { pointerId: e.pointerId, x: screen.x, y: screen.y }
            panning = { lastX: screen.x, lastY: screen.y, downX: screen.x, downY: screen.y }
            markDirty()
            return
          }
          executeOpeningPlacement(screen, e.pointerType)
          return
        }

        // armed furniture placement: floor items place from the ghost, wall items attach to the
        // nearest edge. Same touch deferral as above.
        if (store.placingFurniture) {
          if (e.pointerType === 'touch') {
            pendingPlacement = { pointerId: e.pointerId, x: screen.x, y: screen.y }
            panning = { lastX: screen.x, lastY: screen.y, downX: screen.x, downY: screen.y }
            markDirty()
            return
          }
          executeFurniturePlacement(screen, e.pointerType)
          return
        }

        // rotation handle floats above everything — it wins over all other hit targets
        const selFurniture =
          store.selection?.kind === 'furniture'
            ? store.plan.furniture.find((f) => f.id === store.selection!.id)
            : undefined
        if (selFurniture?.mount === 'floor' && hitRotationHandle(selFurniture, viewport, screen, hitRadius(9, e.pointerType))) {
          drag = {
            kind: 'rotateFurniture',
            itemId: selFurniture.id,
            start: { position: selFurniture.position, rotation: selFurniture.rotation },
          }
          return
        }

        // jamb resize handles on the selected opening beat the opening body
        const jamb = hitOpeningJamb(store.plan, store.selection, viewport, screen, hitRadius(8, e.pointerType))
        if (jamb) {
          const opening = store.plan.openings.find((o) => o.id === jamb.openingId)
          if (opening) {
            drag = {
              kind: 'resizeOpening', openingId: jamb.openingId, end: jamb.end,
              startWidth: opening.width, startOffset: opening.offset,
            }
            return
          }
        }

        // openings are small targets on walls — they win over room bodies
        const openingId = hitOpening(store.plan, viewport, screen, hitRadius(8, e.pointerType))
        if (openingId) {
          const opening = store.plan.openings.find((o) => o.id === openingId)
          store.selectOpening(openingId)
          drag = { kind: 'moveOpening', openingId, start: opening ? opening.offset : 0 }
          markDirty()
          return
        }

        const furnitureId = hitFurniture(store.plan, viewport, screen, hitRadius(8, e.pointerType))
        if (furnitureId) {
          const item = store.plan.furniture.find((f) => f.id === furnitureId)!
          store.selectFurniture(furnitureId)
          if (item.mount === 'floor') {
            drag = {
              kind: 'moveFloorItem', itemId: furnitureId,
              grabOffset: { x: world.x - item.position.x, y: world.y - item.position.y },
              start: { position: item.position, rotation: item.rotation },
            }
          } else {
            drag = {
              kind: 'moveWallItem', itemId: furnitureId,
              start: { roomId: item.roomId, edgeIndex: item.edgeIndex, offset: item.offset },
            }
          }
          markDirty()
          return
        }

        const sel = store.selection
        const selectedRoom =
          sel?.kind === 'room' ? store.plan.rooms.find((r) => r.id === sel.id) : undefined
        if (selectedRoom) {
          // touch pointers get the doubled hit radius on the polygon handles, exactly as
          // they did on the old rect resize handles
          const handle = hitPolygonHandle(selectedRoom, viewport, screen, hitRadius(8, e.pointerType))
          if (handle) {
            dragMutated = false
            drag =
              handle.kind === 'edge'
                ? {
                    kind: 'pushEdge',
                    roomId: selectedRoom.id,
                    edgeIndex: handle.index,
                    horizontal: edgeIsHorizontal(selectedRoom.polygon, handle.index),
                    startPlan: store.plan,
                  }
                : { kind: 'moveVertex', roomId: selectedRoom.id, vertexIndex: handle.index, startPlan: store.plan }
            return
          }
        }
        const roomId = hitRoom(store.plan.rooms, world)
        store.selectRoom(roomId)
        if (roomId) {
          const b = polygonBounds(store.plan.rooms.find((r) => r.id === roomId)!.polygon)
          drag = { kind: 'move', roomId, grabOffset: { x: world.x - b.x, y: world.y - b.y }, start: { x: b.x, y: b.y } }
        } else if (e.pointerType === 'touch') {
          // empty canvas: one finger pans (double-tap refit lives in the pointertap handler)
          panning = { lastX: e.global.x, lastY: e.global.y, downX: e.global.x, downY: e.global.y }
        }
      }

      app.stage.on('pointerdown', (e) => {
        handlePointerDown(e)
        if (panning || drag.kind !== 'idle') capturePointer(e.pointerId)
      })

      app.stage.on('pointermove', (e) => {
        if (e.pointerType === 'touch' && touchPoints.has(e.pointerId)) {
          if (pinching && touchPoints.size === 2) {
            const ids = [...touchPoints.keys()] as [number, number]
            const before: [Vec2, Vec2] = [touchPoints.get(ids[0])!, touchPoints.get(ids[1])!]
            touchPoints.set(e.pointerId, { x: e.global.x, y: e.global.y })
            const after: [Vec2, Vec2] = [touchPoints.get(ids[0])!, touchPoints.get(ids[1])!]
            viewport = pinchTransform(viewport, before, after)
            markDirty()
            return
          }
          touchPoints.set(e.pointerId, { x: e.global.x, y: e.global.y })
        }
        if (panning) {
          viewport = {
            ...viewport,
            offsetX: viewport.offsetX + e.global.x - panning.lastX,
            offsetY: viewport.offsetY + e.global.y - panning.lastY,
          }
          // A pan that's traveled far enough from its down point is not a tap —
          // stop it from completing a double-tap refit with a later genuine tap.
          if (
            e.pointerType === 'touch' &&
            Math.hypot(e.global.x - panning.downX, e.global.y - panning.downY) > 8
          ) {
            lastTap = null
          }
          panning = { lastX: e.global.x, lastY: e.global.y, downX: panning.downX, downY: panning.downY }
          markDirty()
          return
        }
        const hoverStore = usePlanStore.getState()
        if (hoverStore.placingFurniture) {
          const cat = catalogItem(hoverStore.placingFurniture)
          if (cat?.mount === 'floor') {
            const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
            const snap = altDown ? null : snapFloorItemToWall(world, cat.defaultSize, hoverStore.plan)
            const position = snap?.position ?? world
            const rotation = snap?.rotation ?? 0
            const candidate = { position, rotation, size: cat.defaultSize }
            const valid =
              floorItemInBounds(candidate, hoverStore.plan.apartment) &&
              (cat.layer !== 'solid' || !floorItemCollides(candidate, hoverStore.plan))
            ghost = { catalogId: cat.id, position, rotation, valid }
            hoverEdge = null
          } else if (cat) {
            ghost = null
            hoverEdge = nearestEdge(hoverStore.plan, viewport, { x: e.global.x, y: e.global.y })
          }
          markDirty()
          return
        }
        if (hoverStore.placing) {
          hoverEdge = nearestEdge(hoverStore.plan, viewport, { x: e.global.x, y: e.global.y })
          markDirty()
          return
        }
        if (drag.kind === 'idle') return

        if (drag.kind === 'move') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const room = store.plan.rooms.find((r) => r.id === activeDrag.roomId)
          if (!room) return
          const b = polygonBounds(room.polygon)
          const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          const raw: Rect = { ...b, x: world.x - activeDrag.grabOffset.x, y: world.y - activeDrag.grabOffset.y }
          let target = { x: raw.x, y: raw.y }
          guides = []
          if (!altDown) {
            const lines = collectSnapLines(otherRooms(activeDrag.roomId), store.plan.apartment)
            const snapped = snapMove(raw, lines, snapOpts())
            guides = snapped.guides
            target = { x: snapped.x, y: snapped.y }
          }
          store.moveRoom(activeDrag.roomId, { x: roundCm(target.x - b.x), y: roundCm(target.y - b.y) })
          markDirty()
        }

        if (drag.kind === 'pushEdge') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          let coordinate = activeDrag.horizontal ? world.y : world.x
          guides = []
          if (!altDown) {
            const lines = collectSnapLines(otherRooms(activeDrag.roomId), store.plan.apartment)
            const snapped = snapScalar(coordinate, activeDrag.horizontal ? lines.ys : lines.xs, snapOpts())
            coordinate = snapped.value
            if (snapped.guide !== null) guides.push({ axis: activeDrag.horizontal ? 'y' : 'x', position: snapped.guide })
          }
          const before = store.plan
          store.pushRoomEdge(activeDrag.roomId, activeDrag.edgeIndex, roundCm(coordinate))
          if (usePlanStore.getState().plan !== before) dragMutated = true
          markDirty()
        }

        if (drag.kind === 'moveVertex') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          let point = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          guides = []
          if (!altDown) {
            const lines = collectSnapLines(otherRooms(activeDrag.roomId), store.plan.apartment)
            const opts = snapOpts()
            const sx = snapScalar(point.x, lines.xs, opts)
            const sy = snapScalar(point.y, lines.ys, opts)
            point = { x: sx.value, y: sy.value }
            if (sx.guide !== null) guides.push({ axis: 'x', position: sx.guide })
            if (sy.guide !== null) guides.push({ axis: 'y', position: sy.guide })
          }
          const before = store.plan
          store.moveRoomVertex(activeDrag.roomId, activeDrag.vertexIndex, point)
          if (usePlanStore.getState().plan !== before) dragMutated = true
          markDirty()
        }

        if (drag.kind === 'moveOpening') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const opening = store.plan.openings.find((o) => o.id === activeDrag.openingId)
          const room = opening ? store.plan.rooms.find((r) => r.id === opening.roomId) : undefined
          const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
          if (!opening || !edge) return
          const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          store.moveOpening(activeDrag.openingId, roundCm(projectOntoEdge(edge, world)))
          markDirty()
        }

        if (drag.kind === 'resizeOpening') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const opening = store.plan.openings.find((o) => o.id === activeDrag.openingId)
          const room = opening ? store.plan.rooms.find((r) => r.id === opening.roomId) : undefined
          const edge = opening && room ? roomEdge(room, opening.edgeIndex) : null
          if (!opening || !edge) return
          const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          store.resizeOpeningEnd(activeDrag.openingId, activeDrag.end, roundCm(projectOntoEdge(edge, world)))
          markDirty()
        }

        if (drag.kind === 'moveFloorItem') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const item = store.plan.furniture.find((f) => f.id === activeDrag.itemId)
          if (!item || item.mount !== 'floor') return
          const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          const raw = { x: world.x - activeDrag.grabOffset.x, y: world.y - activeDrag.grabOffset.y }
          const snap = altDown ? null : snapFloorItemToWall(raw, item.size, store.plan)
          if (snap) store.moveFloorItem(activeDrag.itemId, snap.position, snap.rotation)
          else store.moveFloorItem(activeDrag.itemId, { x: roundCm(raw.x), y: roundCm(raw.y) })
          markDirty()
        }

        if (drag.kind === 'moveWallItem') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const hit = nearestEdge(store.plan, viewport, { x: e.global.x, y: e.global.y }, hitRadius(20, e.pointerType))
          if (hit) store.moveWallItem(activeDrag.itemId, hit.roomId, hit.edgeIndex, hit.offset)
          markDirty()
        }

        if (drag.kind === 'rotateFurniture') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const item = store.plan.furniture.find((f) => f.id === activeDrag.itemId)
          if (!item || item.mount !== 'floor') return
          store.rotateFurniture(
            activeDrag.itemId,
            rotationFromPointer(
              item,
              viewport,
              { x: e.global.x, y: e.global.y },
              e.pointerType === 'touch' ? true : !shiftDown,
            ),
          )
          markDirty()
        }
      })

      const endInteraction = (e?: FederatedPointerEvent) => {
        panning = null
        revertDragIfColliding()
        if ((drag.kind === 'pushEdge' || drag.kind === 'moveVertex') && dragMutated) {
          usePlanStore.getState().mergeRoomCollinear(drag.roomId)
        }
        if (drag.kind !== 'idle' || guides.length > 0) {
          drag = { kind: 'idle' }
          dragMutated = false
          guides = []
          markDirty()
        }
        if (e) releasePointer(e.pointerId)
      }
      const endPointer = (e: FederatedPointerEvent) => {
        if (e.pointerType === 'touch') {
          const pending =
            pendingPlacement && pendingPlacement.pointerId === e.pointerId ? pendingPlacement : null
          if (pending) pendingPlacement = null
          touchPoints.delete(e.pointerId)
          if (pinching) {
            if (touchPoints.size === 1) {
              // one finger lifted mid-pinch: keep navigating with the remaining finger
              const rest = [...touchPoints.values()][0]
              panning = { lastX: rest.x, lastY: rest.y, downX: rest.x, downY: rest.y }
              pinching = false
              releasePointer(e.pointerId)
              return
            }
            pinching = touchPoints.size > 1
          }
          // Deferred armed-placement tap: only commit if this is a genuine release
          // (not a cancel) and the finger stayed within the tap threshold — a second
          // finger joining already cleared pendingPlacement above.
          if (pending && e.type === 'pointerup') {
            const traveled = Math.hypot(e.global.x - pending.x, e.global.y - pending.y)
            if (traveled < 12) {
              const screen = { x: pending.x, y: pending.y }
              const store = usePlanStore.getState()
              if (store.placing) executeOpeningPlacement(screen, 'touch')
              else if (store.placingFurniture) executeFurniturePlacement(screen, 'touch')
            }
          }
        }
        endInteraction(e)
      }
      app.stage.on('pointerup', endPointer)
      app.stage.on('pointerupoutside', endPointer)
      app.stage.on('pointercancel', endPointer)

      // DOUBLE-GESTURE RULE (integration of polygonal rooms + mobile view): on a double
      // click/tap — if a room is selected AND the point lands within hit radius of one of
      // its edges (doubled radius for touch), SPLIT that wall at the point (polygon-rooms
      // behavior); otherwise fall through and REFIT the viewport to the apartment (the
      // mobile double-tap behavior, now shared by mouse double-click). One handler,
      // ordered split-first, so the refit can never steal a wall-split gesture.
      //
      // Detection differs per pointer type only because pixi's click counting (e.detail)
      // keys off the pointerId, and browsers hand each touch contact a fresh pointerId —
      // so e.detail === 2 never happens for touch. Mouse/pen use e.detail; touch uses
      // manual isDoubleTap tracking over pointertap events, with two extra guards: a tap
      // whose finger traveled (a pan/drag), or any tap belonging to a pinch session,
      // never counts toward a double-tap.
      app.stage.on('pointertap', (e) => {
        // a tap fired by the press that just consumed an armed placement is neither a
        // split nor a refit candidate
        if (justPlaced) {
          justPlaced = false
          lastTap = null
          return
        }
        let isDouble: boolean
        if (e.pointerType === 'touch') {
          if (pinchSession) {
            lastTap = null
            return
          }
          const traveled =
            touchDown && touchDown.pointerId === e.pointerId
              ? Math.hypot(e.global.x - touchDown.x, e.global.y - touchDown.y)
              : Infinity
          if (traveled > 8) {
            lastTap = null
            return
          }
          const tap: Tap = { x: e.global.x, y: e.global.y, time: performance.now() }
          isDouble = isDoubleTap(lastTap, tap)
          lastTap = isDouble ? null : tap
        } else {
          isDouble = e.detail === 2
        }
        if (!isDouble) return
        const store = usePlanStore.getState()
        if (store.placing || store.placingFurniture) return
        // split first: double click/tap on a wall of the selected room splits it
        if (store.selection?.kind === 'room') {
          const room = store.plan.rooms.find((r) => r.id === store.selection!.id)
          if (room) {
            const hit = nearestRoomEdge(room, viewport, { x: e.global.x, y: e.global.y }, hitRadius(8, e.pointerType))
            if (hit) {
              store.splitRoomEdge(room.id, hit.edgeIndex, hit.t)
              markDirty()
              return
            }
          }
        }
        // otherwise: refit the viewport to the whole apartment
        viewport = fitApartment(app.screen.width, app.screen.height, store.plan.apartment)
        markDirty()
      })

      const onWheel = (ev: WheelEvent) => {
        ev.preventDefault()
        const bounds = app.canvas.getBoundingClientRect()
        const point = { x: ev.clientX - bounds.left, y: ev.clientY - bounds.top }
        viewport = zoomAt(viewport, point, ev.deltaY < 0 ? 1.1 : 1 / 1.1)
        markDirty()
      }
      app.canvas.addEventListener('wheel', onWheel, { passive: false })
      cleanups.push(() => app.canvas.removeEventListener('wheel', onWheel))

      const onMiddleDown = (ev: PointerEvent) => {
        if (ev.button === 1) ev.preventDefault()
      }
      app.canvas.addEventListener('pointerdown', onMiddleDown)
      cleanups.push(() => app.canvas.removeEventListener('pointerdown', onMiddleDown))

      const onKeyDown = (ev: KeyboardEvent) => {
        altDown = ev.altKey
        shiftDown = ev.shiftKey
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && !isTypingTarget(ev)) {
          const store = usePlanStore.getState()
          if (store.selection?.kind === 'opening') store.deleteOpening(store.selection.id)
          else if (store.selection?.kind === 'room') store.deleteRoom(store.selection.id)
          else if (store.selection?.kind === 'furniture') store.deleteFurniture(store.selection.id)
          return
        }
        if (ev.key === 'Escape' && !isTypingTarget(ev)) {
          if (drag.kind !== 'idle') {
            revertDragIfColliding()
            if (drag.kind === 'resizeOpening') {
              usePlanStore.getState().updateOpening(drag.openingId, { width: drag.startWidth, offset: drag.startOffset })
            }
            drag = { kind: 'idle' }
            dragMutated = false
            guides = []
          }
          const store = usePlanStore.getState()
          if (store.placing || store.placingFurniture) {
            store.setPlacing(null)
            store.setPlacingFurniture(null)
            ghost = null
          } else store.selectRoom(null)
          hoverEdge = null
          markDirty()
          return
        }
        if (ev.code === 'Space' && !isTypingTarget(ev)) {
          spaceDown = true
          ev.preventDefault()
        }
      }
      const onKeyUp = (ev: KeyboardEvent) => {
        altDown = ev.altKey
        shiftDown = ev.shiftKey
        if (ev.code === 'Space') spaceDown = false
      }
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      cleanups.push(() => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
      })

      app.ticker.add(() => {
        if (!dirty) return
        dirty = false
        const store = usePlanStore.getState()
        drawGrid(layers.grid, viewport, app.screen.width, app.screen.height)
        drawBoundary(layers.boundary, viewport, store.plan.apartment)
        const sel = store.selection
        const selectedId = sel?.kind === 'room' ? sel.id : null
        drawRooms(layers.rooms, store.plan, selectedId, viewport)
        drawFurniture(layers.furniture, store.plan, store.selection, viewport)
        drawOpenings(layers.openings, store.plan, store.selection, viewport)
        drawEdgeHighlight(
          layers.edgeHighlight,
          store.placing || store.placingFurniture ? hoverEdge : null,
          store.plan,
          viewport,
        )
        drawFurnitureGhost(layers.ghost, store.placingFurniture ? ghost : null, viewport)
        app.canvas.style.cursor = store.placing || store.placingFurniture ? 'crosshair' : 'default'
        drawGuides(layers.guides, guides, viewport, app.screen.width, app.screen.height)
        const selectedRoom = selectedId
          ? store.plan.rooms.find((r) => r.id === selectedId)
          : undefined
        drawPolygonHandles(layers.handles, selectedRoom ?? null, viewport)
        const selectedFurnitureItem =
          sel?.kind === 'furniture' ? store.plan.furniture.find((f) => f.id === sel.id) : undefined
        const selectedFloorItem =
          selectedFurnitureItem && selectedFurnitureItem.mount === 'floor' ? selectedFurnitureItem : null
        drawRotationHandle(layers.furnitureHandles, selectedFloorItem, viewport)
      })
    })
    .catch(() => {
      useToast.getState().show('Could not initialize the 2D canvas — WebGL appears to be unavailable.')
    })

    return () => {
      destroyed = true
      cleanups.forEach((fn) => fn())
      if (app.renderer) app.destroy(true)
    }
  }, [])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
}
