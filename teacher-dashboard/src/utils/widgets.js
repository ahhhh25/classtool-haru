import { DEFAULT_DISPLAY_STYLE } from "../constants/displayStyles"
import { DEFAULT_FONT } from "../constants/fonts"
import { DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR } from "../constants/palette"
import { createAnnouncementState } from "./announcement"
import { createCheckboardState } from "./checkboard"
import { createDdayState } from "./dday"
import { createNoticeState } from "./richText"

export const WIDGET_PRESETS = {
  notice: {
    title: "공지",
    fontSize: 22,
    w: 4,
    h: 10,
    minW: 2,
    minH: 2,
  },
  announcement: {
    title: "알림",
    fontSize: 18,
    w: 4,
    h: 10,
    minW: 2,
    minH: 2,
  },
  checkboard: {
    title: "체크",
    fontSize: 20,
    w: 4,
    h: 10,
    minW: 3,
    minH: 2,
  },
  date: {
    title: "날짜",
    fontSize: 22,
    w: 4,
    h: 4,
    minW: 2,
    minH: 2,
  },
  clock: {
    title: "시간",
    fontSize: 32,
    w: 4,
    h: 4,
    minW: 2,
    minH: 2,
  },
  dday: {
    title: "디데이",
    fontSize: 36,
    w: 4,
    h: 5,
    minW: 2,
    minH: 3,
  },
}

function chromeFromPreset(type, id) {
  const preset = WIDGET_PRESETS[type]
  return {
    id,
    type,
    title: preset.title,
    locked: false,
    settingsOpen: false,
    fontSize: preset.fontSize,
    fontFamily: DEFAULT_FONT.id,
    textColor: DEFAULT_TEXT_COLOR,
    bgColor: DEFAULT_BG_COLOR,
    bold: type === "dday",
    underline: false,
    displayStyle: type === "date" || type === "clock" ? DEFAULT_DISPLAY_STYLE : undefined,
  }
}

export function createWidget(type) {
  const id = crypto.randomUUID()
  const widget = chromeFromPreset(type, id)
  if (type === "notice") widget.notice = createNoticeState()
  if (type === "announcement") widget.announcement = createAnnouncementState()
  if (type === "checkboard") widget.checkboard = createCheckboardState()
  if (type === "dday") widget.dday = createDdayState()
  return widget
}

export function createLayoutItem(widget, layout) {
  const preset = WIDGET_PRESETS[widget.type]
  const step = layout.length % 5
  return {
    i: widget.id,
    x: step,
    y: step,
    w: preset.w,
    h: preset.h,
    minW: preset.minW,
    minH: preset.minH,
  }
}

export function serializeLayout(layout) {
  return layout.map((item) => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW,
    minH: item.minH,
  }))
}

export function mergeLayoutChange(previous, next) {
  const prevById = new Map(previous.map((item) => [item.i, item]))
  return next.map((item) => {
    const prev = prevById.get(item.i)
    return {
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW ?? prev?.minW ?? 2,
      minH: item.minH ?? prev?.minH ?? 2,
    }
  })
}
