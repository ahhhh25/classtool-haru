import { parseHexColor } from "../utils/hexColor"

/** Saturated Pantone-inspired text colors. `hex` is dark mode; `lightHex` is light mode. */
export const TEXT_PALETTE = [
  { id: "bright-white", hex: "#FFFFFF", lightHex: "#1C1917" },
  { id: "gold-yellow", hex: "#E8B423", lightHex: "#9A6400" },
  { id: "living-coral", hex: "#FF6F61", lightHex: "#C23128" },
  { id: "capri-blue", hex: "#00A9CE", lightHex: "#00708A" },
  { id: "amethyst", hex: "#9B5DE5", lightHex: "#6B2FB5" },
  { id: "apricot", hex: "#E87A32", lightHex: "#B54712" },
  { id: "ink-black", hex: "#111111", lightHex: "#111111" },
  { id: "ink-charcoal", hex: "#4A4A4A", lightHex: "#4A4A4A" },
  { id: "ink-gray", hex: "#7A7A7A", lightHex: "#7A7A7A" },
  { id: "ink-silver", hex: "#B5B5B5", lightHex: "#B5B5B5" },
]

export const DEFAULT_TEXT_COLOR = TEXT_PALETTE[0].hex

/** Widget card backgrounds. `hex` is dark mode; `lightHex` is light mode. */
export const BG_PALETTE = [
  { id: "default", label: "기본", hex: null, lightHex: null },
  { id: "navy", hex: "#3B5674", lightHex: "#B7C6D4" },
  { id: "forest", hex: "#3BB36A", lightHex: "#9FE6B8" },
  { id: "peach", hex: "#F08A4B", lightHex: "#FFC9A3" },
  { id: "lemon", hex: "#E8C21A", lightHex: "#FFE56A" },
  { id: "aqua", hex: "#2EC4B6", lightHex: "#8DF0E6" },
  { id: "lilac", hex: "#A06AE8", lightHex: "#D4B4FF" },
]

export const DEFAULT_BG_COLOR = BG_PALETTE[0].id

export function bgSwatchFill(swatch, theme) {
  if (!swatch.hex) return theme === "light" ? "#ffffff" : "#232328"
  return theme === "light" ? swatch.lightHex : swatch.hex
}

export function widgetBackground(bgColor, theme) {
  if (!bgColor || bgColor === DEFAULT_BG_COLOR) return null
  const swatch = BG_PALETTE.find((item) => item.id === bgColor)
  if (swatch) return swatch.hex ? bgSwatchFill(swatch, theme) : null
  return parseHexColor(bgColor)
}

function hexLuminance(hex) {
  const raw = hex.replace("#", "")
  const n = (start) => {
    const s = parseInt(raw.slice(start, start + 2), 16) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * n(0) + 0.7152 * n(2) + 0.0722 * n(4)
}

/** Near-white or near-black title color that stays readable on a widget background. */
export function chromeInkOnBackground(bgHex) {
  if (!bgHex) return null
  return hexLuminance(bgHex) > 0.45 ? "#1C1917" : "#F2F2F4"
}

const LIGHT_BY_DARK = Object.fromEntries(
  TEXT_PALETTE.map((swatch) => [swatch.hex.toUpperCase(), swatch.lightHex]),
)

export function swatchFill(swatch, theme) {
  return theme === "light" ? swatch.lightHex : swatch.hex
}

export function paletteDisplayHex(hex, theme) {
  if (!hex) return theme === "light" ? TEXT_PALETTE[0].lightHex : DEFAULT_TEXT_COLOR
  if (theme !== "light") return hex
  return LIGHT_BY_DARK[hex.toUpperCase()] ?? hex
}
