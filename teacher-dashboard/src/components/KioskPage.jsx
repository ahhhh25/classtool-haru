import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronLeft } from "lucide-react"
import { isFirebaseConfigured } from "../lib/firebase"
import {
  firebaseErrorMessage,
  logKiosk,
  setStudentCompletion,
  subscribeKioskLive,
} from "../lib/kioskSession"
import {
  readKioskTokenFromLocation,
  rememberKioskToken,
} from "../utils/kioskTokens"

function studentsFromLive(live) {
  if (!live?.students || typeof live.students !== "object") return []
  return Object.entries(live.students)
    .map(([id, row]) => ({
      id,
      name: typeof row?.name === "string" ? row.name : "",
      order: Number(row?.order) || 0,
    }))
    .filter((student) => student.name)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko"))
}

function visibleChecklistsFromLive(live) {
  const items = live?.checklists && typeof live.checklists === "object" ? live.checklists : {}
  return Object.entries(items)
    .filter(([, item]) => item && item.visible !== false)
    .map(([id, item]) => ({
      id,
      title: typeof item.title === "string" ? item.title : "체크리스트",
      createdAt: Number(item.createdAt) || 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt || a.title.localeCompare(b.title, "ko"))
}

function itemDoneCount(live, itemId, students) {
  const cells = live?.completions?.[itemId]
  if (!cells) return 0
  return students.filter((student) => Boolean(cells[student.id]?.done)).length
}

export default function KioskPage() {
  const [token] = useState(() => readKioskTokenFromLocation())
  const [live, setLive] = useState(null)
  const [status, setStatus] = useState(token ? "connecting" : "need-qr")
  const [error, setError] = useState("")
  const [selectedId, setSelectedId] = useState(null)
  const [pulseId, setPulseId] = useState("")
  const retryRef = useRef(null)
  const pendingRef = useRef(new Map())
  const writeChainRef = useRef(new Map())
  const lastPointerRef = useRef(0)
  const pointerStartRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!token) return undefined
    if (!isFirebaseConfigured()) {
      setStatus("error")
      setError("Firebase 설정이 없어 학생용 화면에 연결할 수 없습니다.")
      return undefined
    }
    rememberKioskToken(token)
    setStatus("connecting")
    setError("")
    const session = subscribeKioskLive(token, {
      onLive(value) {
        setLive((previous) => {
          const next = { ...value }
          const incomingLists = value.checklists
          const hasLists = incomingLists && typeof incomingLists === "object" && Object.keys(incomingLists).length > 0
          if (!hasLists && previous?.checklists) next.checklists = previous.checklists
          const incomingStudents = value.students
          const hasStudents =
            incomingStudents && typeof incomingStudents === "object" && Object.keys(incomingStudents).length > 0
          if (value.studentCount === 0) {
            next.students = {}
          } else if (!hasStudents && previous?.students) {
            next.students = previous.students
          }
          const completions = next.completions && typeof next.completions === "object" ? { ...next.completions } : {}
          pendingRef.current.forEach((intent, key) => {
            const split = key.indexOf(":")
            const itemId = key.slice(0, split)
            const studentId = key.slice(split + 1)
            const remote = completions[itemId]?.[studentId]
            const remoteAt = Number(remote?.at) || 0
            if (remoteAt >= intent.at) {
              pendingRef.current.delete(key)
              return
            }
            completions[itemId] = {
              ...completions[itemId],
              [studentId]: { done: intent.done, at: intent.at },
            }
          })
          next.completions = completions
          return next
        })
      },
      onStatus({ status: nextStatus, error: nextError }) {
        setStatus(nextStatus)
        setError(nextError || "")
        if (nextStatus !== "live" && nextStatus !== "retrying" && nextStatus !== "connecting") {
          setLive(null)
        }
      },
    })
    retryRef.current = session.retry
    return () => {
      retryRef.current = null
      session.stop()
    }
  }, [token])

  const students = useMemo(() => studentsFromLive(live), [live])
  const lists = useMemo(() => visibleChecklistsFromLive(live), [live])
  const selected = lists.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId && !lists.some((item) => item.id === selectedId)) {
      setSelectedId(null)
    }
  }, [lists, selectedId])

  const cellDone = (itemId, studentId) => Boolean(live?.completions?.[itemId]?.[studentId]?.done)

  const enqueueWrite = (key, task) => {
    const prev = writeChainRef.current.get(key) || Promise.resolve()
    const next = prev.then(task, task)
    writeChainRef.current.set(key, next)
    return next
  }

  const applyLocalDone = (itemId, studentId, done, at) => {
    setLive((current) => {
      if (!current) return current
      return {
        ...current,
        completions: {
          ...current.completions,
          [itemId]: {
            ...current.completions?.[itemId],
            [studentId]: { done, at },
          },
        },
      }
    })
  }

  const toggle = (student) => {
    if (!token || !selected) {
      logKiosk("tap-ignored", { reason: !token ? "no-token" : "no-list" })
      return
    }
    const itemId = selected.id
    const key = `${itemId}:${student.id}`
    const nextDone = !cellDone(itemId, student.id)
    const at = Date.now()
    pendingRef.current.set(key, { done: nextDone, at })
    applyLocalDone(itemId, student.id, nextDone, at)
    setPulseId(student.id)
    window.setTimeout(() => setPulseId(""), 420)
    logKiosk("tap", { itemId, studentId: student.id, nextDone })
    enqueueWrite(key, async () => {
      const intent = pendingRef.current.get(key)
      if (!intent) return
      try {
        logKiosk("save-start", { itemId, studentId: student.id, done: intent.done })
        let saved
        try {
          saved = await setStudentCompletion(token, itemId, student.id, intent.done)
        } catch (first) {
          logKiosk("save-retry", { itemId, studentId: student.id, code: first?.code || "" })
          saved = await setStudentCompletion(token, itemId, student.id, intent.done)
        }
        const latest = pendingRef.current.get(key)
        if (latest && latest.at === intent.at) pendingRef.current.delete(key)
        logKiosk("save-ok", { itemId, studentId: student.id, done: saved.done })
      } catch (err) {
        const latest = pendingRef.current.get(key)
        if (latest && latest.at === intent.at) {
          pendingRef.current.delete(key)
          applyLocalDone(itemId, student.id, !intent.done, Date.now())
        }
        logKiosk("save-fail", {
          itemId,
          studentId: student.id,
          code: err?.code || "",
          message: err?.message || "",
        })
        setError(firebaseErrorMessage(err))
      }
    })
  }

  const onCardPointerDown = (event) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const onCardPointerUp = (event, student) => {
    if (event.pointerType === "mouse") return
    if (event.button != null && event.button !== 0) return
    const dx = event.clientX - pointerStartRef.current.x
    const dy = event.clientY - pointerStartRef.current.y
    if (dx * dx + dy * dy > 144) {
      logKiosk("pointer-scroll", { studentId: student.id })
      return
    }
    lastPointerRef.current = performance.now()
    logKiosk("pointer", { studentId: student.id, pointerType: event.pointerType || "unknown" })
    toggle(student)
  }

  const onCardClick = (event, student) => {
    if (performance.now() - lastPointerRef.current < 650) {
      logKiosk("click-dup", { studentId: student.id })
      event.preventDefault()
      return
    }
    logKiosk("click", { studentId: student.id })
    toggle(student)
  }

  const showBoard = Boolean(live) && (status === "live" || status === "retrying" || status === "connecting")
  const showConnecting = (status === "connecting" || status === "retrying") && !live

  return (
    <div className="theme-surface flex h-svh flex-col overflow-hidden bg-app text-ink">
      <header className="shrink-0 border-b border-line bg-app px-4 py-3">
        {selected ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="제출했나요?"
              onClick={() => setSelectedId(null)}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-icon hover:bg-hover hover:text-ink"
            >
              <ChevronLeft size={20} strokeWidth={1.75} />
            </button>
            <nav className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto" aria-label="체크리스트">
              {lists.map((item) => {
                const active = item.id === selected.id
                const done = itemDoneCount(live, item.id, students)
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setSelectedId(item.id)}
                    className={`kiosk-name-btn kiosk-menu-chip shrink-0 rounded-full leading-none ${
                      active ? "is-active px-4 py-2 text-[18px] font-medium" : "px-3.5 py-1.5 text-[15px]"
                    }`}
                  >
                    {item.title}
                    <span className="ml-1.5 tabular-nums opacity-70">
                      {done}/{students.length}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        ) : (
          <div>
            <h1 className="text-[20px] font-semibold text-ink">제출했나요?</h1>
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {status === "need-qr" && (
          <p className="px-2 text-center text-[15px] leading-relaxed text-muted">
            선생님이 보여 준 QR을 찍어 들어와 주세요.
          </p>
        )}

        {showConnecting && status === "connecting" && (
          <p className="px-2 text-center text-[14px] text-muted">연결하는 중…</p>
        )}

        {showConnecting && status === "retrying" && (
          <p className="px-2 text-center text-[14px] text-muted">다시 연결하는 중…</p>
        )}

        {showBoard && status === "retrying" && (
          <p className="mb-4 px-2 text-center text-[14px] text-muted">연결이 끊겼습니다. 다시 연결하는 중…</p>
        )}

        {status === "invalid" && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-2 text-center">
            <p className="text-[15px] leading-relaxed text-muted">
              유효하지 않거나 만료된 연결 주소입니다.
            </p>
            <button
              type="button"
              onClick={() => retryRef.current?.()}
              className="h-11 rounded-xl border border-line bg-widget px-6 text-[14px] text-ink hover:bg-hover"
            >
              다시 연결
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-2 text-center">
            <p className="text-[15px] leading-relaxed text-muted">연결에 실패했습니다</p>
            {error && error !== "연결에 실패했습니다." && (
              <p className="text-[14px] leading-relaxed text-faint">{error}</p>
            )}
            <button
              type="button"
              onClick={() => retryRef.current?.()}
              className="h-11 rounded-xl border border-line bg-widget px-6 text-[14px] text-ink hover:bg-hover"
            >
              다시 연결
            </button>
          </div>
        )}

        {showBoard && error && (
          <p className="mb-4 px-2 text-center text-[14px] text-muted">{error}</p>
        )}

        {showBoard && !selected && lists.length === 0 && (
          <p className="px-2 text-center text-[15px] text-muted">
            지금 열려 있는 체크 항목이 없습니다.
          </p>
        )}

        {showBoard && !selected && lists.length > 0 && (
          <ul className="mx-auto flex max-w-lg flex-col gap-3">
            {lists.map((item) => {
              const done = itemDoneCount(live, item.id, students)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="kiosk-name-btn flex min-h-[4.75rem] w-full flex-col items-start justify-center rounded-2xl border border-line bg-widget px-5 py-4 text-left hover:bg-hover"
                  >
                    <span className="text-[20px] font-medium leading-tight text-ink">{item.title}</span>
                    <span className="mt-1 text-[15px] tabular-nums text-ink-soft">
                      {done} / {students.length} 완료
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {showBoard && selected && students.length === 0 && (
          <p className="px-2 text-center text-[15px] text-muted">등록된 학생이 없습니다.</p>
        )}

        {showBoard && selected && students.length > 0 && (
          <ul className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {students.map((student) => {
              const done = cellDone(selected.id, student.id)
              return (
                <li key={student.id}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onPointerDown={onCardPointerDown}
                    onPointerUp={(event) => onCardPointerUp(event, student)}
                    onClick={(event) => onCardClick(event, student)}
                    className={`kiosk-name-btn flex min-h-[4.5rem] w-full items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-[20px] leading-tight transition-colors ${
                      done
                        ? "kiosk-name-done border-accent bg-accent-soft text-accent-ink"
                        : "border-line bg-widget text-ink hover:bg-hover"
                    } ${pulseId === student.id ? "kiosk-name-pulse" : ""}`}
                  >
                    {done && <Check size={22} strokeWidth={2} className="shrink-0" />}
                    <span className="min-w-0 truncate">{student.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {showBoard && selected && (
        <p className="px-5 py-3 text-center text-[12px] text-faint">
          자기 이름을 누르면 완료됩니다. 잘못 눌렀으면 한 번 더 눌러 취소하세요.
        </p>
      )}
    </div>
  )
}
