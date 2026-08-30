import { DEFAULT_FONT } from "../constants/fonts"
import { DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR } from "../constants/palette"
import { plainToRuns } from "./richText"

export function createAnnouncementItem(style = {}) {
  const fontFamily = style.fontFamily ?? DEFAULT_FONT.id
  const fontSize = style.fontSize ?? 18
  const textColor = style.textColor ?? DEFAULT_TEXT_COLOR
  const bgColor = style.bgColor ?? DEFAULT_BG_COLOR
  const bold = Boolean(style.bold)
  const underline = Boolean(style.underline)
  const text = typeof style.text === "string" ? style.text : ""
  return {
    id: crypto.randomUUID(),
    fontFamily,
    fontSize,
    textColor,
    bgColor,
    bold,
    underline,
    runs: text
      ? plainToRuns(text, {
          fontFamily,
          fontSize,
          color: textColor,
          bold,
          underline,
        })
      : [],
  }
}

export function createAnnouncementState(items = []) {
  return { items }
}

/** insertSlot is 0..items.length (the gap before that index, or after the last item). */
export function reorderAnnouncements(items, fromIndex, insertSlot) {
  if (fromIndex < 0 || fromIndex >= items.length) return items
  let dest = insertSlot
  if (fromIndex < insertSlot) dest -= 1
  dest = Math.max(0, Math.min(dest, items.length - 1))
  if (dest === fromIndex) return items
  const next = [...items]
  const [row] = next.splice(fromIndex, 1)
  next.splice(dest, 0, row)
  return next
}
