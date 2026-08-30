export function createCheckboardState() {
  return {
    students: [],
    items: [],
    checks: {},
  }
}

export function parseStudentNames(text) {
  return text
    .split(/[,，\n]/)
    .map((name) => name.trim())
    .filter(Boolean)
}

export function namesToRosterText(students) {
  return students.map((student) => student.name).join("\n")
}

export function syncStudentsFromNames(existing, names) {
  const used = new Set()
  return names.map((name) => {
    const match = existing.find((student) => student.name === name && !used.has(student.id))
    if (match) {
      used.add(match.id)
      return match
    }
    return { id: crypto.randomUUID(), name }
  })
}

export function formatItemTimestamp(value) {
  const date = new Date(value)
  const pad = (part) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function visibleItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item.visible !== false)
}

export function isStudentSettled(student, items, checks) {
  if (!items.length) return false
  return items.every((item) => Boolean(checks[student.id]?.[item.id]))
}

export function sortCheckboardStudents(students, items, checks) {
  const pending = []
  const settled = []
  for (const student of students) {
    if (isStudentSettled(student, items, checks)) settled.push(student)
    else pending.push(student)
  }
  return [...pending, ...settled]
}

export function toggleCheck(checks, studentId, itemId) {
  const current = Boolean(checks[studentId]?.[itemId])
  return {
    ...checks,
    [studentId]: {
      ...checks[studentId],
      [itemId]: !current,
    },
  }
}

export function setItemChecks(checks, students, itemId, checkedIds) {
  const selected = new Set(checkedIds)
  let next = { ...checks }
  for (const student of students) {
    next = {
      ...next,
      [student.id]: {
        ...next[student.id],
        [itemId]: selected.has(student.id),
      },
    }
  }
  return next
}

export function pickActiveChecklistId(items) {
  const shown = visibleItems(items)
  if (!shown.length) return null
  return shown.reduce((best, item) => (item.createdAt > best.createdAt ? item : best)).id
}

export function pendingStudentsForItem(students, item, checks) {
  if (!item) return []
  return students.filter((student) => !checks[student.id]?.[item.id])
}

export function completionCount(students, item, checks) {
  if (!item) return { done: 0, total: students.length }
  const pending = pendingStudentsForItem(students, item, checks).length
  return { done: students.length - pending, total: students.length }
}

export function applyRemoteCompletions(checks, completions) {
  if (!completions || typeof completions !== "object") return checks
  let next = checks
  let changed = false
  for (const [itemId, byStudent] of Object.entries(completions)) {
    if (!byStudent || typeof byStudent !== "object") continue
    for (const [studentId, cell] of Object.entries(byStudent)) {
      const done = Boolean(cell?.done)
      if (Boolean(next[studentId]?.[itemId]) === done) continue
      if (!changed) {
        next = { ...checks }
        changed = true
      }
      next[studentId] = { ...next[studentId], [itemId]: done }
    }
  }
  return next
}
