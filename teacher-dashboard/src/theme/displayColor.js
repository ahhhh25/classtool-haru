import { paletteDisplayHex } from "../constants/palette"

const LIGHT_INK_FALLBACKS = new Set(["#FFF", "#F2F2F4", "#E8E8ED", "#C8C8D0"])

/** Resolve a stored (dark) palette hex to the color that should paint in the current theme. */
export function contentColor(hex, theme) {
  if (!hex) return paletteDisplayHex(hex, theme)
  if (theme === "light" && LIGHT_INK_FALLBACKS.has(hex.toUpperCase())) {
    return paletteDisplayHex("#FFFFFF", theme)
  }
  return paletteDisplayHex(hex, theme)
}
