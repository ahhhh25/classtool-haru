import { useEffect, useRef, useState } from "react"
import { Plus, Settings, Trash2 } from "lucide-react"
import { widgetBackground } from "../constants/palette"
import { contentColor } from "../theme/displayColor"
import { useTheme } from "../theme/ThemeProvider"
import { cloneAnnouncementItem, createAnnouncementItem, reorderAnnouncements } from "../utils/announcement"
import { getComposeFontSize, setComposeFontSize } from "../utils/composeFontSize"
import {
  applyStyleToRange,
  plainToRuns,
  runsToPlain,
  toolbarWidgetFromRuns,
  widgetPatchToRunPatch,
} from "../utils/richText"
import RichTextEditor, { runStyle } from "./RichTextEditor"
import SettingsModal from "./SettingsModal"
import WidgetSettings from "./WidgetSettings"

function itemFallback(item) {
  return {
    fontFamily: item.fontFamily,
    fontSize: item.fontSize,
    color: item.textColor,
    bold: item.bold,
    underline: item.underline,
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
  return createAnnouncementItem({
    fontFamily: widget.fontFamily,
    fontSize: getComposeFontSize(),
    textColor: widget.textColor,
    bgColor: widget.bgColor,
    bold: widget.bold,
    underline: widget.underline,
  })
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

function AnnouncementEditorModal({
  title,
  confirmLabel,
  hint,
  draft,
  phrases = [],
  onChange,
  onClose,
  onConfirm,
  onSavePhrase,
  onDeletePhrase,
  onApplyPhrase,
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
  }

  const applyStyle = (patch) => {
    if (patch.fontSize != null) setComposeFontSize(patch.fontSize)
    const flushed = editorFlushRef.current?.()
    const currentRuns = flushed ?? itemRuns(draftRef.current)
    const runPatch = widgetPatchToRunPatch(patch)
    const oneShot = patch.bold != null || patch.underline != null
    const sticky = { ...patch }
    delete sticky.bold
    delete sticky.underline
    const range = selectionRef.current

    if (range && Object.keys(runPatch).length) {
      const nextRuns = applyStyleToRange(currentRuns, range.start, range.end, runPatch)
      onChange({ ...sticky, runs: nextRuns })
      if (oneShot) setOneShotMarks({ bold: false, underline: false })
      return
    }

    if (oneShot) {
      setOneShotMarks((current) => ({
        bold: patch.bold ?? current?.bold ?? false,
        underline: patch.underline ?? current?.underline ?? false,
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
    <SettingsModal title={title} onClose={onClose} fit>
      <div className="shrink-0 border-b border-line">
        <WidgetSettings widget={toolbarWidget} onChange={applyStyle} compact bare />
      </div>
      <div className="space-y-3 px-4 py-4">
        <RichTextEditor
          runs={runs}
          fallbackStyle={{
            ...itemFallback(draft),
            bold: Boolean(oneShotMarks?.bold),
            underline: Boolean(oneShotMarks?.underline),
          }}
          theme={theme}
          ariaLabel="알림 내용"
          flushRef={editorFlushRef}
          onSelectionChange={(range) => {
            selectionRef.current = range
            setSelection(range)
          }}
          onChangeRuns={(nextRuns) => onChange({ runs: nextRuns })}
          insertStyle={oneShotMarks}
          onInsertStyleConsumed={() => setOneShotMarks({ bold: false, underline: false })}
          className="widget-scroll h-[17rem] overflow-y-auto whitespace-pre-wrap rounded-md border border-line px-3 py-2.5 outline-none focus:border-line-strong"
          style={{
            color: contentColor(draft.textColor, theme),
            caretColor: contentColor(draft.textColor, theme),
            fontSize: `${Number(draft.fontSize)}pt`,
            backgroundColor: widgetBackground(draft.bgColor, theme) || "var(--sunken)",
          }}
        />
        {hint && <p className="text-[12px] text-muted">{hint}</p>}
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
      </div>
    </SettingsModal>
  )
}

export default function AnnouncementWidget({ widget, onChange, addItemOpen, onCloseAddItem, textScale = 1 }) {
  const { theme } = useTheme()
  const board = widget.announcement ?? { items: [], phrases: [] }
  const phrases = Array.isArray(board.phrases) ? board.phrases : []
  const [editor, setEditor] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dropSlot, setDropSlot] = useState(null)
  const listRef = useRef(null)
  const dragRef = useRef(null)
  const widgetRef = useRef(widget)
  widgetRef.current = widget

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

  const updatePhrases = (nextPhrases) => {
    onChange({ announcement: { ...board, phrases: nextPhrases } })
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
    bgColor: item.bgColor,
  })

  const confirmEditor = () => {
    if (!editor) return
    const remembered = rememberStyle(editor.item)
    if (editor.mode === "add") {
      onChange({ ...remembered, announcement: { ...board, items: [...board.items, editor.item] } })
    } else {
      onChange({
        ...remembered,
        announcement: {
          ...board,
          items: board.items.map((item) => (item.id === editor.item.id ? editor.item : item)),
        },
      })
    }
    setEditor(null)
    onCloseAddItem?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="widget-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {board.items.length === 0 && (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <p className="widget-empty text-[13px]">+로 알림을 추가하세요.</p>
          </div>
        )}
        <ul ref={listRef} className="flex flex-col gap-3">
          {board.items.map((item, index) => {
            const dragging = dragId === item.id
            const showLine = dropSlot === index && dragId && dragId !== item.id
            const text = runsToPlain(itemRuns(item))
            return (
              <li
                key={item.id}
                data-announcement-id={item.id}
                onPointerDown={(event) => onItemPointerDown(event, item.id)}
                onPointerMove={onItemPointerMove}
                onPointerUp={onItemPointerUp}
                onPointerCancel={onItemPointerUp}
                className={`group no-drag relative rounded-lg border border-line-strong ${
                  dragging ? "opacity-40" : ""
                } ${dragId ? "cursor-grabbing select-none" : "cursor-grab"}`}
                style={{
                  backgroundColor: widgetBackground(item.bgColor, theme) || "var(--sunken)",
                }}
              >
                {showLine && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-0.5 bg-ink" />
                )}
                <div className="flex items-start gap-1 px-2.5 py-3">
                  {text ? (
                    <RichRuns
                      runs={itemRuns(item)}
                      theme={theme}
                      textScale={textScale}
                      className="min-h-10 min-w-0 flex-1 whitespace-pre-wrap px-1 py-1"
                    />
                  ) : (
                    <p className="min-h-10 min-w-0 flex-1 px-1 py-1" />
                  )}
                  <div className="no-drag flex shrink-0 flex-col gap-0.5 pt-0.5 opacity-25 transition-opacity group-hover:opacity-70">
                    <button
                      type="button"
                      aria-label="글자 설정"
                      onClick={() =>
                        setEditor({
                          mode: "edit",
                          item: {
                            ...item,
                            bgColor: item.bgColor,
                            runs: itemRuns(item).map((run) => ({ ...run })),
                          },
                        })
                      }
                      className="flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-muted"
                    >
                      <Settings size={13} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      aria-label="알림 삭제"
                      onClick={() =>
                        updateItems(board.items.filter((entry) => entry.id !== item.id))
                      }
                      className="flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-muted"
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
          {dropSlot === board.items.length && dragId && (
            <li className="pointer-events-none h-0.5 bg-ink" aria-hidden="true" />
          )}
        </ul>
      </div>

      {editor && (
        <AnnouncementEditorModal
          title={editor.mode === "add" ? "알림 추가" : "알림 설정"}
          confirmLabel={editor.mode === "add" ? "등록" : "저장"}
          hint={
            editor.mode === "add"
              ? "등록한 알림은 위젯에서 마우스로 끌어 순서를 바꿀 수 있습니다."
              : null
          }
          draft={editor.item}
          phrases={phrases}
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
              return { ...current, item: { ...next, id: current.item.id } }
            })
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
