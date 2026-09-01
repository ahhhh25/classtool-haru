import { DEFAULT_FONT } from "../constants/fonts"
import { DEFAULT_TEXT_COLOR } from "../constants/palette"

export const DEFAULT_DDAY_TITLE_SIZE = 14

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function createDdayState(raw = {}) {
  const targetDate =
    typeof raw.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.targetDate)
      ? raw.targetDate
      : localDateKey()
  const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : "디데이"
  return {
    label,
    targetDate,
    titleFontSize: Number(raw.titleFontSize) || DEFAULT_DDAY_TITLE_SIZE,
    titleFontFamily: raw.titleFontFamily || DEFAULT_FONT.id,
    titleTextColor: raw.titleTextColor || DEFAULT_TEXT_COLOR,
    titleBold: Boolean(raw.titleBold),
    titleUnderline: Boolean(raw.titleUnderline),
  }
}

export function ddayTitleAsWidget(dday) {
  return {
    fontSize: dday.titleFontSize,
    fontFamily: dday.titleFontFamily,
    textColor: dday.titleTextColor,
    bold: dday.titleBold,
    underline: dday.titleUnderline,
  }
}

export function applyDdayTitlePatch(dday, patch) {
  return createDdayState({
    ...dday,
    ...(patch.fontSize != null ? { titleFontSize: patch.fontSize } : {}),
    ...(patch.fontFamily != null ? { titleFontFamily: patch.fontFamily } : {}),
    ...(patch.textColor != null ? { titleTextColor: patch.textColor } : {}),
    ...(patch.bold != null ? { titleBold: patch.bold } : {}),
    ...(patch.underline != null ? { titleUnderline: patch.underline } : {}),
  })
}

function startOfLocalDay(iso) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day).getTime()
}

export function daysUntil(targetDate) {
  const today = localDateKey()
  return Math.round((startOfLocalDay(targetDate) - startOfLocalDay(today)) / 86_400_000)
}

export function formatDdayText(targetDate) {
  const diff = daysUntil(targetDate)
  if (diff === 0) return "D-Day"
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

export function formatTargetDate(iso) {
  if (!iso) return ""
  const [year, month, day] = iso.split("-")
  if (!year || !month || !day) return iso
  return `${year}. ${month}. ${day}`
}
