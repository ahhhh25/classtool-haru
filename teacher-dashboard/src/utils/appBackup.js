import { BACKUP_KIND, packDashboard, restoreDashboardBackup } from "./dashboardStore"
import { THEME_STORAGE_KEY } from "../theme/ThemeProvider"
import { safeStorage } from "./safeStorage"

export const APP_BACKUP_KIND = "haru-backup"

export const APP_TOOL_KEYS = {
  notes: "edu_notes_v1",
  notices: "edu_notices_v1",
  students: "edu_students_v1",
  publishUrl: "edu_notice_publish_url",
  pickerPrefs: "edu_picker_prefs_v1",
}

function readStoredJson(key) {
  const raw = safeStorage.getItem(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function backupFilename(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `haru-backup-${year}-${month}-${day}.json`
}

export function downloadAppBackup(state, theme) {
  const tools = Object.fromEntries(
    Object.entries(APP_TOOL_KEYS).map(([name, key]) => [name, readStoredJson(key)]),
  )
  const payload = {
    kind: APP_BACKUP_KIND,
    version: 3,
    exportedAt: new Date().toISOString(),
    theme,
    dashboard: packDashboard(state),
    tools,
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

export function restoreAppBackup(raw) {
  if (!raw || typeof raw !== "object") return false
  if (raw.kind === APP_BACKUP_KIND) {
    const dashboardOk = restoreDashboardBackup({
      kind: BACKUP_KIND,
      theme: raw.theme,
      dashboard: raw.dashboard,
    })
    if (!dashboardOk && raw.dashboard) return false
    const tools = raw.tools && typeof raw.tools === "object" ? raw.tools : {}
    Object.entries(APP_TOOL_KEYS).forEach(([name, key]) => {
      if (tools[name] === undefined) return
      if (tools[name] == null) {
        try {
          localStorage.removeItem(key)
        } catch {
          /* ignore */
        }
        return
      }
      safeStorage.setItem(key, JSON.stringify(tools[name]))
    })
    const theme = raw.theme === "light" || raw.theme === "dark" ? raw.theme : null
    if (theme) safeStorage.setItem(THEME_STORAGE_KEY, theme)
    return true
  }
  return restoreDashboardBackup(raw)
}
