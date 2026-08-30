import { applyRemoteCompletions, pickActiveChecklistId } from "../utils/checkboard"
import { loadSharedStudents } from "./studentsStore"

export function checksToCompletions(checks, students, items, previous = {}) {
  const completions = {}
  for (const item of items) {
    const prevItem = previous[item.id] && typeof previous[item.id] === "object" ? previous[item.id] : {}
    completions[item.id] = {}
    for (const student of students) {
      const done = Boolean(checks[student.id]?.[item.id])
      const prev = prevItem[student.id]
      const same = prev && Boolean(prev.done) === done
      completions[item.id][student.id] = {
        done,
        at: same && typeof prev.at === "number" ? prev.at : Date.now(),
      }
    }
  }
  return completions
}

export function boardToCloudMaps(board, previousCompletions = {}, roster) {
  const shared = Array.isArray(roster) ? roster : loadSharedStudents()
  const items = Array.isArray(board?.items) ? board.items : []
  const checks = board?.checks && typeof board.checks === "object" ? board.checks : {}
  const students = {}
  shared.forEach((student, index) => {
    students[student.id] = { name: student.name, order: index }
  })
  const checklists = {}
  for (const item of items) {
    checklists[item.id] = {
      title: item.name,
      createdAt: Number(item.createdAt) || Date.now(),
      visible: item.visible !== false,
      color: item.color || null,
    }
  }
  return {
    students,
    checklists,
    completions: checksToCompletions(checks, shared, items, previousCompletions),
    activeChecklistId: pickActiveChecklistId(items),
  }
}

export function liveToBoardPatch(live, board) {
  if (!live) return null
  const completions = live.completions && typeof live.completions === "object" ? live.completions : {}
  const checks = applyRemoteCompletions(board.checks, completions)
  if (checks === board.checks) return null
  return { checks }
}
