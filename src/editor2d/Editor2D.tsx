import { Application, Container, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { polygonToRect } from '../model/geometry'
import { usePlanStore } from '../store/planStore'
import { hitRoom } from './interactions'
import { drawBoundary, drawGrid, drawHandles, drawRooms } from './render'
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
        handles: new Graphics(),
      }
      app.stage.addChild(layers.grid, layers.boundary, layers.rooms, layers.handles)

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

      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen

      app.stage.on('pointerdown', (e) => {
        if (e.button === 1 || spaceDown) {
          panning = { lastX: e.global.x, lastY: e.global.y }
          return
        }
        const store = usePlanStore.getState()
        const world = screenToWorld(viewport, { x: e.global.x, y: e.global.y })
        store.selectRoom(hitRoom(store.plan.rooms, world))
      })

      app.stage.on('pointermove', (e) => {
        if (!panning) return
        viewport = {
          ...viewport,
          offsetX: viewport.offsetX + e.global.x - panning.lastX,
          offsetY: viewport.offsetY + e.global.y - panning.lastY,
        }
        panning = { lastX: e.global.x, lastY: e.global.y }
        markDirty()
      })

      const endPan = () => {
        panning = null
      }
      app.stage.on('pointerup', endPan)
      app.stage.on('pointerupoutside', endPan)

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
