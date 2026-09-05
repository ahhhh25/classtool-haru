import { parseHexColor } from "./hexColor"
import { loadJson, saveJson } from "./safeStorage"

export const RECENT_COLOR_LIMIT = 8

const STORAGE_KEYS = {
  text: "classtool-recent-text-colors",
  bg: "classtool-recent-bg-colors",
  draw: "classtool-recent-draw-colors",
}

export function loadRecentColors(kind) {
  const key = STORAGE_KEYS[kind]
  if (!key) return []
  const raw = loadJson(key, [])
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const next = []
  for (const item of raw) {
    const hex = parseHexColor(item)
    if (!hex || seen.has(hex)) continue
    seen.add(hex)
    next.push(hex)
    if (next.length >= RECENT_COLOR_LIMIT) break
  }
  return next
}

export function rememberRecentColor(kind, value) {
  const key = STORAGE_KEYS[kind]
  const hex = parseHexColor(value)
  if (!key || !hex) return loadRecentColors(kind)
  const next = [hex, ...loadRecentColors(kind).filter((item) => item !== hex)].slice(
    0,
    RECENT_COLOR_LIMIT,
  )
  saveJson(key, next)
  return next
}
