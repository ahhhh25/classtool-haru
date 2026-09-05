export function parseHexColor(value) {
  const raw = String(value ?? "").trim()
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  return `#${hex.toUpperCase()}`
}

export function sameHex(a, b) {
  const left = parseHexColor(a)
  const right = parseHexColor(b)
  return Boolean(left && right && left === right)
}

export function hexToRgb(value) {
  const hex = parseHexColor(value)
  if (!hex) return null
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

export function rgbToHex(r, g, b) {
  const clamp = (channel) => {
    const n = Number(channel)
    if (!Number.isFinite(n)) return null
    return Math.max(0, Math.min(255, Math.round(n)))
  }
  const red = clamp(r)
  const green = clamp(g)
  const blue = clamp(b)
  if (red == null || green == null || blue == null) return null
  return `#${[red, green, blue].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`
}

export function hexForColorInput(value, fallback = "#FFFFFF") {
  return (parseHexColor(value) || fallback).toLowerCase()
}
