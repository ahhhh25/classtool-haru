import { useEffect, useLayoutEffect, useRef } from "react"
import { fontFamilyCss } from "../constants/fonts"
import { contentColor } from "../theme/displayColor"
import {
  getOffsetsFromSelection,
  restoreSelection,
  syncRunsWithPlain,
} from "../utils/richText"

export function runStyle(run, theme, scale = 1) {
  return {
    fontFamily: fontFamilyCss(run.fontFamily),
    fontSize: `${Number(run.fontSize) * scale}pt`,
    fontWeight: run.bold ? 700 : 400,
    color: contentColor(run.color, theme),
    textDecoration: run.underline ? "underline" : "none",
    textUnderlineOffset: run.underline ? "0.16em" : undefined,
    lineHeight: 1.35,
  }
}

function paintRuns(container, runs, theme) {
  container.replaceChildren()
  if (!runs.length) {
    container.appendChild(document.createElement("br"))
    return
  }
  for (const run of runs) {
    const span = document.createElement("span")
    Object.assign(span.style, runStyle(run, theme))
    span.textContent = run.text
    container.appendChild(span)
  }
}

function readEditorPlain(container) {
  const plain = (container.innerText || "").replace(/\r/g, "")
  if (plain === "\n") return ""
  return plain.endsWith("\n") ? plain.slice(0, -1) : plain
}

export default function RichTextEditor({
  runs,
  fallbackStyle,
  theme,
  onChangeRuns,
  onSelectionChange,
  className,
  ariaLabel,
  onKeyDown,
  flushRef,
}) {
  const editorRef = useRef(null)
  const skipPaint = useRef(false)
  const runsRef = useRef(runs)
  const selectionRef = useRef(null)
  const fallbackRef = useRef(fallbackStyle)
  const onSelectionChangeRef = useRef(onSelectionChange)
  runsRef.current = runs
  fallbackRef.current = fallbackStyle
  onSelectionChangeRef.current = onSelectionChange

  if (flushRef) {
    flushRef.current = () => {
      const el = editorRef.current
      if (!el) return runsRef.current
      return syncRunsWithPlain(runsRef.current, readEditorPlain(el), fallbackRef.current)
    }
  }

  useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (skipPaint.current) {
      skipPaint.current = false
      return
    }
    paintRuns(el, runs, theme)
    if (selectionRef.current) {
      restoreSelection(el, selectionRef.current.start, selectionRef.current.end)
    }
  }, [runs, theme])

  const captureSelection = () => {
    const el = editorRef.current
    const range = getOffsetsFromSelection(el)
    if (range) {
      selectionRef.current = range
      onSelectionChangeRef.current?.(range)
      return
    }
    const sel = window.getSelection()
    const inside = Boolean(el && sel?.anchorNode && el.contains(sel.anchorNode))
    if (inside && sel.isCollapsed) {
      selectionRef.current = null
      onSelectionChangeRef.current?.(null)
    }
  }

  useEffect(() => {
    document.addEventListener("selectionchange", captureSelection)
    return () => document.removeEventListener("selectionchange", captureSelection)
  }, [])

  return (
    <div
      ref={editorRef}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      aria-label={ariaLabel}
      onMouseUp={captureSelection}
      onKeyUp={captureSelection}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return
        event.preventDefault()
        document.execCommand("insertText", false, "\n")
      }}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData("text/plain")
        if (text) document.execCommand("insertText", false, text)
      }}
      onInput={() => {
        skipPaint.current = true
        const plain = readEditorPlain(editorRef.current)
        onChangeRuns(syncRunsWithPlain(runsRef.current, plain, fallbackStyle))
      }}
      className={className}
    />
  )
}
