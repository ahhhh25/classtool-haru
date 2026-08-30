/** Saturated Pantone-inspired text colors. `hex` is dark mode; `lightHex` is light mode. */
export const TEXT_PALETTE = [
  { id: "bright-white", hex: "#FFFFFF", lightHex: "#1C1917" },
  { id: "gold-yellow", hex: "#E8B423", lightHex: "#9A6400" },
  { id: "living-coral", hex: "#FF6F61", lightHex: "#C23128" },
  { id: "capri-blue", hex: "#00A9CE", lightHex: "#00708A" },
  { id: "amethyst", hex: "#9B5DE5", lightHex: "#6B2FB5" },
  { id: "apricot", hex: "#E87A32", lightHex: "#B54712" },
]

export const DEFAULT_TEXT_COLOR = TEXT_PALETTE[0].hex

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
