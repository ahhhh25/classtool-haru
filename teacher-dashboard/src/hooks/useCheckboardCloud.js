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
  const previousCompletions = useRef({})
  const lastRemoteChecksKey = useRef("")
  const sawLive = useRef(false)
  const boardRef = useRef(widget.checkboard)
  const onChangeRef = useRef(onChange)
  const widgetRef = useRef(widget)
  boardRef.current = widget.checkboard
  onChangeRef.current = onChange
  widgetRef.current = widget

  useEffect(() => {
    if (!linked || !isFirebaseConfigured()) {
      sawLive.current = false
      lastRemoteChecksKey.current = ""
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
        sawLive.current = true
        setStatus("live")
        setError("")
        onChangeRef.current((current) => {
          const board = current.checkboard
          const patch = liveToBoardPatch(live, board)
          const checks = patch?.checks ?? board?.checks ?? {}
          lastRemoteChecksKey.current = JSON.stringify(checks)
          if (!patch) return {}
          return { checkboard: { checks: patch.checks } }
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
    if (!linked || !isFirebaseConfigured()) return undefined
    const checksKey = JSON.stringify(widget.checkboard?.checks ?? {})
    const completionsMode =
      !sawLive.current || checksKey === lastRemoteChecksKey.current ? "skip" : "diff"
    const timer = window.setTimeout(() => {
      pushBoardToCloud(widgetRef.current, previousCompletions.current, completionsMode).catch((err) => {
        setStatus("error")
        setError(firebaseErrorMessage(err))
      })
    }, 320)
    return () => window.clearTimeout(timer)
  }, [linked, widget.id, widget.title, widget.checkboard, students])

  return { linked, status, error }
}
