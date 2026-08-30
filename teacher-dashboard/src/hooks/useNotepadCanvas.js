import { useCallback, useEffect, useRef, useState } from "react"
import {
  DEFAULT_SHAPE_CONFIG,
  eraseShapesAt,
  findShapeAtPos,
  newDrawId,
  parseShapes,
  redrawAllCanvas,
  restoreImageElements,
  serializeShapes,
} from "../utils/notepadDrawing"

export function useNotepadCanvas({ scrollerRef, editorRef, enabled, onChange }) {
  const canvasRef = useRef(null)
  const shapesRef = useRef([])
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const toolRef = useRef("text")
  const shapeConfigRef = useRef({ ...DEFAULT_SHAPE_CONFIG })
  const selectedRef = useRef(null)
  const drawingRef = useRef(false)
  const resizingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const originalRef = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const onChangeRef = useRef(onChange)

  const [tool, setToolState] = useState("text")
  const [shapeConfig, setShapeConfigState] = useState({ ...DEFAULT_SHAPE_CONFIG })
  const [shapePanelOpen, setShapePanelOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    redrawAllCanvas(ctx, canvas, shapesRef.current, {
      tool: toolRef.current,
      selectedId: selectedRef.current?.id ?? null,
    })
  }, [])

  const notifyChange = useCallback(() => {
    onChangeRef.current?.(serializeShapes(shapesRef.current))
  }, [])

  const saveDrawingState = useCallback(() => {
    undoStackRef.current.push(serializeShapes(shapesRef.current))
    redoStackRef.current = []
  }, [])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const scroller = scrollerRef.current
    const editor = editorRef.current
    if (!canvas || !scroller) return
    const editorHeight = editor ? Math.max(editor.scrollHeight, editor.offsetHeight) : 0
    const minH = Math.max(scroller.clientHeight, editorHeight, 600)
    if (editor) editor.style.minHeight = `${minH}px`
    canvas.width = scroller.clientWidth
    canvas.height = minH
    canvas.style.width = `${canvas.width}px`
    canvas.style.height = `${canvas.height}px`
    redraw()
  }, [editorRef, redraw, scrollerRef])

  const getMousePos = useCallback((event) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const width = rect.width || canvas.width || 1
    const height = rect.height || canvas.height || 1
    return {
      x: ((event.clientX - rect.left) * canvas.width) / width,
      y: ((event.clientY - rect.top) * canvas.height) / height,
    }
  }, [])

  const setTool = useCallback((next) => {
    toolRef.current = next
    setToolState(next)
    if (next !== "shape") setShapePanelOpen(false)
    if (next !== "select") {
      selectedRef.current = null
      setSelectedId(null)
    }
    redraw()
  }, [redraw])

  const setShapeProp = useCallback((key, value) => {
    const next = { ...shapeConfigRef.current, [key]: key === "thickness" || key === "opacity" ? Number(value) : value }
    shapeConfigRef.current = next
    setShapeConfigState(next)
  }, [])

  const setShapeType = useCallback((type) => {
    const next = { ...shapeConfigRef.current, type }
    shapeConfigRef.current = next
    setShapeConfigState(next)
    setTool("shape")
  }, [setTool])

  const toggleShapePanel = useCallback(() => {
    setShapePanelOpen((open) => !open)
    setTool("shape")
  }, [setTool])

  const loadShapes = useCallback(
    (raw) => {
      const parsed = parseShapes(raw)
      shapesRef.current = parsed
      undoStackRef.current = []
      redoStackRef.current = []
      selectedRef.current = null
      setSelectedId(null)
      restoreImageElements(parsed, () => {
        resizeCanvas()
        redraw()
      })
    },
    [redraw, resizeCanvas],
  )

  const getShapesJson = useCallback(() => serializeShapes(shapesRef.current), [])

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    redoStackRef.current.push(serializeShapes(shapesRef.current))
    shapesRef.current = parseShapes(undoStackRef.current.pop())
    selectedRef.current = null
    setSelectedId(null)
    restoreImageElements(shapesRef.current, () => {
      redraw()
      notifyChange()
    })
  }, [notifyChange, redraw])

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    undoStackRef.current.push(serializeShapes(shapesRef.current))
    shapesRef.current = parseShapes(redoStackRef.current.pop())
    selectedRef.current = null
    setSelectedId(null)
    restoreImageElements(shapesRef.current, () => {
      redraw()
      notifyChange()
    })
  }, [notifyChange, redraw])

  const clearDrawings = useCallback(() => {
    saveDrawingState()
    shapesRef.current = []
    selectedRef.current = null
    setSelectedId(null)
    redraw()
    notifyChange()
  }, [notifyChange, redraw, saveDrawingState])

  const addImage = useCallback(
    (dataUrl) => {
      const img = new Image()
      img.onload = () => {
        saveDrawingState()
        const scrollY = scrollerRef.current?.scrollTop ?? 0
        const w = Math.min(img.width, 300)
        const h = w / (img.width / img.height)
        const added = {
          id: newDrawId("img"),
          type: "image",
          x: 50,
          y: 50 + scrollY,
          w,
          h,
          src: dataUrl,
          opacity: 100,
          imgElement: img,
        }
        shapesRef.current = [...shapesRef.current, added]
        selectedRef.current = added
        setSelectedId(added.id)
        setTool("select")
        redraw()
        notifyChange()
      }
      img.src = dataUrl
    },
    [notifyChange, redraw, saveDrawingState, scrollerRef, setTool],
  )

  const deleteSelected = useCallback(() => {
    if (toolRef.current !== "select" || !selectedRef.current) return false
    saveDrawingState()
    shapesRef.current = shapesRef.current.filter((shape) => shape.id !== selectedRef.current.id)
    selectedRef.current = null
    setSelectedId(null)
    redraw()
    notifyChange()
    return true
  }, [notifyChange, redraw, saveDrawingState])

  useEffect(() => {
    toolRef.current = tool
    const canvas = canvasRef.current
    const editor = editorRef.current
    if (!canvas || !editor) return
    if (tool === "text") {
      canvas.classList.add("pointer-events-none")
      canvas.style.zIndex = "20"
      editor.style.zIndex = "30"
      editor.style.pointerEvents = "auto"
    } else {
      canvas.classList.remove("pointer-events-none")
      canvas.style.zIndex = "30"
      editor.style.zIndex = "10"
      editor.style.pointerEvents = "none"
    }
  }, [editorRef, tool])

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    const startDrawing = (event) => {
      if (event.target?.closest?.("#drawing-shape-popup")) return
      const pos = getMousePos(event)
      const currentTool = toolRef.current

      if (currentTool === "select") {
        if (selectedRef.current?.type === "shape") {
          if (Math.hypot(selectedRef.current.endX - pos.x, selectedRef.current.endY - pos.y) < 22) {
            drawingRef.current = true
            resizingRef.current = true
            dragStartRef.current = pos
            return
          }
        }
        if (selectedRef.current?.type === "image") {
          const handleX = selectedRef.current.x + selectedRef.current.w
          const handleY = selectedRef.current.y + selectedRef.current.h
          if (Math.hypot(handleX - pos.x, handleY - pos.y) < 22) {
            drawingRef.current = true
            resizingRef.current = true
            originalRef.current = {
              x: selectedRef.current.x,
              y: selectedRef.current.y,
              w: selectedRef.current.w,
              h: selectedRef.current.h,
            }
            return
          }
        }
        const hit = findShapeAtPos(shapesRef.current, pos.x, pos.y)
        selectedRef.current = hit
        setSelectedId(hit?.id ?? null)
        if (hit) {
          drawingRef.current = true
          dragStartRef.current = pos
          if (hit.type === "pen" || hit.type === "highlighter") {
            hit.originalPoints = JSON.parse(JSON.stringify(hit.points))
          } else if (hit.type === "image") {
            originalRef.current = { x: hit.x, y: hit.y, w: hit.w, h: hit.h }
          } else {
            originalRef.current = {
              x: hit.startX,
              y: hit.startY,
              w: hit.endX - hit.startX,
              h: hit.endY - hit.startY,
            }
          }
        }
        redraw()
        return
      }

      if (currentTool === "eraser") {
        drawingRef.current = true
        saveDrawingState()
        const next = eraseShapesAt(shapesRef.current, pos.x, pos.y)
        if (next.length !== shapesRef.current.length) {
          shapesRef.current = next
          selectedRef.current = null
          setSelectedId(null)
          redraw()
        }
        return
      }

      drawingRef.current = true
      dragStartRef.current = pos
      const config = shapeConfigRef.current

      if (currentTool === "pen") {
        saveDrawingState()
        shapesRef.current = [
          ...shapesRef.current,
          {
            id: newDrawId(),
            type: "pen",
            color: config.color,
            thickness: config.thickness,
            opacity: config.opacity,
            points: [pos],
          },
        ]
      } else if (currentTool === "shape") {
        saveDrawingState()
        shapesRef.current = [
          ...shapesRef.current,
          {
            id: newDrawId(),
            type: "shape",
            shapeType: config.type,
            color: config.color,
            thickness: config.thickness,
            opacity: config.opacity,
            lineStyle: config.lineStyle,
            fillStyle: config.fillStyle,
            startX: pos.x,
            startY: pos.y,
            endX: pos.x,
            endY: pos.y,
          },
        ]
      }
    }

    const draw = (event) => {
      if (!drawingRef.current) return
      const pos = getMousePos(event)
      const currentTool = toolRef.current
      const selected = selectedRef.current

      if (currentTool === "eraser") {
        const next = eraseShapesAt(shapesRef.current, pos.x, pos.y)
        if (next.length !== shapesRef.current.length) {
          shapesRef.current = next
          selectedRef.current = null
          setSelectedId(null)
          redraw()
        }
        return
      }

      if (currentTool === "select" && selected) {
        if (resizingRef.current && selected.type === "image") {
          const ratio = originalRef.current.w / (originalRef.current.h || 1)
          const nextW = Math.max(32, pos.x - selected.x)
          selected.w = nextW
          selected.h = nextW / ratio
        } else if (resizingRef.current) {
          selected.endX = pos.x
          selected.endY = pos.y
        } else {
          const dx = pos.x - dragStartRef.current.x
          const dy = pos.y - dragStartRef.current.y
          if (selected.type === "pen" || selected.type === "highlighter") {
            selected.points = selected.originalPoints.map((point) => ({
              x: point.x + dx,
              y: point.y + dy,
            }))
          } else if (selected.type === "image") {
            selected.x = originalRef.current.x + dx
            selected.y = originalRef.current.y + dy
          } else {
            selected.startX = originalRef.current.x + dx
            selected.startY = originalRef.current.y + dy
            selected.endX = selected.startX + originalRef.current.w
            selected.endY = selected.startY + originalRef.current.h
          }
        }
        redraw()
        return
      }

      const active = shapesRef.current[shapesRef.current.length - 1]
      if ((currentTool === "pen" || currentTool === "highlighter") && active) {
        active.points.push(pos)
        redraw()
      } else if (currentTool === "shape" && active?.type === "shape") {
        active.endX = pos.x
        active.endY = pos.y
        redraw()
      }
    }

    const stopDrawing = () => {
      if (!drawingRef.current) return
      drawingRef.current = false
      resizingRef.current = false
      if (selectedRef.current?.type === "shape") {
        selectedRef.current.originalWidth = selectedRef.current.endX - selectedRef.current.startX
        selectedRef.current.originalHeight = selectedRef.current.endY - selectedRef.current.startY
      }
      redraw()
      notifyChange()
    }

    const onTouchStart = (event) => {
      const touch = event.touches[0]
      startDrawing({
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: event.target,
        preventDefault: () => event.preventDefault(),
      })
      event.preventDefault()
    }
    const onTouchMove = (event) => {
      const touch = event.touches[0]
      draw({ clientX: touch.clientX, clientY: touch.clientY })
      event.preventDefault()
    }

    canvas.addEventListener("mousedown", startDrawing)
    canvas.addEventListener("mousemove", draw)
    canvas.addEventListener("mouseup", stopDrawing)
    canvas.addEventListener("mouseleave", stopDrawing)
    canvas.addEventListener("touchstart", onTouchStart, { passive: false })
    canvas.addEventListener("touchmove", onTouchMove, { passive: false })
    canvas.addEventListener("touchend", stopDrawing)

    return () => {
      canvas.removeEventListener("mousedown", startDrawing)
      canvas.removeEventListener("mousemove", draw)
      canvas.removeEventListener("mouseup", stopDrawing)
      canvas.removeEventListener("mouseleave", stopDrawing)
      canvas.removeEventListener("touchstart", onTouchStart)
      canvas.removeEventListener("touchmove", onTouchMove)
      canvas.removeEventListener("touchend", stopDrawing)
    }
  }, [enabled, getMousePos, notifyChange, redraw, saveDrawingState])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return
      if (toolRef.current !== "select" || !selectedRef.current) return
      const editor = editorRef.current
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && editor && editor.contains(sel.anchorNode)) return
      const active = document.activeElement
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return
      event.preventDefault()
      deleteSelected()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [deleteSelected, editorRef, enabled])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setTimeout(resizeCanvas, 50)
    resizeCanvas()
    const scroller = scrollerRef.current
    window.addEventListener("resize", resizeCanvas)
    let observer
    if (scroller && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => resizeCanvas())
      observer.observe(scroller)
    }
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("resize", resizeCanvas)
      observer?.disconnect()
    }
  }, [enabled, resizeCanvas, scrollerRef])

  return {
    canvasRef,
    tool,
    setTool,
    shapeConfig,
    setShapeProp,
    setShapeType,
    shapePanelOpen,
    toggleShapePanel,
    selectedId,
    loadShapes,
    getShapesJson,
    undo,
    redo,
    clearDrawings,
    addImage,
    resizeCanvas,
  }
}
