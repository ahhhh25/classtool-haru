import { useEffect, useRef, useState } from "react"
import { Settings, Trash2 } from "lucide-react"
import { useTheme } from "../theme/ThemeProvider"
import { createAnnouncementItem, reorderAnnouncements } from "../utils/announcement"
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
  return toolbarWidgetFromRuns(itemRuns(item), selection, {
    fontSize: item.fontSize,
    fontFamily: item.fontFamily,
    textColor: item.textColor,
    bold: item.bold,
    underline: item.underline,
  })
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
    fontSize: widget.fontSize,
    textColor: widget.textColor,
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

function AnnouncementEditorModal({ title, confirmLabel, hint, draft, onChange, onClose, onConfirm, theme }) {
  const draftRef = useRef(draft)
  const selectionRef = useRef(null)
  const editorFlushRef = useRef(null)
  const [selection, setSelection] = useState(null)
  draftRef.current = draft
  const runs = itemRuns(draft)

  const applyStyle = (patch) => {
    const flushed = editorFlushRef.current?.()
    const currentRuns = flushed ?? itemRuns(draftRef.current)
    const range = selectionRef.current
    const runPatch = widgetPatchToRunPatch(patch)
    const nextRuns = range
      ? applyStyleToRange(currentRuns, range.start, range.end, runPatch)
      : applyStyleToRange(currentRuns, 0, runsToPlain(currentRuns).length, runPatch)
    onChange({ ...patch, runs: nextRuns })
  }

  return (
    <SettingsModal title={title} onClose={onClose} fit>
      <div className="shrink-0 border-b border-line">
        <WidgetSettings widget={toolbarFromItem(draft, selection)} onChange={applyStyle} compact bare />
      </div>
      <div className="space-y-3 px-4 py-4">
        <RichTextEditor
          runs={runs}
          fallbackStyle={itemFallback(draft)}
          theme={theme}
          ariaLabel="알림 내용"
          flushRef={editorFlushRef}
          onSelectionChange={(range) => {
            selectionRef.current = range
            setSelection(range)
          }}
          onChangeRuns={(nextRuns) => onChange({ runs: nextRuns })}
          className="h-[8.5rem] overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-sunken px-3 py-2.5 text-ink outline-none focus:border-line-strong"
        />
        {hint && <p className="text-[12px] text-muted">{hint}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onConfirm}
            className="h-9 rounded-md border border-line px-4 text-[13px] text-ink transition-colors hover:bg-hover"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </SettingsModal>
  )
}

export default function AnnouncementWidget({ widget, onChange, addItemOpen, onCloseAddItem, textScale = 1 }) {
  const { theme } = useTheme()
  const board = widget.announcement ?? { items: [] }
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
    fontSize: item.fontSize,
    textColor: item.textColor,
    bold: item.bold,
    underline: item.underline,
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
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {board.items.length === 0 && (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <p className="text-[13px] text-faint">+로 알림을 추가하세요.</p>
          </div>
        )}
        <ul ref={listRef}>
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
                className={`group no-drag relative ${index > 0 ? "border-t border-line" : ""} ${
                  dragging ? "opacity-40" : ""
                } ${dragId ? "cursor-grabbing select-none" : "cursor-grab"}`}
              >
                {showLine && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-0.5 bg-ink" />
                )}
                <div className="flex items-start gap-1 py-2">
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
                          item: { ...item, runs: itemRuns(item).map((run) => ({ ...run })) },
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
                patch.underline != null)
            ) {
              onChange(rememberStyle(item))
            }
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
