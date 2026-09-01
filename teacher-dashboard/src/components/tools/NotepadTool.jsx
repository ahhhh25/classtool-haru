import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  ImagePlus,
  Maximize2,
  MousePointer2,
  Pencil,
  Redo2,
  Save,
  Shapes,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react"
import { DEFAULT_FONT } from "../../constants/fonts"
import { DEFAULT_TEXT_COLOR } from "../../constants/palette"
import { useNotepadCanvas } from "../../hooks/useNotepadCanvas"
import { useTheme } from "../../theme/ThemeProvider"
import { DRAW_COLORS, SHAPE_TYPES } from "../../utils/notepadDrawing"
import LineHeightControl from "../LineHeightControl"
import {
  applyBaseEditorStyle,
  applyEditorPatch,
  applyLineHeight,
  parseStoredSize,
  resolveFontId,
  syncEditorVerticalSpace,
  titleFromContent,
} from "../../utils/editorStyle"
import { loadJson, saveJson } from "../../utils/safeStorage"
import ConfirmDialog from "../ConfirmDialog"
import WidgetSettings from "../WidgetSettings"

const NOTES_KEY = "edu_notes_v1"

const TOOL_BUTTONS = [
  { id: "text", label: "텍스트", icon: Type },
  { id: "pen", label: "연필", icon: Pencil },
  { id: "shape", label: "도형", icon: Shapes },
  { id: "eraser", label: "지우개", icon: Eraser },
  { id: "select", label: "선택", icon: MousePointer2 },
]

function emptyNote() {
  return {
    id: `note-${Date.now()}`,
    title: "무제 메모",
    content: "",
    canvasData: "[]",
    bgMode: "plain",
    fontFamily: DEFAULT_FONT.id,
    fontSize: 36,
    lineHeight: "normal",
    textColor: DEFAULT_TEXT_COLOR,
    bold: true,
    underline: false,
    updatedAt: new Date().toISOString(),
  }
}

function hydrateNote(raw) {
  if (!raw || typeof raw !== "object") return null
  return {
    ...emptyNote(),
    ...raw,
    id: String(raw.id || `note-${Date.now()}`),
    fontFamily: resolveFontId(raw.fontFamily),
    fontSize: parseStoredSize(raw.fontSize ?? raw.fontSizePx, 36),
    textColor: raw.textColor || raw.color || DEFAULT_TEXT_COLOR,
    bold: raw.bold !== false,
    underline: Boolean(raw.underline),
    lineHeight: raw.lineHeight || "normal",
  }
}

const toolBtn = (active) =>
  `flex size-8 items-center justify-center rounded-md border transition-colors ${
    active ? "border-line-strong bg-active text-ink" : "border-transparent text-icon hover:bg-hover hover:text-ink"
  }`

export default function NotepadTool({ active = true }) {
  const { theme } = useTheme()
  const [notes, setNotes] = useState(() => {
    const loaded = loadJson(NOTES_KEY, [])
    const hydrated = Array.isArray(loaded) ? loaded.map(hydrateNote).filter(Boolean) : []
    if (hydrated.length > 0) return hydrated
    const created = emptyNote()
    saveJson(NOTES_KEY, [created])
    return [created]
  })
  const [activeId, setActiveId] = useState(() => notes[0]?.id ?? null)
  const [listOpen, setListOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const editorRef = useRef(null)
  const scrollerRef = useRef(null)
  const fileRef = useRef(null)
  const savedRange = useRef(null)
  const notesRef = useRef(notes)
  const activeIdRef = useRef(activeId)
  const saveTimer = useRef(null)

  notesRef.current = notes
  activeIdRef.current = activeId
  const activeNote = notes.find((note) => note.id === activeId) ?? null

  const persist = useCallback((next) => {
    notesRef.current = next
    setNotes(next)
    saveJson(NOTES_KEY, next)
  }, [])

  const saveFromEditor = useCallback(
    (canvasData) => {
      const id = activeIdRef.current
      const editor = editorRef.current
      if (!id || !editor) return
      persist(
        notesRef.current.map((note) =>
          note.id === id
            ? {
                ...note,
                content: editor.innerHTML,
                title: titleFromContent(editor.innerHTML),
                canvasData: canvasData ?? note.canvasData,
                bgMode: editor.classList.contains("lined-note-bg") ? "lined" : "plain",
                updatedAt: new Date().toISOString(),
              }
            : note,
        ),
      )
    },
    [persist],
  )

  const canvas = useNotepadCanvas({
    scrollerRef,
    editorRef,
    enabled: active,
    onChange: (canvasData) => saveFromEditor(canvasData),
  })

  const applyNoteToEditor = useCallback(
    (note) => {
      const editor = editorRef.current
      if (!editor || !note) return
      editor.innerHTML = note.content || ""
      applyBaseEditorStyle(
        editor,
        note,
        theme,
        { lined: note.bgMode === "lined" },
      )
      syncEditorVerticalSpace(editor)
      canvas.loadShapes(note.canvasData)
      canvas.setTool("text")
    },
    [canvas, theme],
  )

  useEffect(() => {
    if (!activeId || !notes.some((note) => note.id === activeId)) {
      setActiveId(notes[0]?.id ?? null)
    }
  }, [activeId, notes])

  useEffect(() => {
    if (!activeNote) return
    applyNoteToEditor(activeNote)
    // only when switching notes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id])

  useEffect(() => {
    if (!activeNote || !editorRef.current) return
    applyBaseEditorStyle(editorRef.current, activeNote, theme, {
      lined: activeNote.bgMode === "lined",
    })
    syncEditorVerticalSpace(editorRef.current)
  }, [theme, activeNote?.id, activeNote?.bgMode])

  useEffect(() => {
    if (!active) return
    const onPaste = (event) => {
      const image = [...(event.clipboardData?.items ?? [])].find((item) =>
        item.type.startsWith("image/"),
      )
      if (!image) return
      const file = image.getAsFile()
      if (!file) return
      event.preventDefault()
      const reader = new FileReader()
      reader.onload = () => canvas.addImage(String(reader.result))
      reader.readAsDataURL(file)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [active, canvas.addImage])

  useEffect(() => {
    if (!canvas.shapePanelOpen) return undefined
    const onPointerDown = (event) => {
      if (event.target.closest("[data-shape-menu], [data-shape-tool]")) return
      canvas.closeShapePanel()
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [canvas.shapePanelOpen, canvas.closeShapePanel])

  const scheduleSave = () => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveFromEditor(), 600)
  }

  const rememberSelection = () => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange()
    }
  }

  const patchStyle = (patch) => {
    const editor = editorRef.current
    const appliedToSelection = applyEditorPatch(editor, patch, theme, savedRange.current, {
      lined: activeNote?.bgMode === "lined",
    })
    persist(
      notesRef.current.map((note) =>
        note.id === activeIdRef.current
          ? {
              ...note,
              ...(appliedToSelection ? {} : patch),
              content: editor?.innerHTML ?? note.content,
              title: titleFromContent(editor?.innerHTML ?? note.content),
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    )
  }

  const changeLineHeight = (value) => {
    applyLineHeight(editorRef.current, value)
    syncEditorVerticalSpace(editorRef.current)
    persist(
      notesRef.current.map((note) =>
        note.id === activeId ? { ...note, lineHeight: value, updatedAt: new Date().toISOString() } : note,
      ),
    )
  }

  const changeBackground = (mode) => {
    const editor = editorRef.current
    if (!editor) return
    applyBaseEditorStyle(editor, { ...activeNote, bgMode: mode }, theme, { lined: mode === "lined" })
    syncEditorVerticalSpace(editor)
    persist(
      notesRef.current.map((note) =>
        note.id === activeId ? { ...note, bgMode: mode, updatedAt: new Date().toISOString() } : note,
      ),
    )
  }

  const createNote = () => {
    const created = emptyNote()
    persist([created, ...notesRef.current])
    setActiveId(created.id)
    setListOpen(true)
  }

  const deleteNote = (id) => {
    setConfirm({
      title: "메모 삭제",
      message: "이 메모를 삭제할까요? 삭제하면 되돌릴 수 없습니다.",
      onConfirm: () => {
        const next = notesRef.current.filter((note) => note.id !== id)
        if (next.length === 0) {
          const created = emptyNote()
          persist([created])
          setActiveId(created.id)
        } else {
          persist(next)
          if (activeIdRef.current === id) setActiveId(next[0].id)
        }
        setConfirm(null)
      },
    })
  }

  const clearAll = () => {
    setConfirm({
      title: "전체 지우기",
      message: "메모 글과 그려 둔 판서를 모두 지울까요?",
      onConfirm: () => {
        if (editorRef.current) editorRef.current.innerHTML = ""
        canvas.clearDrawings()
        saveFromEditor("[]")
        setConfirm(null)
      },
    })
  }

  const openFullscreen = () => {
    saveFromEditor()
    const canvasEl = canvas.canvasRef.current
    setFullscreen({
      html: editorRef.current?.innerHTML ?? "",
      style: editorRef.current?.style.cssText ?? "",
      className: editorRef.current?.className ?? "",
      lined: activeNote?.bgMode === "lined",
      canvasUrl: canvasEl && canvasEl.width > 0 ? canvasEl.toDataURL() : "",
    })
  }

  const saveNote = () => {
    clearTimeout(saveTimer.current)
    saveFromEditor(canvas.getShapesJson())
    createNote()
    window.setTimeout(() => canvas.resizeCanvas(), 120)
  }

  const sorted = [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  return (
    <main className="theme-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app p-3">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-widget">
        {listOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-sunken">
            <div className="flex h-12 items-center justify-between border-b border-line px-3">
              <p className="text-[13px] text-muted">내 메모 목록</p>
              <button
                type="button"
                onClick={createNote}
                className="rounded-md border border-line px-2 py-1 text-[12px] text-icon transition-colors hover:bg-hover hover:text-ink"
              >
                새 메모
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {sorted.map((note) => {
                const active = note.id === activeId
                return (
                  <div
                    key={note.id}
                    className={`nav-item group relative mb-1 rounded-lg border px-3 py-2 ${
                      active ? "is-active border-transparent" : "border-transparent hover:bg-hover"
                    }`}
                  >
                    <button type="button" onClick={() => setActiveId(note.id)} className="block w-full pr-6 text-left">
                      <p className="truncate text-[13px] text-ink">{note.title || "제목 없음"}</p>
                      <p className="mt-0.5 truncate text-[11px] text-faint">
                        {titleFromContent(note.content, "내용 없음")}
                      </p>
                    </button>
                    <button
                      type="button"
                      title="삭제"
                      onClick={() => deleteNote(note.id)}
                      className="absolute top-2 right-2 hidden rounded p-1 text-muted hover:bg-hover hover:text-ink group-hover:block"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                )
              })}
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative z-50 flex flex-wrap items-center gap-2 border-b border-line bg-widget-header px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setListOpen((open) => !open)
                setTimeout(() => canvas.resizeCanvas(), 120)
              }}
              className="flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[12px] text-icon hover:bg-hover hover:text-ink"
            >
              {listOpen ? <ChevronLeft size={13} strokeWidth={1.5} /> : <ChevronRight size={13} strokeWidth={1.5} />}
              {listOpen ? "목록 접기" : "목록 펼치기"}
            </button>

            <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
              {TOOL_BUTTONS.map((item) => {
                const Icon = item.icon
                const active = item.id === "shape" ? canvas.tool === "shape" : canvas.tool === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.label}
                    onClick={() => (item.id === "shape" ? canvas.toggleShapePanel() : canvas.setTool(item.id))}
                    data-shape-tool={item.id === "shape" ? "" : undefined}
                    className={toolBtn(active)}
                  >
                    <Icon size={14} strokeWidth={1.5} />
                  </button>
                )
              })}
              <button
                type="button"
                title="이미지"
                onClick={() => fileRef.current?.click()}
                className={toolBtn(false)}
              >
                <ImagePlus size={14} strokeWidth={1.5} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => canvas.addImage(String(reader.result))
                  reader.readAsDataURL(file)
                }}
              />
            </div>

            <WidgetSettings
              bare
              inline
              fields={["font"]}
              widget={{
                fontFamily: activeNote?.fontFamily ?? DEFAULT_FONT.id,
                fontSize: activeNote?.fontSize ?? 36,
                bold: Boolean(activeNote?.bold),
                underline: Boolean(activeNote?.underline),
                textColor: activeNote?.textColor ?? DEFAULT_TEXT_COLOR,
              }}
              onChange={patchStyle}
            />
            <WidgetSettings
              bare
              inline
              fields={["size"]}
              widget={{
                fontFamily: activeNote?.fontFamily ?? DEFAULT_FONT.id,
                fontSize: activeNote?.fontSize ?? 36,
                bold: Boolean(activeNote?.bold),
                underline: Boolean(activeNote?.underline),
                textColor: activeNote?.textColor ?? DEFAULT_TEXT_COLOR,
              }}
              onChange={patchStyle}
            />

            <WidgetSettings
              bare
              inline
              fields={["style", "color"]}
              widget={{
                fontFamily: activeNote?.fontFamily ?? DEFAULT_FONT.id,
                fontSize: activeNote?.fontSize ?? 36,
                bold: Boolean(activeNote?.bold),
                underline: Boolean(activeNote?.underline),
                textColor: activeNote?.textColor ?? DEFAULT_TEXT_COLOR,
              }}
              onChange={patchStyle}
            />

            <LineHeightControl
              value={activeNote?.lineHeight}
              onChange={changeLineHeight}
            />

            <select
              aria-label="배경"
              value={activeNote?.bgMode || "plain"}
              onChange={(event) => changeBackground(event.target.value)}
              className="h-7 rounded-md border border-line bg-sunken px-1.5 text-[12px] text-ink outline-none"
            >
              <option value="plain">기본 배경</option>
              <option value="lined">노트 줄 배경</option>
            </select>

            <div className="ml-auto flex items-center gap-0.5">
              <button type="button" title="되돌리기" onClick={canvas.undo} className={toolBtn(false)}>
                <Undo2 size={14} strokeWidth={1.5} />
              </button>
              <button type="button" title="다시실행" onClick={canvas.redo} className={toolBtn(false)}>
                <Redo2 size={14} strokeWidth={1.5} />
              </button>
              <button type="button" title="지우기" onClick={clearAll} className={toolBtn(false)}>
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
              <button type="button" title="목록에 저장" onClick={saveNote} className={toolBtn(false)}>
                <Save size={14} strokeWidth={1.5} />
              </button>
              <button type="button" title="전체화면" onClick={openFullscreen} className={toolBtn(false)}>
                <Maximize2 size={14} strokeWidth={1.5} />
              </button>
            </div>

            {canvas.shapePanelOpen && (
              <div
                id="drawing-shape-popup"
                data-shape-menu=""
                className="absolute top-full left-3 z-50 mt-1 w-72 rounded-xl border border-line bg-widget p-3 shadow-modal"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <p className="mb-1.5 text-[11px] tracking-wide text-muted uppercase">판서 색상</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {DRAW_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => canvas.setShapeProp("color", color)}
                      className={`size-6 rounded-full border ${
                        canvas.shapeConfig.color === color ? "border-ink" : "border-line"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-muted">
                    선 굵기
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={canvas.shapeConfig.thickness}
                      onChange={(event) => canvas.setShapeProp("thickness", event.target.value)}
                      className="mt-1 h-8 w-full rounded-md border border-line bg-sunken px-2 text-center text-[12px] text-ink"
                    />
                  </label>
                  <label className="text-[11px] text-muted">
                    투명도 (%)
                    <input
                      type="number"
                      min={10}
                      max={100}
                      step={10}
                      value={canvas.shapeConfig.opacity}
                      onChange={(event) => canvas.setShapeProp("opacity", event.target.value)}
                      className="mt-1 h-8 w-full rounded-md border border-line bg-sunken px-2 text-center text-[12px] text-ink"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SHAPE_TYPES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => canvas.setShapeType(item.id)}
                      className={`rounded-md border px-1 py-1.5 text-[11px] ${
                        canvas.shapeConfig.type === item.id
                          ? "border-line-strong bg-active text-ink"
                          : "border-line text-icon hover:bg-hover"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-ink">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="line-style"
                      checked={canvas.shapeConfig.lineStyle === "solid"}
                      onChange={() => canvas.setShapeProp("lineStyle", "solid")}
                    />
                    실선
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="line-style"
                      checked={canvas.shapeConfig.lineStyle === "dashed"}
                      onChange={() => canvas.setShapeProp("lineStyle", "dashed")}
                    />
                    점선
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="fill-style"
                      checked={canvas.shapeConfig.fillStyle === "stroke"}
                      onChange={() => canvas.setShapeProp("fillStyle", "stroke")}
                    />
                    테두리만
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="fill-style"
                      checked={canvas.shapeConfig.fillStyle === "fill"}
                      onChange={() => canvas.setShapeProp("fillStyle", "fill")}
                    />
                    색 채우기
                  </label>
                </div>
              </div>
            )}
          </div>

          <div
            className={`relative flex min-h-0 flex-1 flex-col p-6 ${
              activeNote?.bgMode === "lined" ? "bg-white" : ""
            }`}
          >
            <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="relative min-h-full">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="relative z-10 min-h-full w-full text-ink outline-none"
                  onInput={scheduleSave}
                  onBeforeInput={canvas.markTextHistory}
                  onPaste={canvas.markTextHistory}
                  onMouseUp={rememberSelection}
                  onKeyUp={rememberSelection}
                  onFocus={rememberSelection}
                />
                <canvas
                  ref={canvas.canvasRef}
                  className="pointer-events-none absolute top-0 left-0 z-20"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
      />

      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[60] overflow-auto bg-app p-8">
            <button
              type="button"
              onClick={() => setFullscreen(null)}
              className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md border border-line text-icon hover:bg-hover hover:text-ink"
              aria-label="닫기"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
            <div className={`relative mx-auto max-w-5xl ${fullscreen.lined ? "bg-white p-6" : ""}`}>
              <div
                className={fullscreen.className}
                ref={(el) => {
                  if (el && fullscreen.style) el.style.cssText = fullscreen.style
                }}
                dangerouslySetInnerHTML={{ __html: fullscreen.html }}
              />
              {fullscreen.canvasUrl && (
                <img
                  alt=""
                  src={fullscreen.canvasUrl}
                  className="pointer-events-none absolute top-0 left-0 w-full"
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </main>
  )
}
