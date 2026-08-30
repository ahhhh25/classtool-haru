import { loadJson, saveJson } from "./safeStorage"
import { DEFAULT_STUDENTS, STUDENTS_KEY } from "./pickerUtils"

export const STUDENTS_CHANGED_EVENT = "haru-students-changed"

export function normalizeStudents(raw) {
  if (!Array.isArray(raw)) return DEFAULT_STUDENTS.map((student) => ({ ...student }))
  return raw.map((student, index) => ({
    id: String(student?.id || `st-${index}`),
    name: String(student?.name || ""),
    gender: student?.gender === "M" || student?.gender === "F" ? student.gender : null,
  }))
}

export function loadSharedStudents() {
  return normalizeStudents(loadJson(STUDENTS_KEY, null))
}

export function saveSharedStudents(next) {
  const students = normalizeStudents(next)
  saveJson(STUDENTS_KEY, students)
  window.dispatchEvent(new CustomEvent(STUDENTS_CHANGED_EVENT))
  return students
}

export function subscribeSharedStudents(onChange) {
  const emit = () => onChange(loadSharedStudents())
  const onStorage = (event) => {
    if (event.key === STUDENTS_KEY) emit()
  }
  window.addEventListener(STUDENTS_CHANGED_EVENT, emit)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(STUDENTS_CHANGED_EVENT, emit)
    window.removeEventListener("storage", onStorage)
  }
}
