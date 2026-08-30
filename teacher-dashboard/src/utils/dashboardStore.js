import { DEFAULT_DISPLAY_STYLE, normalizeDisplayStyle } from "../constants/displayStyles"
import { DEFAULT_FONT } from "../constants/fonts"
import { DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR } from "../constants/palette"
import { createAnnouncementItem, createAnnouncementState } from "./announcement"
import { createCheckboardState } from "./checkboard"
import { createNoticeState, plainToRuns } from "./richText"
import { createWidget, serializeLayout, WIDGET_PRESETS } from "./widgets"

export const DASHBOARD_STORAGE_KEY = "classtool-dashboard"
const THEME_STORAGE_KEY = "classtool-theme"
const STORAGE_VERSION = 2
export const BACKUP_KIND = "classtool-backup"

export function defaultDashboard() {
  const date = createWidget("date")
  const clock = createWidget("clock")
  const notice = createWidget("notice")
  notice.id = "widget-1"
  const checkboard = createWidget("checkboard")
  checkboard.id = "widget-2"
  const widgets = [date, clock, notice, checkboard]
  const layout = [
    { i: date.id, x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 2 },
    { i: clock.id, x: 4, y: 0, w: 4, h: 4, minW: 2, minH: 2 },
    { i: notice.id, x: 0, y: 4, w: 4, h: 10, minW: 2, minH: 2 },
    { i: checkboard.id, x: 4, y: 4, w: 4, h: 10, minW: 3, minH: 2 },
  ]
  return {
    widgets,
    layout,
    stackOrder: widgets.map((widget) => widget.id),
    layoutPresets: [],
  }
}

function hydrateAnnouncementItem(raw) {
  if (!raw || typeof raw !== "object") return null
  const item = createAnnouncementItem({
    fontFamily: raw.fontFamily,
    fontSize: raw.fontSize,
    textColor: raw.textColor,
    bold: raw.bold,
    underline: raw.underline,
  })
  const id = typeof raw.id === "string" && raw.id ? raw.id : item.id
  if (Array.isArray(raw.runs)) {
    return { ...item, id, runs: raw.runs.filter((run) => run && typeof run.text === "string") }
  }
  const text = typeof raw.text === "string" ? raw.text : ""
  return {
    ...item,
    id,
    runs: text
      ? plainToRuns(text, {
          fontFamily: item.fontFamily,
          fontSize: item.fontSize,
          color: item.textColor,
          bold: item.bold,
          underline: item.underline,
        })
      : [],
  }
}

const TITLE_RENAMES = {
  announcement: { "알림사항": "알림" },
  checkboard: { "체크판": "체크" },
}

function renamedWidgetTitle(type, title) {
  if (typeof title !== "string" || !title) return ""
  return TITLE_RENAMES[type]?.[title] ?? title
}

function hydrateWidget(raw) {
  if (!raw || typeof raw !== "object") return null
  if (!raw.id || !WIDGET_PRESETS[raw.type]) return null
  const preset = WIDGET_PRESETS[raw.type]
  const widget = {
    id: String(raw.id),
    type: raw.type,
    title: renamedWidgetTitle(raw.type, raw.title) || preset.title,
    locked: Boolean(raw.locked),
    settingsOpen: false,
    fontSize: Number(raw.fontSize) || preset.fontSize,
    fontFamily: raw.fontFamily || DEFAULT_FONT.id,
    textColor: raw.textColor || DEFAULT_TEXT_COLOR,
    bgColor: raw.bgColor || DEFAULT_BG_COLOR,
    bold: Boolean(raw.bold),
    underline: Boolean(raw.underline),
    displayStyle:
      raw.type === "date" || raw.type === "clock"
        ? normalizeDisplayStyle(raw.displayStyle) || DEFAULT_DISPLAY_STYLE
        : undefined,
  }
  if (widget.type === "notice") {
    const notice = raw.notice && typeof raw.notice === "object" ? raw.notice : {}
    widget.notice = {
      ...createNoticeState(),
      ...notice,
      schedules: Array.isArray(notice.schedules) ? notice.schedules : [],
      manualRuns: Array.isArray(notice.manualRuns) ? notice.manualRuns : [],
      savedNotices: Array.isArray(notice.savedNotices) ? notice.savedNotices : [],
      manualSavedId: typeof notice.manualSavedId === "string" ? notice.manualSavedId : null,
    }
  }
  if (widget.type === "checkboard") {
    const rawBoard = raw.checkboard && typeof raw.checkboard === "object" ? raw.checkboard : {}
    widget.checkboard = {
      ...createCheckboardState(),
      ...rawBoard,
      students: [],
    }
  }
  if (widget.type === "announcement") {
    const items = Array.isArray(raw.announcement?.items)
      ? raw.announcement.items.map(hydrateAnnouncementItem).filter(Boolean)
      : []
    widget.announcement = createAnnouncementState(items)
  }
  return widget
}

function hydrateLayout(rawLayout, widgets) {
  const ids = new Set(widgets.map((widget) => widget.id))
  const items = Array.isArray(rawLayout) ? rawLayout : []
  const kept = items
    .filter((item) => item && ids.has(item.i))
    .map((item) => {
      const type = widgets.find((widget) => widget.id === item.i)?.type
      const preset = type ? WIDGET_PRESETS[type] : null
      return {
        i: item.i,
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        w: Number(item.w) || preset?.w || 4,
        h: Number(item.h) || 10,
        minW: preset?.minW ?? 2,
        minH: preset?.minH ?? 2,
      }
    })
  const have = new Set(kept.map((item) => item.i))
  for (const widget of widgets) {
    if (have.has(widget.id)) continue
    const preset = WIDGET_PRESETS[widget.type]
    kept.push({
      i: widget.id,
      x: 0,
      y: 0,
      w: preset.w,
      h: preset.h,
      minW: preset.minW,
      minH: preset.minH,
    })
  }
  return kept
}

function hydrateLayoutItem(item) {
  if (!item || typeof item.i !== "string") return null
  return {
    i: item.i,
    x: Number(item.x) || 0,
    y: Number(item.y) || 0,
    w: Number(item.w) || 4,
    h: Number(item.h) || 10,
    minW: Number(item.minW) || 2,
    minH: Number(item.minH) || 2,
  }
}

export function hydrateLayoutPresets(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((preset) => {
      if (!preset || typeof preset !== "object") return null
      const id = typeof preset.id === "string" && preset.id ? preset.id : null
      const name = typeof preset.name === "string" ? preset.name.trim() : ""
      if (!id || !name) return null
      return {
        id,
        name,
        layout: (Array.isArray(preset.layout) ? preset.layout : [])
          .map(hydrateLayoutItem)
          .filter(Boolean),
      }
    })
    .filter(Boolean)
}

export function createLayoutPreset(name, layout) {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    layout: serializeLayout(layout),
  }
}

export function applyLayoutPreset(currentLayout, presetLayout) {
  const saved = new Map((presetLayout ?? []).map((item) => [item.i, item]))
  return currentLayout.map((item) => {
    const next = saved.get(item.i)
    if (!next) return item
    return {
      ...item,
      x: Number(next.x) || 0,
      y: Number(next.y) || 0,
      w: Number(next.w) || item.w,
      h: Number(next.h) || item.h,
    }
  })
}

export function packDashboard({ widgets, layout, stackOrder, layoutPresets }) {
  return {
    version: STORAGE_VERSION,
    widgets: widgets.map((widget) => ({ ...widget, settingsOpen: false })),
    layout: serializeLayout(layout),
    stackOrder,
    layoutPresets: hydrateLayoutPresets(layoutPresets),
  }
}

function unpackDashboard(parsed) {
  const widgets = (parsed.widgets || []).map(hydrateWidget).filter(Boolean)
  if (widgets.length === 0 && parsed.version == null) return defaultDashboard()
  const layout = hydrateLayout(parsed.layout, widgets)
  const known = new Set(widgets.map((widget) => widget.id))
  const stackOrder = (Array.isArray(parsed.stackOrder) ? parsed.stackOrder : []).filter((id) =>
    known.has(id),
  )
  for (const widget of widgets) {
    if (!stackOrder.includes(widget.id)) stackOrder.push(widget.id)
  }
  return {
    widgets,
    layout,
    stackOrder,
    layoutPresets: hydrateLayoutPresets(parsed.layoutPresets),
  }
}

export function loadDashboard() {
  try {
    const stored = localStorage.getItem(DASHBOARD_STORAGE_KEY)
    if (!stored) return defaultDashboard()
    return unpackDashboard(JSON.parse(stored))
  } catch {
    return defaultDashboard()
  }
}

export function saveDashboard(state) {
  try {
    localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(packDashboard(state)))
  } catch {
    /* private mode or quota */
  }
}

function backupFilename(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `dashboard-backup-${year}-${month}-${day}.json`
}

export function downloadDashboardBackup(state, theme) {
  const payload = {
    kind: BACKUP_KIND,
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    theme,
    dashboard: packDashboard(state),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = backupFilename()
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function restoreDashboardBackup(raw) {
  if (!raw || typeof raw !== "object") return false
  const source = raw.kind === BACKUP_KIND && raw.dashboard ? raw.dashboard : raw
  if (!Array.isArray(source.widgets)) return false
  const dashboard = unpackDashboard(source)
  try {
    localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(packDashboard(dashboard)))
    const theme = raw.theme === "light" || raw.theme === "dark" ? raw.theme : null
    if (theme) localStorage.setItem(THEME_STORAGE_KEY, theme)
    return true
  } catch {
    return false
  }
}
