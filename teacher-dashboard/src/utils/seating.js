import { loadJson, saveJson } from "./safeStorage"

export const SEATING_SETTINGS_KEY = "haru-seating-v1"
export const SEATING_HISTORY_KEY = "haru-seating-history-v1"
export const MAX_SEATING_RECORDS = 5

const LEGACY_SETTINGS_KEY = "classroomSettings"
const LEGACY_HISTORY_KEY = "arrangementHistory"

export function seatKey(row, col) {
  return `${row}_${col}`
}

export function parseSeatKey(key) {
  const [row, col] = String(key).split("_").map(Number)
  return { row, col }
}

export function clampGrid(value, fallback = 6) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(10, Math.round(n)))
}

export function defaultSeatingSettings() {
  return {
    layoutType: "pair",
    rows: 6,
    cols: 6,
    fixedSeats: {},
    seatGenders: {},
    disabledSeats: [],
    separationGroups: [],
    frontRowStudents: [],
    pairPrevention: true,
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {}
}

function asIdList(value) {
  if (!Array.isArray(value)) return []
  return value.map((id) => String(id)).filter(Boolean)
}

function normalizeSettings(raw) {
  const base = defaultSeatingSettings()
  if (!raw || typeof raw !== "object") return base
  return {
    layoutType: raw.layoutType === "exam" ? "exam" : "pair",
    rows: clampGrid(raw.rows, 6),
    cols: clampGrid(raw.cols, 6),
    fixedSeats: asObject(raw.fixedSeats),
    seatGenders: asObject(raw.seatGenders),
    disabledSeats: Array.isArray(raw.disabledSeats) ? raw.disabledSeats.map(String) : [],
    separationGroups: Array.isArray(raw.separationGroups)
      ? raw.separationGroups.map(asIdList)
      : [],
    frontRowStudents: asIdList(raw.frontRowStudents),
    pairPrevention: raw.pairPrevention !== false,
  }
}

function inBounds(key, rows, cols) {
  const { row, col } = parseSeatKey(key)
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < rows && col < cols
}

export function pruneSeatingToGrid(settings) {
  const next = normalizeSettings(settings)
  const keep = (key) => inBounds(key, next.rows, next.cols)
  next.fixedSeats = Object.fromEntries(Object.entries(next.fixedSeats).filter(([key]) => keep(key)))
  next.seatGenders = Object.fromEntries(Object.entries(next.seatGenders).filter(([key]) => keep(key)))
  next.disabledSeats = next.disabledSeats.filter(keep)
  return next
}

export function pruneStudentRefs(settings, studentIds) {
  const ids = new Set(studentIds)
  const next = pruneSeatingToGrid(settings)
  next.fixedSeats = Object.fromEntries(Object.entries(next.fixedSeats).filter(([, id]) => ids.has(id)))
  next.separationGroups = next.separationGroups.map((group) => group.filter((id) => ids.has(id)))
  next.frontRowStudents = next.frontRowStudents.filter((id) => ids.has(id))
  return next
}

export function loadSeatingSettings() {
  const stored = loadJson(SEATING_SETTINGS_KEY, null)
  if (stored) return pruneSeatingToGrid(stored)
  const legacy = loadJson(LEGACY_SETTINGS_KEY, null)
  if (legacy) {
    const migrated = pruneSeatingToGrid(legacy)
    saveSeatingSettings(migrated)
    return migrated
  }
  return defaultSeatingSettings()
}

export function saveSeatingSettings(settings) {
  const next = pruneSeatingToGrid(settings)
  saveJson(SEATING_SETTINGS_KEY, next)
  return next
}

function normalizeRecord(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null
  return {
    id: String(raw.id || `rec-${index}`),
    date: raw.date || new Date().toISOString(),
    name: typeof raw.name === "string" ? raw.name : "",
    seatMap: asObject(raw.seatMap),
    useForPrevention: raw.useForPrevention === true,
  }
}

export function loadSeatingHistory() {
  const stored = loadJson(SEATING_HISTORY_KEY, null)
  if (Array.isArray(stored)) return stored.map(normalizeRecord).filter(Boolean)
  const legacy = loadJson(LEGACY_HISTORY_KEY, null)
  if (Array.isArray(legacy)) {
    const migrated = legacy.map(normalizeRecord).filter(Boolean)
    saveSeatingHistory(migrated)
    return migrated
  }
  return []
}

export function saveSeatingHistory(records) {
  const next = (Array.isArray(records) ? records : []).map(normalizeRecord).filter(Boolean)
  saveJson(SEATING_HISTORY_KEY, next)
  return next
}

export function getColumnGroups(layoutType, cols) {
  const groups = []
  if (layoutType === "pair") {
    for (let col = 0; col < cols; col += 2) {
      groups.push(col + 1 < cols ? [col, col + 1] : [col])
    }
  } else {
    for (let col = 0; col < cols; col += 1) groups.push([col])
  }
  return groups
}

export function getDisplayGroups(groups, teacherView) {
  if (teacherView) return groups
  return [...groups].reverse().map((cols) => [...cols].reverse())
}

export function getRowOrder(rows, teacherView) {
  return teacherView
    ? Array.from({ length: rows }, (_, i) => rows - 1 - i)
    : Array.from({ length: rows }, (_, i) => i)
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function getPairKey(key) {
  const { row, col } = parseSeatKey(key)
  const pairCol = col % 2 === 0 ? col + 1 : col - 1
  return seatKey(row, pairCol)
}

function getAdjacentKeys(key, rows, cols) {
  const { row, col } = parseSeatKey(key)
  const adj = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const nr = row + dr
      const nc = col + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) adj.push(seatKey(nr, nc))
    }
  }
  return adj
}

export function arrangeStudents({
  students,
  rows,
  cols,
  disabledSeats,
  fixedSeats,
  seatGenders,
  separationGroups,
  frontRowStudents,
  pairPrevention,
  recentArrangements,
}) {
  const disabled = new Set(disabledSeats || [])
  const seatMap = {}
  const frontSeats = []
  const otherSeats = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = seatKey(row, col)
      if (disabled.has(key)) continue
      if (fixedSeats?.[key]) {
        seatMap[key] = fixedSeats[key]
        continue
      }
      if (row < 2) frontSeats.push(key)
      else otherSeats.push(key)
    }
  }

  const assigned = new Set(Object.values(seatMap))
  const unassigned = (students || []).filter((student) => student?.id && !assigned.has(student.id))
  const frontIdSet = new Set(frontRowStudents || [])
  const frontStudents = shuffle(unassigned.filter((student) => frontIdSet.has(student.id)))
  const remainingStudents = shuffle(unassigned.filter((student) => !frontIdSet.has(student.id)))
  shuffle(frontSeats)
  shuffle(otherSeats)

  const checkSeparation = (studentId, key) => {
    const adj = getAdjacentKeys(key, rows, cols)
    for (const group of separationGroups || []) {
      if (!group.includes(studentId)) continue
      for (const adjKey of adj) {
        const neighbor = seatMap[adjKey]
        if (neighbor && group.includes(neighbor)) return false
      }
    }
    return true
  }

  const checkSeatGender = (studentId, key) => {
    const student = students.find((item) => item.id === studentId)
    if (!student) return false
    const required = seatGenders?.[key]
    if (required && student.gender !== required) return false
    return true
  }

  const checkPairPrevention = (studentId, key) => {
    if (!pairPrevention || !recentArrangements?.length) return true
    const pairStudentId = seatMap[getPairKey(key)]
    if (!pairStudentId) return true
    const selected = recentArrangements.filter((record) => record.useForPrevention === true)
    if (selected.length === 0) return true
    for (const record of selected) {
      const prev = record.seatMap || {}
      for (const [prevKey, prevId] of Object.entries(prev)) {
        if (prevId === studentId && prev[getPairKey(prevKey)] === pairStudentId) return false
        if (prevId === pairStudentId && prev[getPairKey(prevKey)] === studentId) return false
      }
    }
    return true
  }

  const tryAssign = (student, seats, relaxLevel) => {
    for (let i = 0; i < seats.length; i += 1) {
      const seat = seats[i]
      if (seatMap[seat]) continue
      if (!checkSeatGender(student.id, seat)) continue
      let ok = true
      if (relaxLevel < 1 && !checkSeparation(student.id, seat)) ok = false
      if (relaxLevel < 2 && !checkPairPrevention(student.id, seat)) ok = false
      if (ok) {
        seatMap[seat] = student.id
        seats.splice(i, 1)
        return true
      }
    }
    return false
  }

  const unplacedFront = []
  for (const student of frontStudents) {
    let placed = false
    for (let relax = 0; relax <= 3; relax += 1) {
      if (tryAssign(student, frontSeats, relax)) {
        placed = true
        break
      }
    }
    if (!placed) unplacedFront.push(student)
  }

  const leftoverSeats = [...frontSeats, ...otherSeats]
  for (const student of [...unplacedFront, ...remainingStudents]) {
    for (let relax = 0; relax <= 3; relax += 1) {
      if (tryAssign(student, leftoverSeats, relax)) break
    }
  }

  return seatMap
}

export function mergeImportedStudents(current, incoming) {
  if (!Array.isArray(incoming)) return { students: current, idMap: {} }
  const idMap = {}
  const next = current.map((student) => ({ ...student }))
  incoming.forEach((raw, index) => {
    const name = String(raw?.name || "").trim()
    if (!name) return
    const incomingId = String(raw?.id || `imported-${index}`)
    const gender = raw?.gender === "M" || raw?.gender === "F" ? raw.gender : null
    const byId = next.find((student) => student.id === incomingId)
    const byName = next.find((student) => student.name === name)
    if (byId) {
      idMap[incomingId] = byId.id
      if (gender && !byId.gender) byId.gender = gender
      return
    }
    if (byName) {
      idMap[incomingId] = byName.id
      if (gender && !byName.gender) byName.gender = gender
      return
    }
    const created = { id: incomingId, name, gender }
    next.push(created)
    idMap[incomingId] = created.id
  })
  return { students: next, idMap }
}

export function remapSeatIds(map, idMap) {
  return Object.fromEntries(
    Object.entries(asObject(map))
      .map(([key, id]) => [key, idMap[id] || id])
      .filter(([, id]) => id),
  )
}

export function buildSeatingExport(settings, history, extra = {}) {
  return {
    kind: "haru-seating",
    version: 1,
    ...settings,
    disabledSeats: [...(settings.disabledSeats || [])],
    recentArrangements: history,
    exportDate: new Date().toISOString(),
    ...extra,
  }
}

function cssVar(name, fallback) {
  if (typeof document === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function downloadArrangementPng({ record, students, rows, cols, layoutType }) {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return false

  const cellWidth = 120
  const cellHeight = 72
  const padding = 48
  const groups = getColumnGroups(layoutType, cols)
  const groupWidth = Math.max(...groups.map((group) => group.length)) * (cellWidth + 12)
  const totalWidth = groups.length * (groupWidth + 24) + padding * 2
  const totalHeight = rows * (cellHeight + 12) + padding * 2 + 96

  canvas.width = totalWidth
  canvas.height = totalHeight

  const bg = cssVar("--app", "#1a1a1d")
  const surface = cssVar("--widget", "#232328")
  const ink = cssVar("--ink", "#f2f2f4")
  const muted = cssVar("--muted", "#a8a8b3")
  const accent = cssVar("--accent", "#3b7bb8")
  const line = cssVar("--line-strong", "rgba(255,255,255,0.22)")

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const title = record.name || new Date(record.date).toLocaleString("ko-KR")
  ctx.fillStyle = ink
  ctx.font = "bold 28px Paperlogy, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText(title, canvas.width / 2, 40)

  ctx.fillStyle = accent
  ctx.fillRect(padding, padding + 28, canvas.width - padding * 2, 36)
  ctx.fillStyle = cssVar("--accent-ink", "#f4f8fc")
  ctx.font = "bold 16px Paperlogy, sans-serif"
  ctx.fillText("칠 판", canvas.width / 2, padding + 52)

  let x = padding
  groups.forEach((groupCols) => {
    let y = padding + 80
    for (let row = rows - 1; row >= 0; row -= 1) {
      let groupX = x
      groupCols.forEach((col) => {
        const key = seatKey(row, col)
        const studentId = record.seatMap?.[key]
        const student = studentId ? students.find((item) => item.id === studentId) : null
        ctx.fillStyle = student ? surface : cssVar("--sunken", "#151518")
        ctx.fillRect(groupX, y, cellWidth, cellHeight)
        ctx.strokeStyle = line
        ctx.lineWidth = 1.5
        ctx.strokeRect(groupX, y, cellWidth, cellHeight)
        if (student) {
          ctx.fillStyle = ink
          ctx.font = "bold 16px Paperlogy, sans-serif"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(student.name, groupX + cellWidth / 2, y + cellHeight / 2)
        } else {
          ctx.fillStyle = muted
          ctx.font = "12px Paperlogy, sans-serif"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(`${row + 1},${col + 1}`, groupX + cellWidth / 2, y + cellHeight / 2)
        }
        groupX += cellWidth + 12
      })
      y += cellHeight + 12
    }
    x += groupWidth + 24
  })

  try {
    const link = document.createElement("a")
    link.href = canvas.toDataURL("image/png")
    link.download = `자리배치_${title}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    return true
  } catch {
    return false
  }
}
