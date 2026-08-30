import { useEffect, useState } from "react"
import { loadSharedStudents, saveSharedStudents, subscribeSharedStudents } from "../utils/studentsStore"

export function useSharedStudents() {
  const [students, setStudents] = useState(loadSharedStudents)

  useEffect(() => subscribeSharedStudents(setStudents), [])

  const persist = (next) => {
    setStudents(saveSharedStudents(next))
  }

  return [students, persist]
}
