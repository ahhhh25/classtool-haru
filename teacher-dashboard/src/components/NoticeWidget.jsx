import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { fontFamilyCss } from "../constants/fonts"
import { widgetBackground } from "../constants/palette"
import { contentColor } from "../theme/displayColor"
import { useTheme } from "../theme/ThemeProvider"
import WidgetSettings from "./WidgetSettings"
import RichTextEditor from "./RichTextEditor"
import { getComposeFontSize, setComposeFontSize } from "../utils/composeFontSize"
import {
  applyStyleToRange,
  createDraftSlot,
  getOffsetsFromSelection,
  findActiveSchedule,
  formatSlotsLabel,
  getScheduleSlots,
  runsToPlain,
  toolbarWidgetFromRuns,
  widgetPatchToRunPatch,
} from "../utils/richText"

function cloneRuns(runs) {
  return (runs ?? []).map((run) => ({ ...run }))
}

function RichNoticeText({ runs, selectable, onSelectionChange, theme, textScale = 1 }) {
  const ref = useRef(null)

  const captureSelection = () => {
    if (!selectable) return
    onSelectionChange(getOffsetsFromSelection(ref.current))
  }

  if (!runs.length) return null

  return (
    <div
      ref={ref}
      onMouseUp={captureSelection}
      onKeyUp={captureSelection}
      className={`max-w-full text-center leading-snug whitespace-pre-wrap ${
        selectable ? "cursor-text select-text" : "select-none"
      }`}
    >
      {runs.map((run, index) => (
        <span
          key={`${index}-${run.text}`}
          style={{
            fontFamily: fontFamilyCss(run.fontFamily),
            fontSize: `${Number(run.fontSize) * textScale}pt`,
            fontWeight: run.bold ? 700 : 400,
            color: contentColor(run.color, theme),
            textDecoration: run.underline ? "underline" : "none",
            textUnderlineOffset: run.underline ? "0.16em" : undefined,
          }}
        >
          {run.text}
        </span>
      ))}
    </div>
  )
}

export function NoticeSettings({ widget, onChange }) {
  const { theme } = useTheme()
  const notice = widget.notice
  const selectionRef = useRef(null)
  const [selection, setSelection] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [draftSlots, setDraftSlots] = useState(() => [createDraftSlot()])
  const [draftRuns, setDraftRuns] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [formEditId, setFormEditId] = useState(null)
  const [savedEditId, setSavedEditId] = useState(null)
  const [manualDraftRuns, setManualDraftRuns] = useState(() => cloneRuns(notice.manualRuns))
  const manualDraftRef = useRef(manualDraftRuns)
  const editorFlushRef = useRef(null)
  const savedNotices = Array.isArray(notice.savedNotices) ? notice.savedNotices : []
  manualDraftRef.current = manualDraftRuns

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (notice.mode === "manual") {
      setManualDraftRuns(cloneRuns(notice.manualRuns))
      setSavedEditId(null)
    }
  }, [notice.mode])

  const activeSchedule = useMemo(
    () => findActiveSchedule(notice.schedules, now),
    [notice.schedules, now],
  )

  const editingSchedule =
    notice.schedules.find((schedule) => schedule.id === editingId) ?? activeSchedule

  const composeRuns = notice.mode === "manual" ? manualDraftRuns : draftRuns
  const toolbarFallback = {
    fontSize: getComposeFontSize(),
    fontFamily: widget.fontFamily,
    textColor: widget.textColor,
    bold: widget.bold,
    underline: widget.underline,
  }

  const updateNotice = (patch, extra = {}) => {
    onChange({ ...extra, notice: { ...notice, ...patch } })
  }

  const rememberSelection = (range) => {
    selectionRef.current = range
    setSelection(range)
  }

  const applySettings = (patch) => {
    if (patch.fontSize != null) setComposeFontSize(patch.fontSize)
    onChange(patch)
    const runPatch = widgetPatchToRunPatch(patch)
    if (!Object.keys(runPatch).length) return
    const flushed = editorFlushRef.current?.()
    const currentRuns = flushed ?? (notice.mode === "manual" ? manualDraftRuns : draftRuns)
    const range = selectionRef.current
    const styled = range
      ? applyStyleToRange(currentRuns, range.start, range.end, runPatch)
      : applyStyleToRange(currentRuns, 0, runsToPlain(currentRuns).length, runPatch)

    if (notice.mode === "manual") {
      setManualDraftRuns(styled)
      return
    }

    setDraftRuns(styled)
  }

  const resetForm = () => {
    setFormEditId(null)
    setDraftSlots([createDraftSlot()])
    setDraftRuns([])
    selectionRef.current = null
    setSelection(null)
  }

  const updateSlot = (id, patch) => {
    setDraftSlots((current) =>
      current.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)),
    )
  }

  const addSlot = () => {
    const last = draftSlots[draftSlots.length - 1]
    setDraftSlots((current) => [...current, createDraftSlot(last?.start, last?.end)])
  }

  const removeSlot = (id) => {
    setDraftSlots((current) => (current.length <= 1 ? current : current.filter((slot) => slot.id !== id)))
  }

  const startEditSchedule = (schedule) => {
    setFormEditId(schedule.id)
    setEditingId(schedule.id)
    setDraftSlots(
      getScheduleSlots(schedule).map((slot) => createDraftSlot(slot.start, slot.end)),
    )
    setDraftRuns((schedule.runs ?? []).map((run) => ({ ...run })))
    selectionRef.current = null
    setSelection(null)
  }

  const saveSchedule = () => {
    const text = runsToPlain(draftRuns).replace(/\s+$/g, "").replace(/^\s+/, "")
    const slots = draftSlots.filter((slot) => slot.start && slot.end)
    if (!text || slots.length === 0) return
    const runs = draftRuns.map((run) => ({ ...run }))

    if (formEditId) {
      updateNotice({
        schedules: notice.schedules.map((schedule) =>
          schedule.id !== formEditId ? schedule : { ...schedule, slots, runs },
        ),
      })
      resetForm()
      return
    }

    const id = crypto.randomUUID()
    updateNotice({
      schedules: [
        ...notice.schedules,
        {
          id,
          slots,
          runs,
        },
      ],
    })
    setEditingId(id)
    setDraftRuns([])
    setDraftSlots([createDraftSlot()])
    selectionRef.current = null
    setSelection(null)
  }

  const removeSchedule = (id) => {
    updateNotice({
      schedules: notice.schedules.filter((schedule) => schedule.id !== id),
    })
    if (editingId === id) setEditingId(null)
    if (formEditId === id) resetForm()
    selectionRef.current = null
    setSelection(null)
  }

  const applySavedNotice = (item) => {
    const runs = cloneRuns(item.runs)
    setSavedEditId(null)
    setManualDraftRuns(runs)
    selectionRef.current = null
    setSelection(null)
    updateNotice({
      manualRuns: cloneRuns(runs),
      manualSavedId: item.id,
    })
  }

  const startEditSaved = (item) => {
    setSavedEditId(item.id)
    setManualDraftRuns(cloneRuns(item.runs))
    selectionRef.current = null
    setSelection(null)
  }

  const cancelSavedEdit = () => {
    const item = savedNotices.find((noticeItem) => noticeItem.id === savedEditId)
    if (item) setManualDraftRuns(cloneRuns(item.runs))
    setSavedEditId(null)
    selectionRef.current = null
    setSelection(null)
  }

  const saveSavedNotice = () => {
    const text = runsToPlain(manualDraftRuns).replace(/\s+$/g, "").replace(/^\s+/, "")
    if (!text) return
    const runs = cloneRuns(manualDraftRuns)

    if (savedEditId) {
      updateNotice({
        savedNotices: savedNotices.map((item) =>
          item.id !== savedEditId ? item : { ...item, runs },
        ),
      })
      setSavedEditId(null)
      return
    }

    const id = crypto.randomUUID()
    updateNotice({
      savedNotices: [...savedNotices, { id, runs }],
    })
  }

  const showManualNotice = () => {
    const runs = cloneRuns(editorFlushRef.current?.() ?? manualDraftRef.current)
    updateNotice(
      {
        mode: "manual",
        manualRuns: runs,
        manualSavedId: savedEditId ?? notice.manualSavedId ?? null,
      },
      { settingsOpen: false },
    )
  }

  const removeSavedNotice = (id) => {
    updateNotice({
      savedNotices: savedNotices.filter((item) => item.id !== id),
      manualSavedId: notice.manualSavedId === id ? null : notice.manualSavedId,
    })
    if (savedEditId === id) setSavedEditId(null)
  }

  const editorClassName =
    "widget-scroll h-[17rem] w-full overflow-y-auto whitespace-pre-wrap rounded-md border border-line px-3 py-2.5 outline-none focus:border-line-strong"
  const editorInk = contentColor(widget.textColor, theme)
  const editorBg = widgetBackground(widget.bgColor, theme)
  const editorStyle = {
    color: editorInk,
    caretColor: editorInk,
    fontSize: `${Number(toolbarFallback.fontSize)}pt`,
    backgroundColor: editorBg || "var(--sunken)",
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-20 shrink-0 overflow-visible border-b border-line bg-widget">
        <div className="flex items-stretch">
          <div className="min-w-0 flex-1">
            <WidgetSettings
              widget={{
                ...toolbarWidgetFromRuns(composeRuns, selection, toolbarFallback),
                bgColor: widget.bgColor,
              }}
              onChange={(patch) => {
                if (patch.bgColor != null) onChange({ bgColor: patch.bgColor })
                const rest = { ...patch }
                delete rest.bgColor
                if (Object.keys(rest).length) applySettings(rest)
              }}
              compact
              bare
            />
          </div>
          {notice.mode === "auto" && (
            <>
              <div className="my-2.5 w-px shrink-0 bg-line" aria-hidden="true" />
              <div className="flex shrink-0 flex-col justify-center gap-1 overflow-visible px-4 py-2.5">
                {draftSlots.map((slot, index) => (
                  <div key={slot.id} className="flex items-center gap-1">
                    <input
                      type="time"
                      aria-label={`시작 시간 ${index + 1}`}
                      value={slot.start}
                      onChange={(event) => updateSlot(slot.id, { start: event.target.value })}
                      className="h-7 w-[138px] rounded-md border border-line bg-sunken px-1.5 text-[12px] text-ink outline-none focus:border-line-strong"
                    />
                    <span className="text-[12px] text-muted">~</span>
                    <input
                      type="time"
                      aria-label={`끝 시간 ${index + 1}`}
                      value={slot.end}
                      onChange={(event) => updateSlot(slot.id, { end: event.target.value })}
                      className="h-7 w-[138px] rounded-md border border-line bg-sunken px-1.5 text-[12px] text-ink outline-none focus:border-line-strong"
                    />
                    {index === 0 ? (
                      <button
                        type="button"
                        onClick={addSlot}
                        className="h-7 shrink-0 rounded-md border border-line px-2 text-[12px] whitespace-nowrap text-icon transition-colors hover:bg-hover hover:text-ink"
                      >
                        시간대 추가
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label="시간대 삭제"
                        onClick={() => removeSlot(slot.id)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-icon hover:bg-hover hover:text-ink"
                      >
                        <X size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {notice.mode === "auto" ? (
          <div className="space-y-3">
            <RichTextEditor
              runs={draftRuns}
              fallbackStyle={{
                fontFamily: widget.fontFamily,
                fontSize: widget.fontSize,
                color: widget.textColor,
                bold: widget.bold,
                underline: widget.underline,
              }}
              theme={theme}
              ariaLabel="공지 내용"
              className={editorClassName}
              style={editorStyle}
              onSelectionChange={rememberSelection}
              onChangeRuns={setDraftRuns}
              flushRef={editorFlushRef}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  saveSchedule()
                }
              }}
            />
            <div className="flex justify-end gap-2">
              {formEditId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-[13px] text-icon transition-colors hover:bg-hover hover:text-ink"
                >
                  <X size={15} strokeWidth={1.5} />
                  취소
                </button>
              )}
              <button
                type="button"
                onClick={saveSchedule}
                className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-[13px] text-icon transition-colors hover:bg-hover hover:text-ink"
              >
                {formEditId ? (
                  <>
                    <Check size={15} strokeWidth={1.5} />
                    저장
                  </>
                ) : (
                  <>
                    <Plus size={15} strokeWidth={1.5} />
                    추가
                  </>
                )}
              </button>
            </div>
            <ul className="space-y-1.5">
              {notice.schedules.length === 0 && (
                <li className="text-[12px] text-faint">등록된 시간대가 없습니다.</li>
              )}
              {notice.schedules.map((schedule) => {
                const selected = editingSchedule?.id === schedule.id
                return (
                  <li key={schedule.id}>
                    <div
                      className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left ${
                        selected ? "border-line-strong bg-hover" : "border-line"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(schedule.id)
                          selectionRef.current = null
                        }}
                        className="flex min-w-0 flex-1 items-start gap-2"
                      >
                        <span className="shrink-0 text-[12px] text-muted">
                          {formatSlotsLabel(schedule)}
                        </span>
                        <span className="min-w-0 flex-1 text-left text-[13px] leading-snug whitespace-pre-wrap text-ink-soft">
                          {runsToPlain(schedule.runs)}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="시간대 수정"
                        onClick={() => startEditSchedule(schedule)}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-icon hover:bg-hover hover:text-ink"
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label="시간대 삭제"
                        onClick={() => removeSchedule(schedule.id)}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-icon hover:bg-hover hover:text-ink"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <RichTextEditor
              runs={manualDraftRuns}
              fallbackStyle={{
                fontFamily: widget.fontFamily,
                fontSize: widget.fontSize,
                color: widget.textColor,
                bold: widget.bold,
                underline: widget.underline,
              }}
              theme={theme}
              ariaLabel="공지 내용"
              className={editorClassName}
              style={editorStyle}
              onSelectionChange={rememberSelection}
              onChangeRuns={setManualDraftRuns}
              flushRef={editorFlushRef}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  showManualNotice()
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                {savedEditId && (
                  <button
                    type="button"
                    onClick={cancelSavedEdit}
                    className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-[13px] text-icon transition-colors hover:bg-hover hover:text-ink"
                  >
                    <X size={15} strokeWidth={1.5} />
                    취소
                  </button>
                )}
                <button
                  type="button"
                  onClick={saveSavedNotice}
                  className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-[13px] text-icon transition-colors hover:bg-hover hover:text-ink"
                >
                  {savedEditId ? (
                    <>
                      <Check size={15} strokeWidth={1.5} />
                      저장
                    </>
                  ) : (
                    <>
                      <Plus size={15} strokeWidth={1.5} />
                      자주 쓰는 목록에 추가
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={showManualNotice}
                className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-[13px] text-icon transition-colors hover:bg-hover hover:text-ink"
              >
                등록
              </button>
            </div>
            <ul className="space-y-1.5">
              {savedNotices.length === 0 && (
                <li className="text-[12px] text-faint">저장된 공지가 없습니다.</li>
              )}
              {savedNotices.map((item) => {
                const selected = (savedEditId ?? notice.manualSavedId) === item.id
                return (
                  <li key={item.id}>
                    <div
                      className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left ${
                        selected ? "border-line-strong bg-hover" : "border-line"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => applySavedNotice(item)}
                        className="min-w-0 flex-1 text-left text-[13px] leading-snug whitespace-pre-wrap text-ink-soft"
                      >
                        {runsToPlain(item.runs)}
                      </button>
                      <button
                        type="button"
                        aria-label="공지 수정"
                        onClick={() => startEditSaved(item)}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-icon hover:bg-hover hover:text-ink"
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label="공지 삭제"
                        onClick={() => removeSavedNotice(item.id)}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-icon hover:bg-hover hover:text-ink"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default function NoticeWidget({ widget, textScale = 1 }) {
  const { theme } = useTheme()
  const notice = widget.notice
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const activeSchedule = useMemo(
    () => findActiveSchedule(notice.schedules, now),
    [notice.schedules, now],
  )

  const liveRuns = notice.mode === "manual" ? notice.manualRuns : (activeSchedule?.runs ?? [])
  const hasLive = runsToPlain(liveRuns).length > 0

  return (
    <div className="widget-scroll relative flex h-full items-center justify-center overflow-y-auto px-5">
      {hasLive ? (
        <RichNoticeText
          runs={liveRuns}
          selectable={false}
          theme={theme}
          textScale={textScale}
          onSelectionChange={() => {}}
        />
      ) : (
        <p className="widget-empty text-[13px]">
          {notice.mode === "manual" ? "표시할 공지가 없습니다." : "지금은 표시할 공지가 없습니다."}
        </p>
      )}
    </div>
  )
}
