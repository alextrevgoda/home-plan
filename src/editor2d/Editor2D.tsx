import { Application, Container, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { polygonToRect } from '../model/geometry'
import { collectSnapLines, snapMove, snapScalar, type SnapGuide, type SnapOptions } from '../model/snapping'
import type { Rect, Vec2 } from '../model/types'
import { usePlanStore } from '../store/planStore'
import { applyResize, hitHandle, hitRoom, type HandleId } from './interactions'
import { drawBoundary, drawGrid, drawGuides, drawHandles, drawRooms } from './render'
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
        guides: new Graphics(),
        handles: new Graphics(),
      }
      app.stage.addChild(layers.grid, layers.boundary, layers.rooms, layers.guides, layers.handles)

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
      let drag: DragState = { kind: 'idle' }
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

        const selected = store.selectedRoomId
          ? store.plan.rooms.find((r) => r.id === store.selectedRoomId)
          : undefined
        const selectedRect = selected ? polygonToRect(selected.polygon) : null
        if (selected && selectedRect) {
          const handle = hitHandle(selectedRect, viewport, { x: e.global.x, y: e.global.y })
          if (handle) {
            drag = { kind: 'resize', roomId: selected.id, handle }
            return
          }
        }

        const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
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
          if (store.selectedRoomId) store.deleteRoom(store.selectedRoomId)
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
        drawRooms(layers.rooms, store.plan, store.selectedRoomId, viewport)
        drawGuides(layers.guides, guides, viewport, app.screen.width, app.screen.height)
        const selected = store.plan.rooms.find((r) => r.id === store.selectedRoomId)
        drawHandles(layers.handles, selected ? polygonToRect(selected.polygon) : null, viewport)
      })
    })

    return () => {
      destroyed = true
      cleanups.forEach((fn) => fn())
      if (app.renderer) app.destroy(true)
    }
  }, [])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
}
