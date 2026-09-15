import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowUp,
  BookOpen,
  Download,
  Grid2x2,
  Maximize2,
  Minimize2,
  Repeat,
  RotateCcw,
  Save,
  Unlock,
  Unlink,
  Upload,
  Users,
  X,
} from "lucide-react"
import ConfirmDialog from "../ConfirmDialog"
import SettingsModal from "../SettingsModal"
import { useSharedStudents } from "../../hooks/useSharedStudents"
import { genderLabel } from "../../utils/pickerUtils"
import {
  MAX_SEATING_RECORDS,
  arrangeStudents,
  buildSeatingExport,
  downloadArrangementPng,
  getColumnGroups,
  getDisplayGroups,
  getRowOrder,
  loadSeatingHistory,
  loadSeatingSettings,
  mergeImportedStudents,
  pruneStudentRefs,
  remapSeatIds,
  saveSeatingHistory,
  saveSeatingSettings,
  seatKey,
} from "../../utils/seating"

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function formatRecordName(record) {
  return record.name || new Date(record.date).toLocaleString("ko-KR")
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-lg border border-line bg-widget p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Icon size={14} strokeWidth={1.5} className="text-icon" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function Chalkboard() {
  return (
    <div className="seating-board-wrap mb-4 w-full">
      <div className="seating-board">칠판</div>
    </div>
  )
}

function DeskCell({
  cellKey,
  student,
  spinLabel,
  disabled,
  fixed,
  seatGender,
  coordLabel,
  present,
  phase,
  revealed,
  onClick,
  onToggleGender,
}) {
  const shuffling = phase === "shuffling" && !disabled && !fixed
  const revealing = phase === "revealing" && revealed.has(cellKey) && student
  const hideUntilReveal = phase === "revealing" && student && !revealed.has(cellKey)
  const name = shuffling ? spinLabel : hideUntilReveal ? "" : student?.name
  const filled = Boolean(name) || hideUntilReveal || shuffling

  return (
    <div
      data-seat-key={cellKey}
      role={present ? undefined : "button"}
      tabIndex={present || disabled ? undefined : 0}
      onClick={present || disabled ? undefined : onClick}
      onKeyDown={
        present || disabled
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onClick()
              }
            }
      }
      className={[
        "seating-desk group relative flex flex-col items-center justify-center rounded-md border text-center transition-[transform,box-shadow,background-color] duration-200",
        present ? "h-[4.5rem] w-[6.75rem] px-1" : "h-[4.75rem] w-[6.5rem] px-1.5 py-1",
        disabled ? "is-disabled" : filled ? "is-filled" : "",
        fixed && !present ? "is-fixed" : "",
        shuffling ? "is-shuffling" : "",
        revealing ? "is-revealing" : "",
        present ? "cursor-default" : "cursor-pointer hover:border-line-strong",
      ].join(" ")}
    >
      {disabled ? (
        <span className="text-[18px] text-faint">✕</span>
      ) : (
        <>
          <span
            className={[
              "leading-tight",
              present ? "max-w-full truncate px-0.5 text-[24px] font-bold" : "text-[13px] font-semibold",
              shuffling ? "seating-slot-name" : "",
              filled ? "text-ink" : "text-faint",
            ].join(" ")}
          >
            {hideUntilReveal ? "\u00A0" : name || coordLabel}
          </span>
          {!present && !disabled && (
            <span className="mt-1 flex gap-0.5">
              {["M", "F"].map((gender) => (
                <span
                  key={gender}
                  role="presentation"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleGender(gender)
                  }}
                  className={`cursor-pointer rounded px-1 py-px text-[10px] ${
                    seatGender === gender
                      ? "bg-accent-soft text-accent-fg"
                      : "bg-sunken text-muted hover:text-ink"
                  }`}
                >
                  {gender === "M" ? "남" : "여"}
                </span>
              ))}
            </span>
          )}
        </>
      )}
    </div>
  )
}

function SeatGrid({
  settings,
  students,
  arrangement,
  view,
  present,
  phase,
  spinLabels,
  revealed,
  onSeatClick,
  onToggleGender,
}) {
  const teacherView = view === "teacher"
  const groups = getDisplayGroups(getColumnGroups(settings.layoutType, settings.cols), teacherView)
  const rowOrder = getRowOrder(settings.rows, teacherView)
  const disabled = new Set(settings.disabledSeats)
  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students])
  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 })

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return undefined

    const update = () => {
      const sw = viewport.clientWidth
      const sh = viewport.clientHeight
      const fw = content.offsetWidth
      const fh = content.offsetHeight
      if (!sw || !sh || !fw || !fh) return
      const fill = present ? 0.98 : 0.7
      const scale = Math.min(sw / fw, sh / fh) * fill
      setFit({ scale, width: Math.round(fw * scale), height: Math.round(fh * scale) })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(content)
    return () => observer.disconnect()
  }, [present, settings.rows, settings.cols, settings.layoutType, view, arrangement, phase])

  const classroom = (
    <>
      {!teacherView && <Chalkboard />}
      <div className="seating-stage flex flex-nowrap justify-center gap-4">
        {groups.map((cols, gi) => (
          <div key={`g-${gi}`} className={`flex flex-col ${present ? "gap-1.5" : "gap-2"}`}>
            {rowOrder.map((row) => (
              <div key={`r-${row}`} className={`flex ${present ? "gap-1.5" : "gap-2"}`}>
                {cols.map((col) => {
                  const key = seatKey(row, col)
                  const arrangedId = arrangement?.[key]
                  const fixedId = settings.fixedSeats[key]
                  const displayId = present ? arrangedId : arrangedId || fixedId
                  const keepFixed = Boolean(fixedId) && phase === "shuffling"
                  return (
                    <DeskCell
                      key={key}
                      cellKey={key}
                      student={phase === "shuffling" && !keepFixed ? null : studentById[displayId]}
                      spinLabel={spinLabels[key]}
                      disabled={disabled.has(key)}
                      fixed={Boolean(fixedId) && !present}
                      seatGender={settings.seatGenders[key]}
                      coordLabel={`${row + 1},${col + 1}`}
                      present={present}
                      phase={phase}
                      revealed={revealed}
                      onClick={() => onSeatClick(key)}
                      onToggleGender={(gender) => onToggleGender(key, gender)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      {teacherView && (
        <div className="mt-4 w-full">
          <Chalkboard />
        </div>
      )}
    </>
  )

  return (
    <div ref={viewportRef} className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden">
      <div className="relative overflow-hidden" style={{ width: fit.width || undefined, height: fit.height || undefined }}>
        <div
          ref={contentRef}
          className="flex w-max flex-col items-center"
          style={{
            transform: `scale(${fit.scale})`,
            transformOrigin: "top left",
          }}
        >
          {classroom}
        </div>
      </div>
    </div>
  )
}

function MiniGrid({ record, students, settings }) {
  const groups = getColumnGroups(settings.layoutType, settings.cols)
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]))
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {groups.map((cols, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {Array.from({ length: settings.rows }, (_, i) => settings.rows - 1 - i).map((row) => (
            <div key={row} className="flex gap-1">
              {cols.map((col) => {
                const student = studentById[record.seatMap?.[seatKey(row, col)]]
                return (
                  <div
                    key={col}
                    className="flex h-10 w-14 items-center justify-center overflow-hidden rounded border border-line bg-sunken text-[10px] font-medium text-ink"
                  >
                    {student?.name || "·"}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function HelpBody() {
  return (
    <div className="space-y-5 text-[13px] leading-relaxed text-muted">
      <section>
        <h3 className="mb-1 font-semibold text-ink">기본 사용법</h3>
        <p>학생 명단은 설정 &gt; 학생 명단을 그대로 사용합니다. 배치 유형(짝대형/시험대형)과 행·열을 맞춘 뒤 자리 섞기를 누르세요.</p>
      </section>
      <section>
        <h3 className="mb-1 font-semibold text-ink">고급 기능</h3>
        <ul className="list-disc space-y-1 pl-4">
          <li>자리를 클릭하면 학생을 고정하거나 사용 안 함으로 바꿀 수 있습니다.</li>
          <li>각 자리의 남/여 표시로 성별 제약을 걸 수 있습니다.</li>
          <li>분리 그룹에 넣은 학생끼리는 상하좌우·대각선으로 붙지 않습니다.</li>
          <li>앞자리 배치는 칠판 쪽 1·2행에만 앉힙니다.</li>
          <li>동일한 짝 방지는 사용으로 표시한 기록과 짝이 겹치지 않게 합니다. 기록은 최대 5개입니다.</li>
        </ul>
      </section>
    </div>
  )
}

export default function SeatingTool({ active = true, onOpenStudents }) {
  const [students] = useSharedStudents()
  const [settings, setSettings] = useState(loadSeatingSettings)
  const [history, setHistory] = useState(loadSeatingHistory)
  const [arrangement, setArrangement] = useState(null)
  const [view, setView] = useState("teacher")
  const [present, setPresent] = useState(false)
  const [phase, setPhase] = useState("idle")
  const [spinLabels, setSpinLabels] = useState({})
  const [revealed, setRevealed] = useState(() => new Set())
  const [toast, setToast] = useState("")
  const [helpOpen, setHelpOpen] = useState(false)
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const animToken = useRef(0)
  const importRef = useRef(null)

  const studentIds = useMemo(() => students.map((s) => s.id), [students])

  useEffect(() => {
    setSettings((prev) => {
      const next = pruneStudentRefs(prev, studentIds)
      saveSeatingSettings(next)
      return next
    })
  }, [studentIds])

  useEffect(() => {
    if (!active && present) {
      animToken.current = Date.now()
      setPresent(false)
      setPhase("idle")
    }
  }, [active, present])

  useEffect(() => {
    if (!present) return undefined
    const onKey = (event) => {
      if (event.key === "Escape") setPresent(false)
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKey)
    }
  }, [present])

  const patchSettings = (patch) => {
    setSettings((prev) => {
      const next = pruneStudentRefs({ ...prev, ...patch }, studentIds)
      saveSeatingSettings(next)
      return next
    })
  }

  const patchHistory = (next) => {
    const saved = saveSeatingHistory(next)
    setHistory(saved)
  }

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 2800)
  }

  const toggleSeatGender = (key, gender) => {
    const next = { ...settings.seatGenders }
    if (next[key] === gender) delete next[key]
    else next[key] = gender
    patchSettings({ seatGenders: next })
  }

  const fixSeat = (key, studentId) => {
    const next = { ...settings.fixedSeats }
    Object.keys(next).forEach((k) => {
      if (next[k] === studentId) delete next[k]
    })
    next[key] = studentId
    patchSettings({ fixedSeats: next })
    setModal(null)
  }

  const unfixSeat = (key) => {
    const next = { ...settings.fixedSeats }
    delete next[key]
    patchSettings({ fixedSeats: next })
    setModal(null)
  }

  const toggleDisabled = (key) => {
    const disabled = new Set(settings.disabledSeats)
    const fixed = { ...settings.fixedSeats }
    if (disabled.has(key)) disabled.delete(key)
    else {
      disabled.add(key)
      delete fixed[key]
    }
    patchSettings({ disabledSeats: [...disabled], fixedSeats: fixed })
    setModal(null)
  }

  const openSeatModal = (key) => {
    setModal({ type: "seat", key })
  }

  const runArrangement = async () => {
    if (phase !== "idle") return
    if (students.length === 0) {
      showToast("설정에서 학생 명단을 먼저 등록해주세요.")
      return
    }
    const result = arrangeStudents({
      students,
      ...settings,
      recentArrangements: history,
    })
    if (!present) {
      animToken.current = Date.now()
      setSpinLabels({})
      setRevealed(new Set())
      setPhase("idle")
      setArrangement(result)
      showToast("자리 배치 완료")
      return
    }
    const token = Date.now()
    animToken.current = token
    setArrangement(result)
    setRevealed(new Set())
    setPhase("shuffling")

    const names = students.map((s) => s.name).filter(Boolean)
    const disabled = new Set(settings.disabledSeats)
    const spinKeys = []
    for (let r = 0; r < settings.rows; r += 1) {
      for (let c = 0; c < settings.cols; c += 1) {
        const key = seatKey(r, c)
        if (!disabled.has(key) && !settings.fixedSeats[key]) spinKeys.push(key)
      }
    }

    const started = Date.now()
    while (Date.now() - started < 1600) {
      if (animToken.current !== token) return
      const nextLabels = {}
      spinKeys.forEach((key) => {
        nextLabels[key] = names[Math.floor(Math.random() * names.length)] || "·"
      })
      setSpinLabels(nextLabels)
      await sleep(70)
    }
    if (animToken.current !== token) return
    setSpinLabels({})
    setPhase("revealing")

    const visual = []
    const teacherView = view === "teacher"
    getRowOrder(settings.rows, teacherView).forEach((row) => {
      getDisplayGroups(getColumnGroups(settings.layoutType, settings.cols), teacherView).forEach((cols) => {
        cols.forEach((col) => {
          const key = seatKey(row, col)
          if (result[key]) visual.push(key)
        })
      })
    })
    const nextRevealed = new Set()
    for (const key of visual) {
      if (animToken.current !== token) return
      nextRevealed.add(key)
      setRevealed(new Set(nextRevealed))
      await sleep(220)
    }
    if (animToken.current !== token) return
    setPhase("idle")
    showToast("자리 배치 완료")
  }

  const saveRecord = () => {
    if (!arrangement) {
      showToast("먼저 자리를 배치해주세요.")
      return
    }
    if (history.length >= MAX_SEATING_RECORDS) {
      setConfirm({
        title: "기록 저장 제한",
        message: `배치는 최대 ${MAX_SEATING_RECORDS}개까지 저장됩니다. 가장 오래된 기록(${formatRecordName(history[0])})을 지우고 저장할까요?`,
        confirmLabel: "삭제하고 저장",
        onConfirm: () => {
          commitRecord(history.slice(1))
          setConfirm(null)
        },
      })
      return
    }
    commitRecord(history)
  }

  const commitRecord = (base) => {
    patchHistory([
      ...base,
      {
        id: String(Date.now()),
        date: new Date().toISOString(),
        seatMap: arrangement,
        useForPrevention: true,
        name: "",
      },
    ])
    showToast("배치 기록이 저장되었습니다.")
  }

  const exportSeating = () => {
    const payload = buildSeatingExport(settings, history, { currentArrangement: arrangement })
    setModal({ type: "export", json: JSON.stringify(payload, null, 2) })
  }

  const copyExport = async (json) => {
    try {
      await navigator.clipboard.writeText(json)
      showToast("JSON이 복사되었습니다.")
    } catch {
      showToast("복사에 실패했습니다.")
    }
  }

  const downloadExport = (json) => {
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `haru-seating-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const importSeating = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"))
        const { idMap } = mergeImportedStudents(students, data.students)
        const rosterIds = students.map((s) => s.id)
        const nextSettings = pruneStudentRefs(
          {
            ...settings,
            layoutType: data.layoutType === "exam" ? "exam" : data.layoutType === "pair" ? "pair" : settings.layoutType,
            rows: data.rows ?? settings.rows,
            cols: data.cols ?? settings.cols,
            fixedSeats: remapSeatIds(data.fixedSeats, idMap),
            seatGenders: data.seatGenders || {},
            disabledSeats: data.disabledSeats || [],
            separationGroups: (data.separationGroups || []).map((group) =>
              (group || []).map((id) => idMap[id] || id),
            ),
            frontRowStudents: (data.frontRowStudents || []).map((id) => idMap[id] || id),
            pairPrevention: data.pairPrevention !== false,
          },
          rosterIds,
        )
        saveSeatingSettings(nextSettings)
        setSettings(nextSettings)
        const records = (data.recentArrangements || []).map((record) => ({
          ...record,
          seatMap: remapSeatIds(record.seatMap, idMap),
        }))
        patchHistory(records)
        setArrangement(data.currentArrangement ? remapSeatIds(data.currentArrangement, idMap) : null)
        showToast("설정을 불러왔습니다.")
      } catch {
        showToast("파일을 읽을 수 없습니다.")
      }
    }
    reader.readAsText(file)
  }

  const enterPresent = () => {
    animToken.current = Date.now()
    setArrangement(null)
    setPhase("idle")
    setSpinLabels({})
    setRevealed(new Set())
    setView("student")
    setPresent(true)
  }

  const leavePresent = () => {
    animToken.current = Date.now()
    setPresent(false)
    setView("teacher")
    setArrangement(null)
    setPhase("idle")
  }

  const busy = phase !== "idle"

  const grid = (
    <SeatGrid
      settings={settings}
      students={students}
      arrangement={arrangement}
      view={view}
      present={present}
      phase={phase}
      spinLabels={spinLabels}
      revealed={revealed}
      onSeatClick={openSeatModal}
      onToggleGender={toggleSeatGender}
    />
  )

  const viewToggle = (
    <div className="flex gap-1 rounded-lg border border-line bg-sunken p-0.5">
      {[
        { id: "teacher", label: "교사 시선" },
        { id: "student", label: "학생 시선" },
      ].map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setView(item.id)}
          className={`rounded-md px-2.5 py-1 text-[12px] ${
            view === item.id ? "bg-widget text-ink" : "text-muted hover:text-ink"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )

  const shell = (
    <div
      className={
        present
          ? "theme-surface fixed inset-0 z-[80] flex h-dvh w-dvw flex-col overflow-hidden bg-app p-3"
          : "theme-surface relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app p-3"
      }
    >
      {toast && (
        <div className="pointer-events-none absolute top-4 right-4 z-50 rounded-lg border border-line bg-widget px-3 py-2 text-[13px] text-ink shadow-modal">
          {toast}
        </div>
      )}
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-widget">
        {!present && (
          <aside className="widget-scroll w-80 shrink-0 space-y-3 overflow-y-auto border-r border-line bg-sunken p-3">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-widget px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12px] text-muted">
                <Users size={14} strokeWidth={1.5} className="text-icon" />
                공통 명단 {students.length}명
              </p>
              <button
                type="button"
                onClick={onOpenStudents}
                className="text-[12px] text-accent-fg hover:underline"
              >
                설정에서 관리
              </button>
            </div>

            <Section icon={Grid2x2} title="배치 유형">
              <div className="mb-2 flex gap-3 text-[12px] text-ink">
                {[
                  { id: "exam", label: "시험대형" },
                  { id: "pair", label: "짝대형" },
                ].map((item) => (
                  <label key={item.id} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="seating-layout"
                      checked={settings.layoutType === item.id}
                      onChange={() => patchSettings({ layoutType: item.id })}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
              <div className="flex gap-3 text-[12px] text-ink">
                <label className="flex items-center gap-1">
                  행
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.rows}
                    onChange={(event) => patchSettings({ rows: Number(event.target.value) })}
                    className="h-7 w-14 rounded-md border border-line bg-widget text-center"
                  />
                </label>
                <label className="flex items-center gap-1">
                  열
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={settings.cols}
                    onChange={(event) => patchSettings({ cols: Number(event.target.value) })}
                    className="h-7 w-14 rounded-md border border-line bg-widget text-center"
                  />
                </label>
              </div>
            </Section>

            <Section icon={Unlink} title="분리하기">
              <button
                type="button"
                onClick={() => patchSettings({ separationGroups: [...settings.separationGroups, []] })}
                className="mb-2 rounded-md border border-line px-2 py-1 text-[12px] text-icon hover:bg-hover hover:text-ink"
              >
                + 그룹 추가
              </button>
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {settings.separationGroups.map((group, index) => {
                  const names = group.map((id) => students.find((s) => s.id === id)?.name || "?").join(", ")
                  return (
                    <div key={index} className="rounded-md border border-line bg-sunken p-2 text-[12px]">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium text-ink">그룹 {index + 1}</span>
                        <button
                          type="button"
                          onClick={() =>
                            patchSettings({
                              separationGroups: settings.separationGroups.filter((_, i) => i !== index),
                            })
                          }
                          className="text-faint hover:text-ink"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <p className="mb-1 text-muted">{names || "(비어있음)"}</p>
                      <button
                        type="button"
                        className="text-accent-fg hover:underline"
                        onClick={() => setModal({ type: "sep", index })}
                      >
                        학생 선택
                      </button>
                    </div>
                  )
                })}
              </div>
            </Section>

            <Section icon={ArrowUp} title="앞자리 배치 (1, 2행)">
              <div className="mb-2 flex flex-wrap gap-1">
                {settings.frontRowStudents.map((id) => {
                  const student = students.find((s) => s.id === id)
                  return student ? (
                    <span key={id} className="rounded bg-active px-2 py-0.5 text-[11px] text-ink">
                      {student.name}
                    </span>
                  ) : null
                })}
              </div>
              <button
                type="button"
                onClick={() => setModal({ type: "front" })}
                className="rounded-md border border-line px-2 py-1 text-[12px] text-icon hover:bg-hover hover:text-ink"
              >
                학생 선택
              </button>
            </Section>

            <Section icon={Repeat} title="동일한 짝 방지">
              <label className="flex items-center gap-2 text-[12px] text-ink">
                <input
                  type="checkbox"
                  checked={settings.pairPrevention}
                  onChange={(event) => patchSettings({ pairPrevention: event.target.checked })}
                />
                배치 기록 대조 활성화
              </label>
              <p className="mt-2 text-[11px] text-faint">
                {history.length > 0 ? `저장된 기록: ${history.length}개` : "저장된 기록: 없음"}
              </p>
              <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                {history.map((record, index) => (
                  <div
                    key={record.id}
                    className={`rounded-md border p-2 text-[11px] ${
                      record.useForPrevention ? "border-line-strong bg-accent-soft" : "border-line bg-widget"
                    }`}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="text-left font-medium text-ink hover:text-accent-fg"
                        onClick={() => setModal({ type: "rename", index })}
                      >
                        {formatRecordName(record)}
                      </button>
                      <button
                        type="button"
                        className="text-faint hover:text-ink"
                        onClick={() => patchHistory(history.filter((_, i) => i !== index))}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="flex-1 rounded border border-line py-1 text-icon hover:bg-hover hover:text-ink"
                        onClick={() => setModal({ type: "result", index })}
                      >
                        결과보기
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded py-1 ${
                          record.useForPrevention ? "bg-accent text-accent-ink" : "border border-line text-muted"
                        }`}
                        onClick={() =>
                          patchHistory(
                            history.map((item, i) =>
                              i === index ? { ...item, useForPrevention: !item.useForPrevention } : item,
                            ),
                          )
                        }
                      >
                        {record.useForPrevention ? "사용" : "미사용"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </aside>
        )}

        <section className={`flex min-h-0 min-w-0 flex-1 flex-col ${present ? "p-3" : "p-4"}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">{present ? "자리 배치" : "배치도 미리보기"}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {viewToggle}
              {!present && (
                <>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-[12px] text-icon hover:bg-hover hover:text-ink"
                  >
                    <BookOpen size={13} strokeWidth={1.5} /> 설명서
                  </button>
                  <button
                    type="button"
                    onClick={exportSeating}
                    className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-[12px] text-icon hover:bg-hover hover:text-ink"
                  >
                    <Download size={13} strokeWidth={1.5} /> 내보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => importRef.current?.click()}
                    className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-[12px] text-icon hover:bg-hover hover:text-ink"
                  >
                    <Upload size={13} strokeWidth={1.5} /> 가져오기
                  </button>
                  <input ref={importRef} type="file" accept=".json" className="hidden" onChange={importSeating} />
                  <button
                    type="button"
                    onClick={enterPresent}
                    className="btn-cta flex h-8 items-center gap-1 rounded-md px-3 text-[12px]"
                  >
                    <Maximize2 size={13} strokeWidth={1.5} /> 학생 화면
                  </button>
                </>
              )}
              {present && (
                <button
                  type="button"
                  onClick={leavePresent}
                  className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-[12px] text-icon hover:bg-hover hover:text-ink"
                >
                  <Minimize2 size={13} strokeWidth={1.5} /> 돌아가기
                </button>
              )}
            </div>
          </div>

          <div className={`flex min-h-0 flex-1 items-center justify-center ${present ? "overflow-hidden px-1 py-1" : "overflow-hidden p-2"}`}>{grid}</div>

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {present ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={runArrangement}
                  className="btn-cta h-11 min-w-40 rounded-lg px-6 text-[15px] font-semibold disabled:opacity-50"
                >
                  자리 섞기
                </button>
                <button
                  type="button"
                  onClick={saveRecord}
                  className="flex h-11 items-center gap-1 rounded-lg border border-line px-4 text-[13px] text-icon hover:bg-hover hover:text-ink"
                >
                  <Save size={14} strokeWidth={1.5} /> 배치 기록 저장
                </button>
                <button
                  type="button"
                  onClick={exportSeating}
                  className="flex h-11 items-center gap-1 rounded-lg border border-line px-4 text-[13px] text-icon hover:bg-hover hover:text-ink"
                >
                  <Download size={14} strokeWidth={1.5} /> 내보내기
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={runArrangement}
                  className="btn-cta h-9 min-w-32 rounded-lg px-4 text-[13px] disabled:opacity-50"
                >
                  자리 섞기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (Object.keys(settings.fixedSeats).length === 0) {
                      showToast("고정된 자리가 없습니다.")
                      return
                    }
                    patchSettings({ fixedSeats: {} })
                    showToast("고정된 자리가 모두 해제되었습니다.")
                  }}
                  className="flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-[13px] text-icon hover:bg-hover hover:text-ink"
                >
                  <Unlock size={14} strokeWidth={1.5} /> 고정 해제
                </button>
                <button
                  type="button"
                  onClick={() => {
                    animToken.current = Date.now()
                    setArrangement(null)
                    setPhase("idle")
                    setSpinLabels({})
                    setRevealed(new Set())
                    showToast("배치가 초기화되었습니다.")
                  }}
                  className="flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-[13px] text-icon hover:bg-hover hover:text-ink"
                >
                  <RotateCcw size={14} strokeWidth={1.5} /> 초기화
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )

  return (
    <>
      {present ? createPortal(shell, document.body) : <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{shell}</main>}

      {helpOpen && (
        <SettingsModal title="자리 바꾸기 설명서" onClose={() => setHelpOpen(false)} tall>
          <div className="p-4">
            <HelpBody />
          </div>
        </SettingsModal>
      )}

      {modal?.type === "export" && (
        <SettingsModal title="설정 내보내기" onClose={() => setModal(null)}>
          <div className="p-4">
            <p className="mb-2 text-[12px] text-muted">JSON을 복사하거나 파일로 저장하세요.</p>
            <textarea
              readOnly
              value={modal.json}
              className="h-48 w-full rounded-md border border-line bg-sunken p-2 font-mono text-[11px] text-ink"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-cta h-9 flex-1 rounded-lg text-[13px]" onClick={() => copyExport(modal.json)}>
                JSON 복사
              </button>
              <button
                type="button"
                className="h-9 flex-1 rounded-lg border border-line text-[13px] text-icon hover:bg-hover"
                onClick={() => downloadExport(modal.json)}
              >
                파일 저장
              </button>
            </div>
          </div>
        </SettingsModal>
      )}

      {modal?.type === "rename" && (
        <SettingsModal title="배치 기록명 수정" onClose={() => setModal(null)}>
          <div className="p-4">
            <input
              defaultValue={history[modal.index]?.name || ""}
              id="seating-record-name"
              placeholder="기록명 입력"
              className="mb-3 h-9 w-full rounded-md border border-line bg-sunken px-3 text-[13px] text-ink outline-none"
            />
            <button
              type="button"
              className="btn-cta h-9 w-full rounded-lg text-[13px]"
              onClick={() => {
                const value = document.getElementById("seating-record-name")?.value.trim()
                if (!value) {
                  showToast("기록명을 입력해주세요.")
                  return
                }
                patchHistory(history.map((item, i) => (i === modal.index ? { ...item, name: value } : item)))
                setModal(null)
                showToast("기록명이 수정되었습니다.")
              }}
            >
              저장
            </button>
          </div>
        </SettingsModal>
      )}

      {modal?.type === "result" && history[modal.index] && (
        <SettingsModal title={`배치 결과: ${formatRecordName(history[modal.index])}`} onClose={() => setModal(null)} tall>
          <div className="p-4">
            <MiniGrid record={history[modal.index]} students={students} settings={settings} />
            <button
              type="button"
              className="btn-cta mt-4 h-9 w-full rounded-lg text-[13px]"
              onClick={() => {
                const ok = downloadArrangementPng({
                  record: history[modal.index],
                  students,
                  rows: settings.rows,
                  cols: settings.cols,
                  layoutType: settings.layoutType,
                })
                showToast(ok ? "이미지를 저장했습니다." : "이미지 저장에 실패했습니다.")
              }}
            >
              이미지 다운로드
            </button>
          </div>
        </SettingsModal>
      )}

      {(modal?.type === "sep" || modal?.type === "front" || modal?.type === "seat") &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <button type="button" className="absolute inset-0 bg-overlay" aria-label="닫기" onClick={() => setModal(null)} />
            <div className="theme-surface relative z-10 w-[min(420px,calc(100vw-48px))] rounded-2xl border border-line bg-widget p-5 shadow-modal">
              {modal.type === "seat" && (
                <>
                  <h3 className="mb-3 text-[15px] font-semibold text-ink">
                    자리 설정 ({modal.key.replace("_", "행 ")}열)
                  </h3>
                  {settings.fixedSeats[modal.key] && (
                    <p className="mb-2 rounded-md bg-accent-soft px-2 py-1.5 text-[12px] text-ink">
                      현재 고정: {students.find((s) => s.id === settings.fixedSeats[modal.key])?.name}
                      <button type="button" className="ml-2 text-muted hover:text-ink" onClick={() => unfixSeat(modal.key)}>
                        해제
                      </button>
                    </p>
                  )}
                  <div className="mb-3 max-h-60 space-y-1 overflow-y-auto">
                    {(() => {
                      const takenIds = new Set(Object.values(settings.fixedSeats))
                      return [...students]
                        .sort((a, b) => Number(takenIds.has(a.id)) - Number(takenIds.has(b.id)))
                        .map((student) => {
                          const taken = takenIds.has(student.id)
                          return (
                            <button
                              key={student.id}
                              type="button"
                              disabled={taken}
                              onClick={() => fixSeat(modal.key, student.id)}
                              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[13px] text-ink hover:bg-hover disabled:opacity-40"
                            >
                              <span>{student.name}</span>
                              <span className="text-[11px] text-muted">
                                {taken ? "다른 자리 고정됨" : genderLabel(student.gender)}
                              </span>
                            </button>
                          )
                        })
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleDisabled(modal.key)}
                      className="h-9 flex-1 rounded-lg border border-line text-[13px] text-icon hover:bg-hover hover:text-ink"
                    >
                      {settings.disabledSeats.includes(modal.key) ? "사용함으로 변경" : "사용안함 처리"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="h-9 rounded-lg border border-line px-3 text-[13px] text-icon hover:bg-hover"
                    >
                      닫기
                    </button>
                  </div>
                </>
              )}
              {modal.type === "sep" && (
                <>
                  <h3 className="mb-3 text-[15px] font-semibold text-ink">분리 그룹 {modal.index + 1} 학생 선택</h3>
                  <div className="mb-3 max-h-60 space-y-1 overflow-y-auto">
                    {students.map((student) => {
                      const checked = settings.separationGroups[modal.index]?.includes(student.id)
                      return (
                        <label key={student.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-ink">
                          <input
                            type="checkbox"
                            checked={Boolean(checked)}
                            onChange={(event) => {
                              const groups = settings.separationGroups.map((group) => [...group])
                              const group = groups[modal.index] || []
                              groups[modal.index] = event.target.checked
                                ? [...group, student.id]
                                : group.filter((id) => id !== student.id)
                              patchSettings({ separationGroups: groups })
                            }}
                          />
                          {student.name}
                        </label>
                      )
                    })}
                  </div>
                  <button type="button" className="h-9 w-full rounded-lg border border-line text-[13px]" onClick={() => setModal(null)}>
                    완료
                  </button>
                </>
              )}
              {modal.type === "front" && (
                <>
                  <h3 className="mb-3 text-[15px] font-semibold text-ink">앞자리 배치 학생 선택</h3>
                  <div className="mb-3 max-h-60 space-y-1 overflow-y-auto">
                    {students.map((student) => {
                      const checked = settings.frontRowStudents.includes(student.id)
                      return (
                        <label key={student.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-ink">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              patchSettings({
                                frontRowStudents: event.target.checked
                                  ? [...settings.frontRowStudents, student.id]
                                  : settings.frontRowStudents.filter((id) => id !== student.id),
                              })
                            }}
                          />
                          {student.name}
                        </label>
                      )
                    })}
                  </div>
                  <button type="button" className="h-9 w-full rounded-lg border border-line text-[13px]" onClick={() => setModal(null)}>
                    완료
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}
