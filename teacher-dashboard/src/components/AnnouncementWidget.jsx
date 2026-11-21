import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { CalendarDays, Clock, Maximize2, Minimize2, Plus, Settings, Trash2, Volume2 } from "lucide-react"
import { widgetBackground } from "../constants/palette"
import { contentColor } from "../theme/displayColor"
import { useTheme } from "../theme/ThemeProvider"
import {
  applyAnnouncementLifecycle,
  cloneAnnouncementItem,
  createAnnouncementItem,
  defaultExpireParts,
  defaultScheduleParts,
  expireStartMs,
  formatDateInput,
  formatExpireLabel,
  formatScheduleLabel,
  hasExpire,
  isExpireValid,
  isScheduledDue,
  parseDateInput,
  parseTimeInput,
  reorderAnnouncements,
  scheduledAtMs,
  toScheduledItem,
  toVisibleItem,
} from "../utils/announcement"
import {
  announcementSpeechText,
  ensureAnnouncementSpeechBridge,
  readSpeechSettings,
  requestAnnouncementSpeech,
  saveSpeechSettings,
  SPEECH_EXPAND_MS,
  stopAnnouncementPreview,
  subscribeAnnouncementPreview,
  subscribeAnnouncementSpeechStatus,
  subscribeKoreanVoices,
  toggleAnnouncementPreview,
} from "../utils/announcementSpeech"
import {
  isHaruReceiver,
  persistAnnouncementFocus,
  persistWidgetFocus,
  readAnnouncementFocus,
  subscribeSync,
  SYNC,
} from "../utils/syncChannel"
import { getComposeFontSize, setComposeFontSize } from "../utils/composeFontSize"
import {
  applyStyleToRange,
  plainToRuns,
  runsToPlain,
  toolbarWidgetFromRuns,
  widgetPatchToRunPatch,
} from "../utils/richText"
import FocusMode from "./FocusMode"
import RichTextEditor, { runStyle } from "./RichTextEditor"
import SettingsModal from "./SettingsModal"
import WidgetSettings from "./WidgetSettings"

const itemActionBtn =
  "flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-icon"

const settingCard =
  "flex h-full min-w-0 flex-col gap-2 rounded-md border border-line bg-sunken px-3 py-2.5"

function itemFallback(item) {
  return {
    fontFamily: item.fontFamily,
    fontSize: item.fontSize,
    color: item.textColor,
    bold: item.bold,
    underline: item.underline,
    strike: item.strike,
  }
}

function itemRuns(item) {
  if (Array.isArray(item.runs) && item.runs.length) return item.runs
  if (item.text) return plainToRuns(item.text, itemFallback(item))
  return item.runs ?? []
}

function toolbarFromItem(item, selection) {
  return {
    ...toolbarWidgetFromRuns(itemRuns(item), selection, {
      fontSize: item.fontSize,
      fontFamily: item.fontFamily,
      textColor: item.textColor,
      bold: item.bold,
      underline: item.underline,
      strike: item.strike,
    }),
    bgColor: item.bgColor,
  }
}

function isReorderHandle(target) {
  return !target.closest("button")
}

function slotFromPointer(list, clientY) {
  const rows = [...list.querySelectorAll("[data-announcement-id]")]
  if (!rows.length) return 0
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) return index
  }
  return rows.length
}

function draftFromWidget(widget) {
  return {
    ...createAnnouncementItem({
      fontFamily: widget.fontFamily,
      fontSize: getComposeFontSize(),
      textColor: widget.textColor,
      bgColor: widget.bgColor,
      bold: widget.bold,
      underline: widget.underline,
      strike: widget.strike,
    }),
    scheduleEnabled: false,
    expireEnabled: false,
    autoSpeak: false,
    ...defaultScheduleParts(),
  }
}

function expirePatch(item, patch) {
  const next = { ...item, ...patch }
  if (!next.expireEnabled || isExpireValid(next)) return patch
  return { ...patch, ...defaultExpireParts(expireStartMs(next)) }
}

function PickerField({ kind, value, min, ariaLabel, pickerLabel, onCommit }) {
  const parse = kind === "date" ? parseDateInput : parseTimeInput
  const committed = parse(value) || ""
  const [draft, setDraft] = useState(committed)
  const [focused, setFocused] = useState(false)
  const selectOnMouseUp = useRef(false)

  useEffect(() => {
    if (!focused) setDraft(committed)
  }, [committed, focused])

  const commitOrRevert = (raw) => {
    const next = parse(raw)
    if (next) {
      onCommit(next)
      setDraft(next)
      return
    }
    setDraft(committed)
  }

  const selectAll = (target) => {
    if (!target || typeof target.select !== "function") return
    target.select()
  }

  return (
    <div className={`relative ${kind === "date" ? "w-[10.25rem]" : "w-[7.75rem]"}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        placeholder={kind === "date" ? "YYYY-MM-DD" : "HH:mm"}
        maxLength={kind === "date" ? 10 : 5}
        value={focused ? draft : committed}
        onFocus={(event) => {
          setFocused(true)
          setDraft(committed)
          selectOnMouseUp.current = true
          const target = event.currentTarget
          requestAnimationFrame(() => selectAll(target))
        }}
        onMouseUp={(event) => {
          if (!selectOnMouseUp.current) return
          selectOnMouseUp.current = false
          event.preventDefault()
          selectAll(event.currentTarget)
        }}
        onChange={(event) => {
          const raw =
            kind === "date"
              ? event.target.value.replace(/[^\d-]/g, "").slice(0, 10)
              : event.target.value.replace(/[^\d:]/g, "").slice(0, 5)
          setDraft(raw)
          const next = parse(raw)
          if (next) onCommit(next)
        }}
        onBlur={() => {
          selectOnMouseUp.current = false
          setFocused(false)
          commitOrRevert(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
        className="h-8 w-full rounded-md border border-line bg-widget py-0 pr-7 pl-2 text-[13px] text-ink outline-none focus:border-line-strong"
      />
      <div className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center">
        {kind === "date" ? (
          <CalendarDays size={14} strokeWidth={1.5} className="pointer-events-none text-icon" />
        ) : (
          <Clock size={14} strokeWidth={1.5} className="pointer-events-none text-icon" />
        )}
        <input
          type={kind}
          step={kind === "time" ? 60 : undefined}
          min={min}
          tabIndex={-1}
          aria-label={pickerLabel}
          value={committed}
          onChange={(event) => {
            const next = parse(event.target.value)
            if (!next) return
            onCommit(next)
            setDraft(next)
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>
    </div>
  )
}

function RichRuns({ runs, theme, className, textScale = 1 }) {
  if (!runs?.length) return null
  return (
    <p className={className}>
      {runs.map((run, index) => (
        <span key={`${index}-${run.text}`} style={runStyle(run, theme, textScale)}>
          {run.text}
        </span>
      ))}
    </p>
  )
}

function AnnouncementItemFrame({ item, theme, textScale = 1, trailing = null, speaking = false }) {
  const runs = itemRuns(item)
  const text = runsToPlain(runs)
  return (
    <div
      className={`relative rounded-lg border border-line-strong ${speaking ? "announcement-speaking" : ""}`}
      data-announcement-speaking={speaking ? "true" : undefined}
      style={{ backgroundColor: widgetBackground(item.bgColor, theme) || "var(--sunken)" }}
    >
      <div className="flex items-start gap-1 px-2.5 py-3">
        {text ? (
          <RichRuns
            runs={runs}
            theme={theme}
            textScale={textScale}
            className="min-h-10 min-w-0 flex-1 whitespace-pre-wrap px-1 py-1"
          />
        ) : (
          <p className="min-h-10 min-w-0 flex-1 px-1 py-1" />
        )}
        {trailing ?? <div className="w-6 shrink-0" aria-hidden />}
      </div>
    </div>
  )
}

const ANNOUNCEMENT_FOCUS_HALO = 12

function AnnouncementFocus({ item, theme, textScale, sourceWidth, onClose, inert = false, speaking = false }) {
  const stageRef = useRef(null)
  const boxRef = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (inert) return undefined
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [inert, onClose])

  useLayoutEffect(() => {
    const stage = stageRef.current
    const box = boxRef.current
    if (!stage || !box) return undefined
    const fit = () => {
      const styles = window.getComputedStyle(stage)
      const padX = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0)
      const padY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0)
      const availW = stage.clientWidth - padX
      const availH = stage.clientHeight - padY
      const width = sourceWidth || box.offsetWidth
      const height = box.offsetHeight
      if (width < 1 || height < 1 || availW < 1 || availH < 1) return
      const halo = ANNOUNCEMENT_FOCUS_HALO * 2
      setScale(Math.max(0.05, Math.min(availW / (width + halo), availH / (height + halo))))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    observer.observe(box)
    return () => observer.disconnect()
  }, [item, sourceWidth, textScale, theme, speaking])

  const width = sourceWidth || undefined

  return (
    <FocusMode inert={inert} onClose={onClose}>
      <div className="flex h-full flex-col">
        <header className="relative z-10 flex h-9 shrink-0 items-center justify-end px-1.5">
          <button
            type="button"
            aria-label="축소"
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded text-icon transition-colors hover:bg-hover hover:text-ink"
          >
            <Minimize2 size={14} strokeWidth={1.5} />
          </button>
        </header>
        <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden px-6 py-6">
          <div
            ref={boxRef}
            className="absolute top-1/2 left-1/2 pointer-events-none origin-center select-none"
            style={{
              width,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            <AnnouncementItemFrame item={item} theme={theme} textScale={textScale} speaking={speaking} />
          </div>
        </div>
      </div>
    </FocusMode>
  )
}

function PreviewFrame({ width = 0, children }) {
  return (
    <div className="flex justify-center">
      <div
        className="min-w-0"
        style={width > 0 ? { width: `${width}px`, maxWidth: "100%" } : { width: "100%" }}
      >
        {children}
      </div>
    </div>
  )
}

function SpeechSettingsPanel({ getPreviewText }) {
  const [settings, setSettings] = useState(readSpeechSettings)
  const [voices, setVoices] = useState([])
  const [previewing, setPreviewing] = useState(false)
  const [notice, setNotice] = useState("")
  const [appliedVoice, setAppliedVoice] = useState("")

  useEffect(() => subscribeKoreanVoices(setVoices), [])
  useEffect(() => subscribeAnnouncementPreview(setPreviewing), [])
  useEffect(
    () =>
      subscribeAnnouncementSpeechStatus((status) => {
        if (status.appliedVoice) setAppliedVoice(status.appliedVoice)
        if (status.error === "voice-unavailable") {
          const label = status.requestedVoice || "선택한 목소리"
          setNotice(`선택한 목소리 ‘${label}’를 이 브라우저에서 사용할 수 없습니다.`)
          return
        }
        if (status.reason === "start" && status.appliedVoice) {
          setNotice(`‘${status.appliedVoice}’로 읽고 있습니다.`)
        }
      }),
    [],
  )
  useEffect(
    () => () => {
      stopAnnouncementPreview()
    },
    [],
  )

  const selectedInList = voices.some((voice) => voice.voiceURI === settings.voiceURI)
  const selectValue = settings.voiceURI

  const update = (patch) => {
    setNotice("")
    setSettings(saveSpeechSettings(patch))
  }

  const onVoiceChange = (voiceURI) => {
    const voice = voices.find((item) => item.voiceURI === voiceURI)
    update({
      voiceURI,
      voiceName: voice?.name || "",
      voiceLang: voice?.lang || "",
    })
  }

  return (
    <div className={settingCard}>
      <p className="text-[12px] tracking-wide text-muted uppercase">음성 읽기 설정</p>
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: "slow", label: "느리게" },
          { id: "normal", label: "보통" },
          { id: "fast", label: "빠르게" },
        ].map((option) => {
          const selected = settings.rate === option.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ rate: option.id })}
              className={`h-8 rounded-md border px-3 text-[13px] transition-colors ${
                selected
                  ? "border-line-strong bg-active text-ink"
                  : "border-line bg-widget text-icon hover:bg-hover hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] text-muted">목소리</span>
        <select
          value={selectValue}
          onChange={(event) => onVoiceChange(event.target.value)}
          className="h-8 w-full min-w-0 rounded-md border border-line bg-widget px-2 text-[13px] text-ink"
        >
          <option value="">브라우저 기본</option>
          {!selectedInList && settings.voiceURI && (
            <option value={settings.voiceURI}>
              {settings.voiceName || settings.voiceURI} (이 브라우저에 없음)
            </option>
          )}
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-muted">
          이 컴퓨터에서 사용할 수 있는 목소리입니다.
        </span>
      </label>
      {notice ? <p className="text-[12px] text-ink">{notice}</p> : null}
      {appliedVoice && !notice ? (
        <p className="text-[11px] text-muted">마지막 재생: {appliedVoice}</p>
      ) : null}
      <button
        type="button"
        aria-pressed={previewing}
        onClick={() => {
          const text = announcementSpeechText(getPreviewText?.() || "")
          if (!text && !previewing) return
          void toggleAnnouncementPreview(text).then((result) => {
            setPreviewing(Boolean(result?.active))
            if (result?.error) setNotice(result.error)
            else if (result?.active && result.appliedVoice) {
              setNotice(`미리듣기: ‘${result.appliedVoice}’`)
              setAppliedVoice(result.appliedVoice)
            } else setNotice("")
          })
        }}
        className={`mt-auto flex h-8 w-fit items-center gap-1.5 rounded-md border px-3 text-[13px] transition-colors ${
          previewing
            ? "border-line-strong bg-active text-ink"
            : "border-line bg-widget text-icon hover:bg-hover hover:text-ink"
        }`}
      >
        <Volume2 size={14} strokeWidth={1.5} />
        {previewing ? "미리듣기 중지" : "미리듣기"}
      </button>
    </div>
  )
}

function AnnouncementEditorModal({
  title,
  confirmLabel,
  hint,
  draft,
  phrases = [],
  scheduledItems = [],
  showSchedule = false,
  previewWidth = 0,
  textScale = 1,
  onChange,
  onClose,
  onConfirm,
  onSavePhrase,
  onDeletePhrase,
  onApplyPhrase,
  onEditScheduled,
  onDeleteScheduled,
  theme,
}) {
  const draftRef = useRef(draft)
  const selectionRef = useRef(null)
  const editorFlushRef = useRef(null)
  const [selection, setSelection] = useState(null)
  const [oneShotMarks, setOneShotMarks] = useState(null)
  draftRef.current = draft
  const runs = itemRuns(draft)
  const runToolbar = toolbarFromItem(draft, selection)
  const toolbarWidget = {
    ...runToolbar,
    bold: selection ? runToolbar.bold : Boolean(oneShotMarks?.bold),
    underline: selection ? runToolbar.underline : Boolean(oneShotMarks?.underline),
    strike: selection ? runToolbar.strike : Boolean(oneShotMarks?.strike),
  }

  const applyStyle = (patch) => {
    if (patch.fontSize != null) setComposeFontSize(patch.fontSize)
    const flushed = editorFlushRef.current?.()
    const currentRuns = flushed ?? itemRuns(draftRef.current)
    const runPatch = widgetPatchToRunPatch(patch)
    const oneShot = patch.bold != null || patch.underline != null || patch.strike != null
    const sticky = { ...patch }
    delete sticky.bold
    delete sticky.underline
    delete sticky.strike
    const range = selectionRef.current

    if (range && Object.keys(runPatch).length) {
      const nextRuns = applyStyleToRange(currentRuns, range.start, range.end, runPatch)
      onChange({ ...sticky, runs: nextRuns })
      if (oneShot) setOneShotMarks({ bold: false, underline: false, strike: false })
      return
    }

    if (oneShot) {
      setOneShotMarks((current) => ({
        bold: patch.bold ?? current?.bold ?? false,
        underline: patch.underline ?? current?.underline ?? false,
        strike: patch.strike ?? current?.strike ?? false,
      }))
    }

    const stickyRun = widgetPatchToRunPatch(sticky)
    if (!Object.keys(stickyRun).length) {
      if (Object.keys(sticky).length) onChange({ ...sticky })
      return
    }
    const nextRuns = applyStyleToRange(currentRuns, 0, runsToPlain(currentRuns).length, stickyRun)
    onChange({ ...sticky, runs: nextRuns })
  }

  return (
    <SettingsModal title={title} onClose={onClose} fit contentWidth={previewWidth}>
      <div className="shrink-0 border-b border-line">
        <WidgetSettings widget={toolbarWidget} onChange={applyStyle} compact bare />
      </div>
      <div className="space-y-3 px-4 py-4">
        <PreviewFrame width={previewWidth}>
        <RichTextEditor
          runs={runs}
          fallbackStyle={{
            ...itemFallback(draft),
            bold: Boolean(oneShotMarks?.bold),
            underline: Boolean(oneShotMarks?.underline),
            strike: Boolean(oneShotMarks?.strike),
          }}
          theme={theme}
          textScale={textScale}
          ariaLabel="알림 내용"
          flushRef={editorFlushRef}
          onSelectionChange={(range) => {
            selectionRef.current = range
            setSelection(range)
          }}
          onChangeRuns={(nextRuns) => onChange({ runs: nextRuns })}
          insertStyle={oneShotMarks}
          onInsertStyleConsumed={() => setOneShotMarks({ bold: false, underline: false, strike: false })}
          className="widget-scroll h-[17rem] w-full overflow-y-auto whitespace-pre-wrap rounded-md border border-line px-1 py-3 outline-none focus:border-line-strong"
          style={{
            color: contentColor(draft.textColor, theme),
            caretColor: contentColor(draft.textColor, theme),
            fontSize: `${Number(draft.fontSize) * textScale}pt`,
            backgroundColor: widgetBackground(draft.bgColor, theme) || "var(--sunken)",
          }}
        />
        </PreviewFrame>
        {hint && <p className="text-[12px] text-muted">{hint}</p>}
        {showSchedule && (
            <div className="min-w-0 space-y-2 rounded-md border border-line bg-sunken px-3 py-2.5">
              <p className="text-[12px] tracking-wide text-muted uppercase">표시 시점</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: false, label: "지금 표시" },
                  { id: true, label: "예약 표시" },
                ].map((option) => {
                  const selected = Boolean(draft.scheduleEnabled) === option.id
                  return (
                    <button
                      key={String(option.id)}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        const patch = { scheduleEnabled: option.id }
                        if (option.id && (!draft.scheduledDate || !draft.scheduledTime)) {
                          Object.assign(patch, defaultScheduleParts())
                        }
                        onChange(expirePatch(draft, patch))
                      }}
                      className={`h-8 rounded-md border px-3 text-[13px] transition-colors ${
                        selected
                          ? "border-line-strong bg-active text-ink"
                          : "border-line bg-widget text-icon hover:bg-hover hover:text-ink"
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
              {draft.scheduleEnabled && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">날짜</span>
                    <PickerField
                      kind="date"
                      ariaLabel="표시 날짜"
                      pickerLabel="달력에서 표시 날짜 선택"
                      value={draft.scheduledDate || ""}
                      onCommit={(next) => onChange({ scheduledDate: next })}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">시간</span>
                    <PickerField
                      kind="time"
                      ariaLabel="표시 시간"
                      pickerLabel="표시 시간 선택"
                      value={draft.scheduledTime || ""}
                      onCommit={(next) => onChange({ scheduledTime: next })}
                    />
                  </label>
                </div>
              )}
            </div>
        )}
        <div className="grid grid-cols-1 items-stretch gap-3 min-[560px]:grid-cols-2 min-[800px]:grid-cols-3">
          <div className={settingCard}>
            <p className="text-[12px] tracking-wide text-muted uppercase">종료 시점</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: false, label: "설정 안 함" },
                { id: true, label: "종료 시점 설정" },
              ].map((option) => {
                const selected = Boolean(draft.expireEnabled) === option.id
                return (
                  <button
                    key={String(option.id)}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (!option.id) {
                        onChange({ expireEnabled: false })
                        return
                      }
                      const patch = { expireEnabled: true }
                      if (!draft.expireDate || !draft.expireTime) {
                        Object.assign(patch, defaultExpireParts(expireStartMs({ ...draft, expireEnabled: true })))
                      }
                      onChange(expirePatch(draft, patch))
                    }}
                    className={`h-8 rounded-md border px-3 text-[13px] transition-colors ${
                      selected
                        ? "border-line-strong bg-active text-ink"
                        : "border-line bg-widget text-icon hover:bg-hover hover:text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {draft.expireEnabled && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-muted">날짜</span>
                  <PickerField
                    kind="date"
                    ariaLabel="종료 날짜"
                    pickerLabel="달력에서 종료 날짜 선택"
                    min={
                      draft.scheduleEnabled && draft.scheduledDate
                        ? draft.scheduledDate
                        : formatDateInput(new Date())
                    }
                    value={draft.expireDate || ""}
                    onCommit={(next) => onChange({ expireDate: next })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-muted">시간</span>
                  <PickerField
                    kind="time"
                    ariaLabel="종료 시간"
                    pickerLabel="종료 시간 선택"
                    value={draft.expireTime || ""}
                    onCommit={(next) => onChange({ expireTime: next })}
                  />
                </label>
              </div>
            )}
            {draft.expireEnabled && !isExpireValid(draft) && (
              <p className="text-[12px] text-muted">
                {draft.scheduleEnabled
                  ? "종료 시점은 시작 시각보다 늦어야 합니다."
                  : "종료 시점은 현재 시각보다 늦어야 합니다."}
              </p>
            )}
          </div>
        <div className={settingCard}>
          <p className="text-[12px] tracking-wide text-muted uppercase">음성 자동 읽기</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: false, label: "끄기" },
              { id: true, label: "켜기" },
            ].map((option) => {
              const selected = Boolean(draft.autoSpeak) === option.id
              return (
                <button
                  key={String(option.id)}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({ autoSpeak: option.id })}
                  className={`h-8 rounded-md border px-3 text-[13px] transition-colors ${
                    selected
                      ? "border-line-strong bg-active text-ink"
                      : "border-line bg-widget text-icon hover:bg-hover hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <p className="text-[12px] text-muted">
            켜 두면 이 알림이 화면에 나타날 때 TV에서 한 번 읽어 줍니다.
          </p>
        </div>
        <SpeechSettingsPanel
          getPreviewText={() => {
            const flushed = editorFlushRef.current?.()
            const runs = flushed ?? itemRuns(draftRef.current)
            return runsToPlain(runs)
          }}
        />
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              const flushed = editorFlushRef.current?.()
              const runs = flushed ?? itemRuns(draftRef.current)
              const text = runsToPlain(runs).replace(/^\s+|\s+$/g, "")
              if (!text) return
              onSavePhrase?.({ ...draftRef.current, runs: runs.map((run) => ({ ...run })) })
            }}
            className="flex h-9 items-center gap-1 rounded-md border border-line px-3 text-[13px] text-icon transition-colors hover:bg-hover hover:text-ink"
          >
            <Plus size={15} strokeWidth={1.5} />
            자주 쓰는 목록에 추가
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md border border-line px-4 text-[13px] text-ink transition-colors hover:bg-hover"
          >
            {confirmLabel}
          </button>
        </div>
        <ul className="max-h-40 space-y-1.5 overflow-y-auto">
          {phrases.length === 0 && (
            <li className="text-[12px] text-faint">저장된 문구가 없습니다.</li>
          )}
          {phrases.map((item) => (
            <li key={item.id}>
              <div className="flex w-full items-start gap-2 rounded-md border border-line px-2.5 py-2">
                <button
                  type="button"
                  onClick={() => onApplyPhrase?.(item)}
                  className="min-w-0 flex-1 text-left text-[13px] leading-snug whitespace-pre-wrap text-ink-soft"
                >
                  {runsToPlain(itemRuns(item)) || "내용 없음"}
                </button>
                <button
                  type="button"
                  aria-label="문구 삭제"
                  onClick={() => onDeletePhrase?.(item.id)}
                  className="flex size-6 shrink-0 items-center justify-center rounded text-icon hover:bg-hover hover:text-ink"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {showSchedule && (
          <div className="space-y-1.5">
            <p className="text-[11px] tracking-wide text-muted uppercase">예약된 알림</p>
            <ul className="max-h-40 space-y-1.5 overflow-y-auto">
              {scheduledItems.length === 0 && (
                <li className="text-[12px] text-faint">예약된 알림이 없습니다.</li>
              )}
              {scheduledItems.map((item) => (
                <li key={item.id}>
                  <div className="flex w-full items-start gap-2 rounded-md border border-dashed border-line px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => onEditScheduled?.(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-[12px] text-muted">
                        예약 · {formatScheduleLabel(item)}
                        {hasExpire(item) ? ` · 종료 ${formatExpireLabel(item)}` : ""}
                      </p>
                      <p className="text-[13px] leading-snug whitespace-pre-wrap text-ink-soft">
                        {runsToPlain(itemRuns(item)) || "내용 없음"}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label="예약 삭제"
                      onClick={() => onDeleteScheduled?.(item.id)}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-icon hover:bg-hover hover:text-ink"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SettingsModal>
  )
}

export default function AnnouncementWidget({
  widget,
  onChange,
  addItemOpen,
  onCloseAddItem,
  textScale = 1,
  previewWidth = 0,
}) {
  const { theme } = useTheme()
  const isReceiver = isHaruReceiver()
  const board = widget.announcement ?? { items: [], phrases: [], scheduled: [] }
  const phrases = Array.isArray(board.phrases) ? board.phrases : []
  const scheduled = Array.isArray(board.scheduled) ? board.scheduled : []
  const scheduledSorted = [...scheduled].sort((a, b) => (scheduledAtMs(a) ?? 0) - (scheduledAtMs(b) ?? 0))
  const [editor, setEditor] = useState(null)
  const [focus, setFocus] = useState(() => {
    const saved = readAnnouncementFocus()
    if (saved?.widgetId !== widget.id || !saved.itemId) return null
    return { id: saved.itemId, width: saved.width || 0 }
  })
  const focusedItem = board.items.find((item) => item.id === focus?.id) ?? null
  const [dragId, setDragId] = useState(null)
  const [dropSlot, setDropSlot] = useState(null)
  const [speech, setSpeech] = useState(() => ({
    unlocked: !isReceiver,
    blocked: false,
    widgetId: null,
    itemId: null,
    error: "",
    requestedVoice: "",
    appliedVoice: "",
  }))
  const [spotlight, setSpotlight] = useState(null)
  const seenAutoSpeak = useRef(null)
  const listRef = useRef(null)
  const dragRef = useRef(null)
  const widgetRef = useRef(widget)
  widgetRef.current = widget
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const focusRef = useRef(focus)
  focusRef.current = focus
  const boardItemsRef = useRef(board.items)
  boardItemsRef.current = board.items
  const spotlightRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const focusModeRef = useRef("manual")
  const expandTimerRef = useRef(0)
  const expandApiRef = useRef({})

  const clearExpandTimer = () => {
    if (expandTimerRef.current) {
      window.clearTimeout(expandTimerRef.current)
      expandTimerRef.current = 0
    }
  }

  const finishSpeechExpand = (requestId) => {
    if (spotlightRef.current?.requestId !== requestId) return
    clearExpandTimer()
    spotlightRef.current = null
    setSpotlight(null)
    if (focusModeRef.current !== "speech") return
    const restore = restoreFocusRef.current
    restoreFocusRef.current = null
    const keep = restore && boardItemsRef.current.some((item) => item.id === restore.id)
    if (keep) {
      focusModeRef.current = "manual"
      setFocus(restore)
      if (!isReceiver) {
        persistAnnouncementFocus({
          widgetId: widget.id,
          itemId: restore.id,
          width: restore.width,
        })
      }
      return
    }
    focusModeRef.current = "manual"
    setFocus(null)
    if (!isReceiver) persistAnnouncementFocus(null)
  }

  const beginSpeechExpand = ({ itemId, requestId, until, persist = !isReceiver }) => {
    if (!itemId || !requestId) return
    if (spotlightRef.current?.requestId === requestId && focusModeRef.current === "speech") return
    clearExpandTimer()
    if (focusModeRef.current === "manual" && focusRef.current) {
      restoreFocusRef.current = { ...focusRef.current }
    }
    focusModeRef.current = "speech"
    const measured =
      listRef.current?.querySelector(`[data-announcement-id="${itemId}"]`)?.getBoundingClientRect().width || 0
    const width = focusRef.current?.id === itemId ? focusRef.current.width || measured : measured
    const nextSpot = { itemId, requestId, until: Number(until) || Date.now() + SPEECH_EXPAND_MS }
    spotlightRef.current = nextSpot
    setSpotlight(nextSpot)
    setFocus({ id: itemId, width })
    if (!isReceiver) persistWidgetFocus(null)
    if (persist) {
      persistAnnouncementFocus({
        widgetId: widget.id,
        itemId,
        width,
        mode: "speech",
        until: nextSpot.until,
        requestId,
      })
    }
    expandTimerRef.current = window.setTimeout(() => {
      finishSpeechExpand(requestId)
    }, Math.max(0, nextSpot.until - Date.now()))
  }

  const enterManualFocus = (itemId, width, persist = !isReceiver) => {
    clearExpandTimer()
    spotlightRef.current = null
    setSpotlight(null)
    restoreFocusRef.current = null
    focusModeRef.current = "manual"
    setFocus({ id: itemId, width })
    if (persist) {
      persistWidgetFocus(null)
      persistAnnouncementFocus({ widgetId: widget.id, itemId, width })
    }
  }

  expandApiRef.current = { beginSpeechExpand, finishSpeechExpand, enterManualFocus }

  useEffect(
    () => () => {
      if (expandTimerRef.current) window.clearTimeout(expandTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (isReceiver) return undefined
    const tick = () => {
      const current = widgetRef.current.announcement ?? { items: [], phrases: [], scheduled: [] }
      const next = applyAnnouncementLifecycle(current, Date.now())
      if (!next) return
      onChangeRef.current({ announcement: next })
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [isReceiver])

  useEffect(() => {
    return subscribeSync((msg) => {
      if (msg.type !== SYNC.ANNOUNCEMENT_FOCUS) return
      const payload = msg.payload || {}
      if (payload.widgetId === widget.id && payload.itemId) {
        if (payload.mode === "speech") {
          const until = Number(payload.until) || 0
          if (until && until <= Date.now()) return
          expandApiRef.current.beginSpeechExpand({
            itemId: payload.itemId,
            requestId: payload.requestId,
            until,
            persist: false,
          })
          return
        }
        expandApiRef.current.enterManualFocus(payload.itemId, Number(payload.width) || 0, false)
        return
      }
      if (focusModeRef.current === "speech") {
        const req = spotlightRef.current?.requestId
        if (req) expandApiRef.current.finishSpeechExpand(req)
        return
      }
      setFocus(null)
    })
  }, [widget.id])

  useEffect(() => {
    if (!focus?.id) return
    if (board.items.some((item) => item.id === focus.id)) return
    const req = spotlightRef.current?.requestId
    if (req) expandApiRef.current.finishSpeechExpand(req)
    setFocus(null)
    if (!isReceiver) persistAnnouncementFocus(null)
  }, [board.items, focus?.id, isReceiver])

  useEffect(() => {
    ensureAnnouncementSpeechBridge()
    return subscribeAnnouncementSpeechStatus((status) => {
      setSpeech(status)
      if (status.widgetId && status.widgetId !== widget.id) return
      if (status.reason === "start" && status.itemId && status.requestId) {
        expandApiRef.current.beginSpeechExpand({
          itemId: status.itemId,
          requestId: status.requestId,
          until: Number(status.expandUntil) || Date.now() + SPEECH_EXPAND_MS,
          persist: !isReceiver,
        })
        return
      }
      if (status.reason === "stop" || status.reason === "reset" || status.reason === "blocked") {
        const req = spotlightRef.current?.requestId
        if (req) expandApiRef.current.finishSpeechExpand(req)
      }
    })
  }, [widget.id])

  useEffect(() => {
    if (isReceiver) return
    if (!seenAutoSpeak.current) {
      seenAutoSpeak.current = new Set(board.items.map((item) => item.id))
      return
    }
    const fresh = []
    for (const item of board.items) {
      if (seenAutoSpeak.current.has(item.id)) continue
      seenAutoSpeak.current.add(item.id)
      if (item.autoSpeak) fresh.push(item)
    }
    const settings = readSpeechSettings()
    fresh.forEach((item) => {
      const text = announcementSpeechText(runsToPlain(itemRuns(item)))
      if (!text) return
      requestAnnouncementSpeech({
        action: "play",
        queue: true,
        widgetId: widget.id,
        itemId: item.id,
        text,
        rate: settings.rate,
        voiceURI: settings.voiceURI,
        voiceName: settings.voiceName,
        voiceLang: settings.voiceLang,
        requestId: crypto.randomUUID(),
      })
    })
  }, [board.items, isReceiver, widget.id])

  useEffect(() => {
    if (isReceiver) return
    if (!speech.itemId || speech.widgetId !== widget.id) return
    if (board.items.some((item) => item.id === speech.itemId)) return
    requestAnnouncementSpeech({
      action: "stop",
      widgetId: widget.id,
      itemId: speech.itemId,
    })
  }, [board.items, isReceiver, speech.itemId, speech.widgetId, widget.id])

  useEffect(() => {
    if (!addItemOpen) {
      setEditor((current) => (current?.mode === "add" ? null : current))
      return
    }
    setEditor({ mode: "add", item: draftFromWidget(widgetRef.current) })
  }, [addItemOpen])

  const updateItems = (items) => {
    onChange({ announcement: { ...board, items } })
  }

  const updateScheduled = (nextScheduled) => {
    onChange({ announcement: { ...board, scheduled: nextScheduled } })
  }

  const updatePhrases = (nextPhrases) => {
    onChange({ announcement: { ...board, phrases: nextPhrases } })
  }

  const openScheduledEditor = (item) => {
    setEditor({
      mode: "schedule",
      item: {
        ...item,
        scheduleEnabled: true,
        expireEnabled: hasExpire(item),
        autoSpeak: Boolean(item.autoSpeak),
        scheduledDate: item.scheduledDate,
        scheduledTime: item.scheduledTime,
        runs: itemRuns(item).map((run) => ({ ...run })),
      },
    })
  }

  const finishDrag = (clientY) => {
    const session = dragRef.current
    dragRef.current = null
    setDragId(null)
    setDropSlot(null)
    if (!session?.dragging || !listRef.current) return
    const fromIndex = board.items.findIndex((item) => item.id === session.id)
    const insertSlot = slotFromPointer(listRef.current, clientY)
    updateItems(reorderAnnouncements(board.items, fromIndex, insertSlot))
  }

  const onItemPointerDown = (event, id) => {
    if (event.button !== 0) return
    if (!isReorderHandle(event.target)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      dragging: false,
    }
  }

  const onItemPointerMove = (event) => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (!session.dragging) {
      if (Math.abs(event.clientY - session.startY) < 5) return
      session.dragging = true
      setDragId(session.id)
    }
    event.preventDefault()
    if (!listRef.current) return
    setDropSlot(slotFromPointer(listRef.current, event.clientY))
  }

  const onItemPointerUp = (event) => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    finishDrag(event.clientY)
  }

  const rememberStyle = (item) => ({
    fontFamily: item.fontFamily,
    textColor: item.textColor,
    bold: item.bold,
    underline: item.underline,
    strike: item.strike,
    bgColor: item.bgColor,
  })

  const confirmEditor = () => {
    if (!editor) return
    if (editor.item.expireEnabled && !isExpireValid(editor.item)) return
    const remembered = rememberStyle(editor.item)
    const scheduleNow = Boolean(editor.item.scheduleEnabled) && !isScheduledDue(editor.item)
    const visibleItem = toVisibleItem(editor.item)
    if (!visibleItem) return
    if (editor.mode === "add") {
      if (scheduleNow) {
        const scheduledItem = toScheduledItem(editor.item)
        if (!scheduledItem) return
        onChange({
          ...remembered,
          announcement: { ...board, scheduled: [...scheduled, scheduledItem] },
        })
      } else {
        onChange({
          ...remembered,
          announcement: { ...board, items: [...board.items, visibleItem] },
        })
      }
    } else if (editor.mode === "schedule") {
      if (scheduleNow) {
        const scheduledItem = toScheduledItem(editor.item)
        if (!scheduledItem) return
        onChange({
          ...remembered,
          announcement: {
            ...board,
            scheduled: scheduled.some((item) => item.id === scheduledItem.id)
              ? scheduled.map((item) => (item.id === scheduledItem.id ? scheduledItem : item))
              : [...scheduled, scheduledItem],
          },
        })
      } else {
        onChange({
          ...remembered,
          announcement: {
            ...board,
            items: board.items.some((item) => item.id === visibleItem.id)
              ? board.items.map((item) => (item.id === visibleItem.id ? visibleItem : item))
              : [...board.items, visibleItem],
            scheduled: scheduled.filter((item) => item.id !== visibleItem.id),
          },
        })
      }
    } else {
      onChange({
        ...remembered,
        announcement: {
          ...board,
          items: board.items.map((item) => (item.id === visibleItem.id ? visibleItem : item)),
        },
      })
    }
    setEditor(null)
    onCloseAddItem?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!isReceiver && speech.error === "voice-unavailable" && (
        <p className="px-3 py-1.5 text-[12px] text-ink">
          선택한 목소리 ‘{speech.requestedVoice || "선택한 목소리"}’를 이 브라우저에서 사용할 수 없습니다.
        </p>
      )}
      <div className="widget-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {board.items.length === 0 && (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <p className="widget-empty text-[13px]">
              {scheduled.length > 0
                ? `예약된 알림 ${scheduled.length}건이 있습니다. +에서 확인하고 수정할 수 있습니다.`
                : "+로 알림을 추가하세요."}
            </p>
          </div>
        )}
        <ul ref={listRef} className="flex flex-col gap-3">
          {board.items.map((item, index) => {
            const dragging = dragId === item.id
            const showLine = dropSlot === index && dragId && dragId !== item.id
            return (
              <li
                key={item.id}
                data-announcement-id={item.id}
                onPointerDown={(event) => onItemPointerDown(event, item.id)}
                onPointerMove={onItemPointerMove}
                onPointerUp={onItemPointerUp}
                onPointerCancel={onItemPointerUp}
                className={`group no-drag relative ${
                  dragging ? "opacity-40" : ""
                } ${dragId ? "cursor-grabbing select-none" : "cursor-grab"}`}
              >
                {showLine && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-0.5 bg-ink" />
                )}
                <AnnouncementItemFrame
                  item={item}
                  theme={theme}
                  textScale={textScale}
                  speaking={false}
                  trailing={
                    <div className="no-drag flex shrink-0 flex-col gap-0.5 pt-0.5 opacity-50 transition-opacity group-hover:opacity-85">
                      <button
                        type="button"
                        aria-label="확대"
                        onClick={(event) => {
                          const row = event.currentTarget.closest("[data-announcement-id]")
                          const width = row?.getBoundingClientRect().width ?? 0
                          enterManualFocus(item.id, width)
                        }}
                        className={itemActionBtn}
                      >
                        <Maximize2 size={13} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label={speech.itemId === item.id ? "음성 중지" : "음성 읽기"}
                        aria-pressed={speech.widgetId === widget.id && speech.itemId === item.id}
                        onClick={() => {
                          if (isReceiver) return
                          const settings = readSpeechSettings()
                          if (speech.widgetId === widget.id && speech.itemId === item.id) {
                            requestAnnouncementSpeech({
                              action: "stop",
                              widgetId: widget.id,
                              itemId: item.id,
                            })
                            const req = spotlightRef.current?.requestId
                            if (req) finishSpeechExpand(req)
                            return
                          }
                          const text = announcementSpeechText(runsToPlain(itemRuns(item)))
                          if (!text) return
                          requestAnnouncementSpeech({
                            action: "play",
                            queue: false,
                            widgetId: widget.id,
                            itemId: item.id,
                            text,
                            rate: settings.rate,
                            voiceURI: settings.voiceURI,
                            voiceName: settings.voiceName,
                            voiceLang: settings.voiceLang,
                            requestId: crypto.randomUUID(),
                          })
                        }}
                        className={`${itemActionBtn} ${
                          speech.widgetId === widget.id && speech.itemId === item.id
                            ? "bg-hover text-ink"
                            : ""
                        }`}
                      >
                        <Volume2 size={13} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label="글자 설정"
                        onClick={() =>
                          setEditor({
                            mode: "edit",
                            item: {
                              ...item,
                              bgColor: item.bgColor,
                              expireEnabled: hasExpire(item),
                              autoSpeak: Boolean(item.autoSpeak),
                              runs: itemRuns(item).map((run) => ({ ...run })),
                            },
                          })
                        }
                        className={itemActionBtn}
                      >
                        <Settings size={13} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label="알림 삭제"
                        onClick={() =>
                          updateItems(board.items.filter((entry) => entry.id !== item.id))
                        }
                        className={itemActionBtn}
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  }
                />
              </li>
            )
          })}
          {dropSlot === board.items.length && dragId && (
            <li className="pointer-events-none h-0.5 bg-ink" aria-hidden="true" />
          )}
        </ul>
      </div>

      {focusedItem && (
        <AnnouncementFocus
          item={focusedItem}
          theme={theme}
          textScale={textScale}
          sourceWidth={focus?.width ?? 0}
          speaking={spotlight?.itemId === focusedItem.id}
          inert={isReceiver}
          onClose={() => {
            clearExpandTimer()
            spotlightRef.current = null
            setSpotlight(null)
            restoreFocusRef.current = null
            focusModeRef.current = "manual"
            setFocus(null)
            if (!isReceiver) persistAnnouncementFocus(null)
          }}
        />
      )}

      {editor && (
        <AnnouncementEditorModal
          title={
            editor.mode === "add"
              ? "알림 추가"
              : editor.mode === "schedule"
                ? "예약 알림 설정"
                : "알림 설정"
          }
          confirmLabel={
            editor.mode === "add"
              ? Boolean(editor.item.scheduleEnabled) && !isScheduledDue(editor.item)
                ? "예약"
                : "등록"
              : editor.mode === "schedule" &&
                  (!editor.item.scheduleEnabled || isScheduledDue(editor.item))
                ? "지금 표시"
                : "저장"
          }
          hint={
            editor.mode === "add"
              ? "등록한 알림은 위젯에서 마우스로 끌어 순서를 바꿀 수 있습니다. 예약하면 지정한 시각에 자동으로 나타납니다."
              : editor.mode === "schedule"
                ? "예약 시각이 되면 대시보드에 알림이 추가됩니다. 지금 표시로 바꾸면 바로 나타납니다."
                : "표시 중인 알림입니다."
          }
          draft={editor.item}
          phrases={phrases}
          scheduledItems={scheduledSorted}
          showSchedule={editor.mode !== "edit"}
          previewWidth={previewWidth}
          textScale={textScale}
          theme={theme}
          onChange={(patch) => {
            const item = { ...editor.item, ...patch }
            setEditor((current) => (current ? { ...current, item } : current))
            if (
              editor.mode === "add" &&
              (patch.fontFamily != null ||
                patch.fontSize != null ||
                patch.textColor != null ||
                patch.bold != null ||
                patch.underline != null ||
                patch.strike != null ||
                patch.bgColor != null)
            ) {
              onChange(rememberStyle(item))
            }
          }}
          onSavePhrase={(item) => {
            updatePhrases([...phrases, cloneAnnouncementItem(item)])
          }}
          onDeletePhrase={(id) => {
            updatePhrases(phrases.filter((entry) => entry.id !== id))
          }}
          onApplyPhrase={(phrase) => {
            setEditor((current) => {
              if (!current) return current
              const next = cloneAnnouncementItem(phrase)
              return {
                ...current,
                item: {
                  ...next,
                  id: current.item.id,
                  scheduleEnabled: current.item.scheduleEnabled,
                  scheduledDate: current.item.scheduledDate,
                  scheduledTime: current.item.scheduledTime,
                  expireEnabled: current.item.expireEnabled,
                  expireDate: current.item.expireDate,
                  expireTime: current.item.expireTime,
                },
              }
            })
          }}
          onEditScheduled={openScheduledEditor}
          onDeleteScheduled={(id) => {
            updateScheduled(scheduled.filter((entry) => entry.id !== id))
            setEditor((current) =>
              current?.mode === "schedule" && current.item.id === id ? null : current,
            )
          }}
          onClose={() => {
            setEditor(null)
            onCloseAddItem?.()
          }}
          onConfirm={confirmEditor}
        />
      )}
    </div>
  )
}
