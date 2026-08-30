import { useEffect, useRef, useState } from "react"
import { liveToBoardPatch } from "../utils/checkboardCloud"
import { isKioskLinked, useKioskLink } from "../utils/kioskLinkStore"
import { isFirebaseConfigured } from "../lib/firebase"
import { firebaseErrorMessage, pushBoardToCloud, subscribeLiveBoard } from "../lib/kioskSession"
import { useSharedStudents } from "./useSharedStudents"

export function useCheckboardCloud(widget, onChange) {
  const [students] = useSharedStudents()
  const link = useKioskLink()
  const linked = isKioskLinked(link) && link.widgetId === widget.id
  const [status, setStatus] = useState(linked ? "connecting" : "idle")
  const [error, setError] = useState("")
  const applyingRemote = useRef(false)
  const previousCompletions = useRef({})
  const boardRef = useRef(widget.checkboard)
  const onChangeRef = useRef(onChange)
  const widgetRef = useRef(widget)
  boardRef.current = widget.checkboard
  onChangeRef.current = onChange
  widgetRef.current = widget

  useEffect(() => {
    if (!linked || !isFirebaseConfigured()) {
      setStatus("idle")
      setError("")
      return undefined
    }

    setStatus("connecting")
    const stop = subscribeLiveBoard(
      link.kioskToken,
      (live) => {
        if (!live) {
          setStatus("offline")
          setError("학생용 화면 연결이 없거나 해제되었습니다.")
          return
        }
        previousCompletions.current =
          live.completions && typeof live.completions === "object" ? live.completions : {}
        setStatus("live")
        setError("")
        const currentBoard = boardRef.current
        const patch = liveToBoardPatch(live, currentBoard)
        if (!patch) return
        applyingRemote.current = true
        onChangeRef.current({
          checkboard: {
            ...currentBoard,
            students: [],
            items: currentBoard.items,
            checks: patch.checks,
          },
        })
        queueMicrotask(() => {
          applyingRemote.current = false
        })
      },
      (err) => {
        setStatus("error")
        setError(firebaseErrorMessage(err))
      },
    )
    return stop
  }, [linked, link?.kioskToken])

  useEffect(() => {
    if (!linked || !isFirebaseConfigured() || applyingRemote.current) return undefined
    const timer = window.setTimeout(() => {
      pushBoardToCloud(widgetRef.current, previousCompletions.current).catch((err) => {
        setStatus("error")
        setError(firebaseErrorMessage(err))
      })
    }, 320)
    return () => window.clearTimeout(timer)
  }, [linked, widget.id, widget.title, widget.checkboard, students])

  return { linked, status, error }
}
