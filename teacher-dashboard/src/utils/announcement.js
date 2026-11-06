import { DEFAULT_FONT } from "../constants/fonts"
import { DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR } from "../constants/palette"
import { DEFAULT_COMPOSE_FONT_SIZE, getComposeFontSize } from "./composeFontSize"
import { plainToRuns } from "./richText"

export function createAnnouncementItem(style = {}) {
  const fontFamily = style.fontFamily ?? DEFAULT_FONT.id
  const fontSize = style.fontSize ?? getComposeFontSize() ?? DEFAULT_COMPOSE_FONT_SIZE
  const textColor = style.textColor ?? DEFAULT_TEXT_COLOR
  const bgColor = style.bgColor ?? DEFAULT_BG_COLOR
  const bold = Boolean(style.bold)
  const underline = Boolean(style.underline)
  const strike = Boolean(style.strike)
  const text = typeof style.text === "string" ? style.text : ""
  return {
    id: crypto.randomUUID(),
    fontFamily,
    fontSize,
    textColor,
    bgColor,
    bold,
    underline,
    strike,
    runs: text
      ? plainToRuns(text, {
          fontFamily,
          fontSize,
          color: textColor,
          bold,
          underline,
          strike,
        })
      : [],
  }
}

export function createAnnouncementState(items = [], phrases = [], scheduled = []) {
  return { items, phrases, scheduled }
}

function pad2(value) {
  return String(value).padStart(2, "0")
}

export function formatDateInput(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function formatTimeInput(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function defaultScheduleParts(from = new Date()) {
  const next = new Date(from.getTime())
  next.setMinutes(next.getMinutes() + 60, 0, 0)
  return {
    scheduledDate: formatDateInput(next),
    scheduledTime: formatTimeInput(next),
  }
}

export function defaultExpireParts(afterMs = Date.now()) {
  const next = new Date(afterMs)
  next.setMinutes(next.getMinutes() + 60, 0, 0)
  return {
    expireDate: formatDateInput(next),
    expireTime: formatTimeInput(next),
  }
}

export function dateTimeMs(dateValue, timeValue) {
  const date = normalizeDateInput(dateValue)
  const time = normalizeTimeInput(timeValue)
  if (!date || !time) return null
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const ms = new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function normalizeDateInput(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""
}

export function normalizeTimeInput(value) {
  if (typeof value !== "string") return ""
  if (/^\d{2}:\d{2}$/.test(value)) return value
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5)
  return ""
}

export function parseDateInput(value) {
  const raw = typeof value === "string" ? value.trim() : ""
  const digits = raw.replace(/\D/g, "")
  const candidate =
    /^\d{8}$/.test(digits) && !raw.includes("-")
      ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
      : raw
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return ""
  const year = Number(candidate.slice(0, 4))
  const month = Number(candidate.slice(5, 7))
  const day = Number(candidate.slice(8, 10))
  if (month < 1 || month > 12 || day < 1 || day > 31) return ""
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ""
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`
}

export function parseTimeInput(value) {
  const raw = typeof value === "string" ? value.trim() : ""
  const digits = raw.replace(/\D/g, "")
  let candidate = raw
  if (/^\d{3,4}$/.test(digits) && !raw.includes(":")) {
    const padded = digits.padStart(4, "0")
    candidate = `${padded.slice(0, 2)}:${padded.slice(2)}`
  }
  const match = candidate.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ""
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return ""
  return `${pad2(hour)}:${pad2(minute)}`
}

export function scheduledAtMs(item) {
  return dateTimeMs(item?.scheduledDate, item?.scheduledTime)
}

export function expiresAtMs(item) {
  return dateTimeMs(item?.expireDate, item?.expireTime)
}

function formatDateTimeLabel(ms) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms))
}

export function formatScheduleLabel(item) {
  const ms = scheduledAtMs(item)
  if (ms == null) return "예약 시간 없음"
  return formatDateTimeLabel(ms)
}

export function formatExpireLabel(item) {
  const ms = expiresAtMs(item)
  if (ms == null) return ""
  return formatDateTimeLabel(ms)
}

export function hasExpire(item) {
  return expiresAtMs(item) != null
}

export function stripSchedule(item) {
  if (!item || typeof item !== "object") return item
  const { scheduledDate, scheduledTime, scheduleEnabled, expireEnabled, ...rest } = item
  return rest
}

export function attachExpire(item, source = item) {
  if (!item || typeof item !== "object") return item
  const enabled = Boolean(source?.expireEnabled)
  const next = { ...item }
  delete next.expireEnabled
  if (!enabled) {
    delete next.expireDate
    delete next.expireTime
    return next
  }
  const expireDate = normalizeDateInput(source.expireDate)
  const expireTime = normalizeTimeInput(source.expireTime)
  if (!expireDate || !expireTime) return null
  return { ...next, expireDate, expireTime }
}

export function expireStartMs(item, now = Date.now()) {
  const start = scheduledAtMs(item)
  if (item?.scheduleEnabled && start != null && start > now) return start
  return now
}

export function isExpireValid(item, now = Date.now()) {
  if (!item?.expireEnabled) return true
  const end = expiresAtMs(item)
  if (end == null) return false
  return end > expireStartMs(item, now)
}

export function toScheduledItem(item) {
  const date = normalizeDateInput(item?.scheduledDate)
  const time = normalizeTimeInput(item?.scheduledTime)
  if (!date || !time) return null
  const withExpire = attachExpire(stripSchedule(item), item)
  if (!withExpire) return null
  return {
    ...withExpire,
    scheduledDate: date,
    scheduledTime: time,
  }
}

export function toVisibleItem(item) {
  return attachExpire(stripSchedule(item), item)
}

export function isScheduledDue(item, now = Date.now()) {
  const ms = scheduledAtMs(item)
  return ms != null && ms <= now
}

export function isExpired(item, now = Date.now()) {
  const ms = expiresAtMs(item)
  return ms != null && ms <= now
}

export function applyAnnouncementLifecycle(board, now = Date.now()) {
  const items = Array.isArray(board?.items) ? board.items : []
  const scheduled = Array.isArray(board?.scheduled) ? board.scheduled : []
  const nextItems = []
  const seen = new Set()
  for (const item of items) {
    if (isExpired(item, now)) continue
    nextItems.push(item)
    seen.add(item.id)
  }
  const pending = []
  for (const item of scheduled) {
    if (!isScheduledDue(item, now)) {
      pending.push(item)
      continue
    }
    if (isExpired(item, now)) continue
    if (!seen.has(item.id)) {
      nextItems.push(stripSchedule(item))
      seen.add(item.id)
    }
  }
  const itemsSame =
    nextItems.length === items.length && nextItems.every((item, index) => item.id === items[index].id)
  const scheduledSame =
    pending.length === scheduled.length && pending.every((item, index) => item.id === scheduled[index].id)
  if (itemsSame && scheduledSame) return null
  return {
    ...board,
    items: nextItems,
    scheduled: pending,
  }
}

export function cloneAnnouncementItem(raw) {
  const item = createAnnouncementItem({
    fontFamily: raw?.fontFamily,
    fontSize: raw?.fontSize,
    textColor: raw?.textColor,
    bgColor: raw?.bgColor,
    bold: raw?.bold,
    underline: raw?.underline,
    strike: raw?.strike,
  })
  return {
    ...item,
    runs: Array.isArray(raw?.runs) ? raw.runs.map((run) => ({ ...run })) : item.runs,
  }
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
