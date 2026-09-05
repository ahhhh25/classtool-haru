import { safeStorage } from "./safeStorage"

export const DEFAULT_COMPOSE_FONT_SIZE = 50
const STORAGE_KEY = "classtool-compose-font-size"

export function getComposeFontSize() {
  const size = Number(safeStorage.getItem(STORAGE_KEY))
  return Number.isFinite(size) && size > 0 ? size : DEFAULT_COMPOSE_FONT_SIZE
}

export function setComposeFontSize(size) {
  const next = Number(size)
  if (!Number.isFinite(next) || next <= 0) return
  safeStorage.setItem(STORAGE_KEY, String(next))
}
