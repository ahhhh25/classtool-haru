export const DEFAULT_SHAPE_CONFIG = {
  color: "#ffffff",
  thickness: 5,
  opacity: 100,
  type: "rect",
  lineStyle: "solid",
  fillStyle: "stroke",
}

export const SHAPE_TYPES = [
  { id: "line", label: "직선" },
  { id: "arrow", label: "화살표" },
  { id: "rect", label: "사각형" },
  { id: "circle", label: "원형" },
  { id: "triangle", label: "삼각형" },
  { id: "star", label: "별" },
  { id: "trapezoid", label: "사다리꼴" },
  { id: "parallelogram", label: "평행사변형" },
  { id: "rhombus", label: "마름모" },
]

export const DRAW_COLORS = [
  "#000000",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ffffff",
]

export function newDrawId(prefix = "draw") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function serializeShapes(shapes) {
  return JSON.stringify(
    (shapes ?? []).map((shape) => {
      const { imgElement: _imgElement, originalPoints: _originalPoints, ...rest } = shape
      return rest
    }),
  )
}

export function parseShapes(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function restoreImageElements(shapes, callback) {
  let pending = 0
  let settled = false
  const finish = () => {
    if (!settled) {
      settled = true
      callback?.()
    }
  }

  shapes.forEach((shape) => {
    if (shape.type !== "image" || !shape.src || shape.imgElement) return
    pending += 1
    const img = new Image()
    img.onload = () => {
      shape.imgElement = img
      pending -= 1
      if (pending === 0) finish()
    }
    img.onerror = () => {
      pending -= 1
      if (pending === 0) finish()
    }
    img.src = shape.src
  })

  if (pending === 0) finish()
}

export function hitsShape(shape, x, y, radius = 16) {
  if (shape.type === "pen" || shape.type === "highlighter") {
    const pad = Math.max(radius, (shape.thickness ?? 1) / 2 + 8)
    return (shape.points ?? []).some((point) => Math.hypot(point.x - x, point.y - y) < pad)
  }
  if (shape.type === "image") {
    return (
      x >= shape.x - radius &&
      x <= shape.x + shape.w + radius &&
      y >= shape.y - radius &&
      y <= shape.y + shape.h + radius
    )
  }
  const minX = Math.min(shape.startX, shape.endX)
  const maxX = Math.max(shape.startX, shape.endX)
  const minY = Math.min(shape.startY, shape.endY)
  const maxY = Math.max(shape.startY, shape.endY)
  return x >= minX - radius && x <= maxX + radius && y >= minY - radius && y <= maxY + radius
}

export function findShapeAtPos(shapes, x, y, radius = 16) {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    if (hitsShape(shapes[i], x, y, radius)) return shapes[i]
  }
  return null
}

export function eraseShapesAt(shapes, x, y, radius = 16) {
  return shapes.filter((shape) => !hitsShape(shape, x, y, radius))
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
  let rot = (Math.PI / 2) * 3
  const step = Math.PI / spikes
  ctx.moveTo(cx, cy - outerRadius)
  for (let i = 0; i < spikes; i += 1) {
    ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius)
    rot += step
    ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius)
    rot += step
  }
  ctx.lineTo(cx, cy - outerRadius)
  ctx.closePath()
}

function drawSpecificShape(ctx, shape) {
  const x = shape.startX
  const y = shape.startY
  const w = shape.endX - shape.startX
  const h = shape.endY - shape.startY

  ctx.beginPath()

  switch (shape.shapeType) {
    case "line":
      ctx.moveTo(x, y)
      ctx.lineTo(shape.endX, shape.endY)
      break
    case "arrow": {
      ctx.moveTo(x, y)
      ctx.lineTo(shape.endX, shape.endY)
      ctx.stroke()
      const angle = Math.atan2(shape.endY - y, shape.endX - x)
      const headLength = Math.max(shape.thickness * 3, 15)
      ctx.beginPath()
      ctx.moveTo(shape.endX, shape.endY)
      ctx.lineTo(
        shape.endX - headLength * Math.cos(angle - Math.PI / 6),
        shape.endY - headLength * Math.sin(angle - Math.PI / 6),
      )
      ctx.lineTo(
        shape.endX - headLength * Math.cos(angle + Math.PI / 6),
        shape.endY - headLength * Math.sin(angle + Math.PI / 6),
      )
      ctx.closePath()
      ctx.fill()
      return
    }
    case "rect":
      if (shape.fillStyle === "fill") ctx.fillRect(x, y, w, h)
      else ctx.strokeRect(x, y, w, h)
      return
    case "circle": {
      const r = Math.hypot(w, h) / 2
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2)
      break
    }
    case "triangle":
      ctx.moveTo(x + w / 2, y)
      ctx.lineTo(shape.endX, shape.endY)
      ctx.lineTo(x, shape.endY)
      ctx.closePath()
      break
    case "star": {
      const outerRadius = Math.hypot(w, h) / 2
      drawStar(ctx, x + w / 2, y + h / 2, 5, outerRadius, outerRadius / 2.5)
      break
    }
    case "trapezoid":
      ctx.moveTo(x + w * 0.25, y)
      ctx.lineTo(x + w * 0.75, y)
      ctx.lineTo(shape.endX, shape.endY)
      ctx.lineTo(x, shape.endY)
      ctx.closePath()
      break
    case "parallelogram":
      ctx.moveTo(x + w * 0.25, y)
      ctx.lineTo(shape.endX, y)
      ctx.lineTo(x + w * 0.75, shape.endY)
      ctx.lineTo(x, shape.endY)
      ctx.closePath()
      break
    case "rhombus":
      ctx.moveTo(x + w / 2, y)
      ctx.lineTo(shape.endX, y + h / 2)
      ctx.lineTo(x + w / 2, shape.endY)
      ctx.lineTo(x, y + h / 2)
      ctx.closePath()
      break
    default:
      break
  }

  if (shape.fillStyle === "fill") ctx.fill()
  else ctx.stroke()
}

export function redrawAllCanvas(ctx, canvas, shapes, { tool, selectedId } = {}) {
  if (!ctx || !canvas) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  shapes.forEach((shape) => {
    ctx.save()
    ctx.globalAlpha = (shape.opacity ?? 100) / 100
    ctx.strokeStyle = shape.color
    ctx.fillStyle = shape.color
    ctx.lineWidth = shape.thickness ?? 1

    if (shape.lineStyle === "dashed") {
      ctx.setLineDash([(shape.thickness ?? 1) * 2, (shape.thickness ?? 1) * 2])
    } else {
      ctx.setLineDash([])
    }

    if (shape.type === "pen" || shape.type === "highlighter") {
      if ((shape.points?.length ?? 0) >= 2) {
        ctx.beginPath()
        ctx.moveTo(shape.points[0].x, shape.points[0].y)
        for (let i = 1; i < shape.points.length; i += 1) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y)
        }
        ctx.stroke()
      }
    } else if (shape.type === "image") {
      if (shape.imgElement) ctx.drawImage(shape.imgElement, shape.x, shape.y, shape.w, shape.h)
    } else if (shape.type === "shape") {
      drawSpecificShape(ctx, shape)
    }

    if (tool === "select" && selectedId && selectedId === shape.id) {
      ctx.save()
      ctx.strokeStyle = "#9a9aa3"
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      if (shape.type === "shape") {
        const minX = Math.min(shape.startX, shape.endX)
        const maxX = Math.max(shape.startX, shape.endX)
        const minY = Math.min(shape.startY, shape.endY)
        const maxY = Math.max(shape.startY, shape.endY)
        ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8)
        ctx.fillStyle = "#c8c8d0"
        ctx.setLineDash([])
        ctx.fillRect(shape.endX - 7, shape.endY - 7, 14, 14)
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 2
        ctx.strokeRect(shape.endX - 7, shape.endY - 7, 14, 14)
      } else if (shape.type === "image") {
        ctx.strokeRect(shape.x - 4, shape.y - 4, shape.w + 8, shape.h + 8)
        ctx.fillStyle = "#c8c8d0"
        ctx.setLineDash([])
        ctx.fillRect(shape.x + shape.w - 7, shape.y + shape.h - 7, 14, 14)
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 2
        ctx.strokeRect(shape.x + shape.w - 7, shape.y + shape.h - 7, 14, 14)
      }
      ctx.restore()
    }

    ctx.restore()
  })
}
