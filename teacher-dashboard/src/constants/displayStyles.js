export const CLOCK_STYLES = [
  { id: "a", label: "24시간", sample: "14:30:45" },
  { id: "b", label: "12시간", sample: "PM 02:30" },
  { id: "c", label: "스택", sample: "14 / 30" },
  { id: "d", label: "초 강조", sample: "14:30 +45" },
]

export const DATE_STYLES = [
  { id: "a", label: "숫자", sample: "08. 23. (일)" },
  { id: "b", label: "한글", sample: "8월 23일 일요일" },
  { id: "c", label: "영문", sample: "Sun, Aug 23" },
  { id: "d", label: "요일 강조", sample: "일요일" },
]

export const DEFAULT_DISPLAY_STYLE = "a"

const KO_WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
const KO_WEEKDAYS_SHORT = ["일", "월", "화", "수", "목", "금", "토"]
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function pad2(value) {
  return String(value).padStart(2, "0")
}

export function normalizeDisplayStyle(value) {
  return value === "b" || value === "c" || value === "d" ? value : DEFAULT_DISPLAY_STYLE
}

export function formatClockParts(date) {
  const hours24 = date.getHours()
  const minutes = pad2(date.getMinutes())
  const seconds = pad2(date.getSeconds())
  const hours12 = hours24 % 12 || 12
  return {
    hours24: pad2(hours24),
    hours12: pad2(hours12),
    minutes,
    seconds,
    period: hours24 < 12 ? "AM" : "PM",
  }
}

export function formatDateParts(date) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = date.getDay()
  return {
    month,
    day,
    monthPad: pad2(month),
    dayPad: pad2(day),
    weekdayKo: KO_WEEKDAYS[weekday],
    weekdayKoShort: KO_WEEKDAYS_SHORT[weekday],
    weekdayEn: EN_WEEKDAYS[weekday],
    monthEn: EN_MONTHS[date.getMonth()],
  }
}

export function clockFitKey(date, style) {
  const parts = formatClockParts(date)
  if (style === "b") return `${parts.period}${parts.hours12}${parts.minutes}`
  if (style === "c") return `${parts.hours24}${parts.minutes}`
  if (style === "d") return `${parts.hours24}${parts.minutes}`
  return `${parts.hours24}${parts.minutes}${parts.seconds}`
}

export function dateFitKey(date, style) {
  const parts = formatDateParts(date)
  if (style === "a") return `${parts.monthPad}${parts.dayPad}${parts.weekdayKoShort}`
  if (style === "c") return `${parts.weekdayEn}${parts.monthEn}${parts.day}`
  if (style === "d") return `${parts.weekdayKo}${parts.month}${parts.day}`
  return `${parts.month}${parts.day}${parts.weekdayKo}`
}
