export const LINE_HEIGHT_OPTIONS = [
  { value: "0.5", label: "극좁게 (0.5배)" },
  { value: "0.6", label: "아주 좁게 (0.6배)" },
  { value: "0.7", label: "더 좁게 (0.7배)" },
  { value: "0.8", label: "매우 좁게 (0.8배)" },
  { value: "1.0", label: "좁게 (1.0배)" },
  { value: "1.2", label: "조금 좁게 (1.2배)" },
  { value: "normal", label: "보통" },
  { value: "1.5", label: "1.5배" },
  { value: "1.8", label: "1.8배" },
  { value: "2.0", label: "2.0배" },
  { value: "2.5", label: "2.5배" },
]

export const LINE_HEIGHT_MIN = 0.5
export const LINE_HEIGHT_MAX = 2.5
export const LINE_HEIGHT_STEP = 0.05

export function parseLineHeight(value) {
  if (!value || value === "normal") return 1
  const number = Number(value)
  return Number.isFinite(number) ? number : 1
}

export function formatLineHeight(value) {
  const clamped = Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, value))
  return String(Math.round(clamped * 100) / 100)
}

export function nudgeLineHeight(value, direction) {
  return formatLineHeight(parseLineHeight(value) + direction * LINE_HEIGHT_STEP)
}
