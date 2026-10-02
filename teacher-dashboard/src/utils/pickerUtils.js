export const STUDENTS_KEY = "edu_students_v1"
export const PICKER_PREFS_KEY = "edu_picker_prefs_v1"

export const DEFAULT_STUDENTS = [
  { id: "st-1", name: "김민준", gender: "M" },
  { id: "st-2", name: "이서연", gender: "F" },
  { id: "st-3", name: "박지우", gender: "M" },
  { id: "st-4", name: "최예은", gender: "F" },
  { id: "st-5", name: "정민재", gender: "M" },
  { id: "st-6", name: "한소희", gender: "F" },
  { id: "st-7", name: "강우진", gender: "M" },
  { id: "st-8", name: "윤지아", gender: "F" },
  { id: "st-9", name: "임서준", gender: "M" },
  { id: "st-10", name: "오지민", gender: "F" },
]

export function shuffleArray(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function assignAutomaticGroups(students, totalGroups, useGenderBalance) {
  const groups = Array.from({ length: totalGroups }, () => [])
  if (useGenderBalance) {
    const boys = shuffleArray(students.filter((st) => st.gender === "M"))
    const girls = shuffleArray(students.filter((st) => st.gender === "F"))
    const others = shuffleArray(students.filter((st) => st.gender !== "M" && st.gender !== "F"))
    let idx = 0
    ;[...boys, ...girls, ...others].forEach((student) => {
      groups[idx].push(student)
      idx = (idx + 1) % totalGroups
    })
  } else {
    shuffleArray(students).forEach((student, index) => {
      groups[index % totalGroups].push(student)
    })
  }
  return groups
}

export function normalizeSepGroups(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((group) => Array.isArray(group))
    .map((group) => [...new Set(group.map((id) => String(id || "")).filter(Boolean))])
}

export function groupsViolateSep(groups, sepGroups) {
  const constraints = normalizeSepGroups(sepGroups).filter((group) => group.length >= 2)
  if (!constraints.length) return false
  const groupIndex = new Map()
  groups.forEach((members, index) => {
    members.forEach((student) => {
      if (student?.id) groupIndex.set(String(student.id), index)
    })
  })
  return constraints.some((group) => {
    const seen = new Set()
    for (const id of group) {
      if (!groupIndex.has(id)) continue
      const index = groupIndex.get(id)
      if (seen.has(index)) return true
      seen.add(index)
    }
    return false
  })
}

export function computeAutomaticGroups(students, totalGroups, useGenderBalance, sepGroups = []) {
  const roster = Array.isArray(students) ? students : []
  const count = Math.max(1, Number(totalGroups) || 1)
  const constraints = normalizeSepGroups(sepGroups).filter((group) => group.length >= 2)
  const maxTries = constraints.length ? 800 : 1
  let last = assignAutomaticGroups(roster, count, useGenderBalance)
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    last = assignAutomaticGroups(roster, count, useGenderBalance)
    if (!groupsViolateSep(last, constraints)) return last
  }
  return last
}

export function genderLabel(gender) {
  if (gender === "M") return "남"
  if (gender === "F") return "여"
  return "미설정"
}

export function clampGroupCount(value, fallback = 4) {
  const n = Number(value)
  if (![2, 3, 4, 5, 6, 7, 8].includes(n)) return fallback
  return n
}

/** Pick a row/column layout that fills a rectangle with near-square group cards. */
export function bestGroupGrid(count, width, height) {
  if (count <= 1) return { cols: 1, rows: 1 }
  const screenAspect = width / Math.max(height, 1)
  let best = { cols: count, rows: 1, score: Infinity }

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols)
    const cellAspect = width / cols / Math.max(height / rows, 1)
    const waste = cols * rows - count

    let aspectCost = 0
    if (cellAspect < 0.75) aspectCost = (0.75 / cellAspect - 1) * 2
    else if (cellAspect > 2) aspectCost = (cellAspect / 2 - 1) * 2
    else aspectCost = Math.abs(cellAspect - 1.2) * 0.25

    const wasteCost = waste * 0.55
    const orientationCost =
      screenAspect >= 1 ? Math.max(0, rows - cols) * 0.4 : Math.max(0, cols - rows) * 0.4
    const score = aspectCost + wasteCost + orientationCost
    if (score < best.score) best = { cols, rows, score }
  }

  return { cols: best.cols, rows: best.rows }
}
