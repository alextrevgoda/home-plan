import { Application, Container, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { roundCm, polygonToRect } from '../model/geometry'
import { projectOntoEdge, roomEdge } from '../model/openings'
import { collectSnapLines, snapMove, snapScalar, type SnapGuide, type SnapOptions } from '../model/snapping'
import type { Rect, Vec2 } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { useToast } from '../ui/toast'
import { applyResize, hitHandle, hitOpening, hitRoom, nearestEdge, type EdgeHit, type HandleId } from './interactions'
import { drawBoundary, drawEdgeHighlight, drawGrid, drawGuides, drawHandles, drawOpenings, drawRooms } from './render'
import { fitApartment, screenToWorld, zoomAt, type Viewport } from './viewport'

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

      const layers = {
        grid: new Graphics(),
        boundary: new Graphics(),
        rooms: new Container(),
        openings: new Graphics(),
        edgeHighlight: new Graphics(),
        guides: new Graphics(),
        handles: new Graphics(),
      }
      app.stage.addChild(
        layers.grid,
        layers.boundary,
        layers.rooms,
        layers.openings,
        layers.edgeHighlight,
        layers.guides,
        layers.handles,
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

      let panning: { lastX: number; lastY: number } | null = null
      let spaceDown = false

      type DragState =
        | { kind: 'idle' }
        | { kind: 'move'; roomId: string; grabOffset: Vec2 }
        | { kind: 'resize'; roomId: string; handle: HandleId }
        | { kind: 'moveOpening'; openingId: string }
      let drag: DragState = { kind: 'idle' }
      let hoverEdge: EdgeHit | null = null
      let guides: SnapGuide[] = []
      let altDown = false

      const snapOpts = (): SnapOptions => ({
        gridStep: 0.1,
        gridThreshold: 10 / viewport.scale,
        edgeThreshold: 10 / viewport.scale,
      })

      const otherRects = (excludeId: string): Rect[] =>
        usePlanStore
          .getState()
          .plan.rooms.filter((r) => r.id !== excludeId)
          .map((r) => polygonToRect(r.polygon))
          .filter((r): r is Rect => r !== null)

      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen

      app.stage.on('pointerdown', (e) => {
        if (e.button === 1 || spaceDown) {
          panning = { lastX: e.global.x, lastY: e.global.y }
          return
        }
        const store = usePlanStore.getState()
        const screen = { x: e.global.x, y: e.global.y }
        const world = screenToWorld(viewport, screen)

        // armed placement: click places on the nearest wall, or cancels
        if (store.placing) {
          const hit = nearestEdge(store.plan, viewport, screen)
          if (hit) store.addOpening(store.placing, hit.roomId, hit.edgeIndex, hit.offset)
          else store.setPlacing(null)
          hoverEdge = null
          markDirty()
          return
        }

        // openings are small targets on walls — they win over room bodies
        const openingId = hitOpening(store.plan, viewport, screen)
        if (openingId) {
          store.selectOpening(openingId)
          drag = { kind: 'moveOpening', openingId }
          markDirty()
          return
        }

        const sel = store.selection
        const selectedRoom =
          sel?.kind === 'room' ? store.plan.rooms.find((r) => r.id === sel.id) : undefined
        const selectedRect = selectedRoom ? polygonToRect(selectedRoom.polygon) : null
        if (selectedRoom && selectedRect) {
          const handle = hitHandle(selectedRect, viewport, screen)
          if (handle) {
            drag = { kind: 'resize', roomId: selectedRoom.id, handle }
            return
          }
        }
        const roomId = hitRoom(store.plan.rooms, world)
        store.selectRoom(roomId)
        if (roomId) {
          const rect = polygonToRect(store.plan.rooms.find((r) => r.id === roomId)!.polygon)
          if (rect) drag = { kind: 'move', roomId, grabOffset: { x: world.x - rect.x, y: world.y - rect.y } }
        }
      })

      app.stage.on('pointermove', (e) => {
        if (panning) {
          viewport = {
            ...viewport,
            offsetX: viewport.offsetX + e.global.x - panning.lastX,
            offsetY: viewport.offsetY + e.global.y - panning.lastY,
          }
          panning = { lastX: e.global.x, lastY: e.global.y }
          markDirty()
          return
        }
        const hoverStore = usePlanStore.getState()
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
          const rect = room ? polygonToRect(room.polygon) : null
          if (!rect) return

          const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          const raw: Rect = { ...rect, x: world.x - activeDrag.grabOffset.x, y: world.y - activeDrag.grabOffset.y }

          if (altDown) {
            guides = []
            store.updateRoomRect(activeDrag.roomId, raw)
          } else {
            const lines = collectSnapLines(otherRects(activeDrag.roomId), store.plan.apartment)
            const snapped = snapMove(raw, lines, snapOpts())
            guides = snapped.guides
            store.updateRoomRect(activeDrag.roomId, { ...raw, x: snapped.x, y: snapped.y })
          }
          markDirty()
        }

        if (drag.kind === 'resize') {
          const activeDrag = drag
          const store = usePlanStore.getState()
          const room = store.plan.rooms.find((r) => r.id === activeDrag.roomId)
          const rect = room ? polygonToRect(room.polygon) : null
          if (!rect) return

          let point = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
          guides = []

          if (!altDown) {
            const lines = collectSnapLines(otherRects(activeDrag.roomId), store.plan.apartment)
            const opts = snapOpts()
            if (activeDrag.handle.includes('e') || activeDrag.handle.includes('w')) {
              const sx = snapScalar(point.x, lines.xs, opts)
              point = { ...point, x: sx.value }
              if (sx.guide !== null) guides.push({ axis: 'x', position: sx.guide })
            }
            if (activeDrag.handle.includes('n') || activeDrag.handle.includes('s')) {
              const sy = snapScalar(point.y, lines.ys, opts)
              point = { ...point, y: sy.value }
              if (sy.guide !== null) guides.push({ axis: 'y', position: sy.guide })
            }
          }

          store.updateRoomRect(activeDrag.roomId, applyResize(rect, activeDrag.handle, point))
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
      })

      const endInteraction = () => {
        panning = null
        if (drag.kind !== 'idle' || guides.length > 0) {
          drag = { kind: 'idle' }
          guides = []
          markDirty()
        }
      }
      app.stage.on('pointerup', endInteraction)
      app.stage.on('pointerupoutside', endInteraction)

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
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && !isTypingTarget(ev)) {
          const store = usePlanStore.getState()
          if (store.selection?.kind === 'opening') store.deleteOpening(store.selection.id)
          else if (store.selection?.kind === 'room') store.deleteRoom(store.selection.id)
          return
        }
        if (ev.key === 'Escape' && !isTypingTarget(ev)) {
          if (drag.kind !== 'idle') {
            drag = { kind: 'idle' }
            guides = []
          }
          const store = usePlanStore.getState()
          if (store.placing) store.setPlacing(null)
          else store.selectRoom(null)
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
        drawOpenings(layers.openings, store.plan, store.selection, viewport)
        drawEdgeHighlight(layers.edgeHighlight, store.placing ? hoverEdge : null, store.plan, viewport)
        app.canvas.style.cursor = store.placing ? 'crosshair' : 'default'
        drawGuides(layers.guides, guides, viewport, app.screen.width, app.screen.height)
        const selectedRoom = selectedId
          ? store.plan.rooms.find((r) => r.id === selectedId)
          : undefined
        drawHandles(layers.handles, selectedRoom ? polygonToRect(selectedRoom.polygon) : null, viewport)
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
