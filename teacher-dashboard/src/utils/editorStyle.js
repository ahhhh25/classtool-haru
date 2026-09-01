import { DEFAULT_FONT, FONT_OPTIONS, fontFamilyCss } from "../constants/fonts"
import { DEFAULT_TEXT_COLOR } from "../constants/palette"
import { contentColor } from "../theme/displayColor"

export function parseStoredSize(value, fallback = 36) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const parsed = parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function resolveFontId(value) {
  if (FONT_OPTIONS.some((font) => font.id === value)) return value
  return DEFAULT_FONT.id
}

export function editorFontPx(editor) {
  if (!editor) return 36
  const computed = parseFloat(getComputedStyle(editor).fontSize)
  return Number.isFinite(computed) ? computed : 36
}

export function applyLineHeight(editor, value) {
  if (!editor) return
  const size = editorFontPx(editor)
  const multiplier = value === "normal" || !value ? 1 : Number(value)
  const factor = Number.isFinite(multiplier) ? multiplier : 1
  const computed = Math.max(1, Math.round(size * factor * 1.6))
  editor.style.lineHeight = `${computed}px`
  if (editor.classList.contains("lined-note-bg")) {
    editor.style.backgroundSize = `100% ${computed}px`
  }
}

export function syncEditorVerticalSpace(editor) {
  if (!editor) return
  const size = editorFontPx(editor)
  const topPad = Math.max(8, Math.round(size * 0.18))
  const bottomPad = Math.max(4, Math.round(size * 0.08))
  editor.style.paddingTop = `${topPad}px`
  editor.style.paddingBottom = `${bottomPad}px`
  const currentLh = parseInt(editor.style.lineHeight, 10) || Math.round(size * 1.6)
  if (editor.classList.contains("lined-note-bg")) {
    editor.style.backgroundSize = `100% ${currentLh}px`
    editor.style.backgroundPositionY = `${Math.round(topPad * 0.5)}px`
  }
}

export function applyBaseEditorStyle(editor, style, theme, { lined = false } = {}) {
  if (!editor) return
  const fontId = resolveFontId(style.fontFamily)
  const size = parseStoredSize(style.fontSize)
  editor.style.fontFamily = fontFamilyCss(fontId)
  editor.style.fontSize = `${size}pt`
  editor.style.fontWeight = style.bold ? "700" : "400"
  editor.style.textDecoration = style.underline ? "underline" : "none"
  editor.style.color = contentColor(style.textColor || DEFAULT_TEXT_COLOR, theme)
  applyLineHeight(editor, style.lineHeight || "normal")
  if (lined) {
    editor.classList.add("lined-note-bg")
    applyLineHeight(editor, style.lineHeight || "normal")
    syncEditorVerticalSpace(editor)
  } else {
    editor.classList.remove("lined-note-bg")
    editor.style.backgroundSize = ""
  }
}

function restoreRange(editor, savedRange) {
  if (!editor || !savedRange) return null
  try {
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(savedRange)
  } catch {
    return null
  }
  const sel = window.getSelection()
  if (!sel?.rangeCount) return null
  const range = sel.getRangeAt(0)
  if (range.collapsed) return null
  const root = range.commonAncestorContainer
  if (!editor.contains(root) && root !== editor) return null
  return range
}

function wrapTextInRange(range, applyStyle) {
  const startNode = range.startContainer
  const startOffset = range.startOffset
  const endNode = range.endContainer
  const endOffset = range.endOffset

  const textNodes = []
  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer
  if (!root) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (range.intersectsNode(node) && node.nodeValue) textNodes.push(node)
    node = walker.nextNode()
  }

  let wrapped = false
  for (const textNode of textNodes) {
    let start = 0
    let end = textNode.nodeValue.length
    if (textNode === startNode) start = startOffset
    if (textNode === endNode) end = endOffset
    if (start >= end) continue

    const selected = start > 0 ? textNode.splitText(start) : textNode
    if (end - start < selected.nodeValue.length) selected.splitText(end - start)
    const span = document.createElement("span")
    applyStyle(span)
    selected.parentNode.insertBefore(span, selected)
    span.appendChild(selected)
    wrapped = true
  }
  return wrapped
}

function applyStyleToSelection(range, applyStyle) {
  if (!range || range.collapsed) return false
  return wrapTextInRange(range, applyStyle)
}

export function applyEditorPatch(editor, patch, theme, savedRange, { lined = false } = {}) {
  if (!editor) return false
  const range = restoreRange(editor, savedRange)
  const hasSelection = Boolean(range)

  if (patch.fontSize != null) {
    if (hasSelection) applyStyleToSelection(range, (span) => {
      span.style.fontSize = `${patch.fontSize}pt`
    })
    else {
      editor.style.fontSize = `${patch.fontSize}pt`
      applyLineHeight(editor, "normal")
      if (lined) syncEditorVerticalSpace(editor)
    }
  }
  if (patch.fontFamily) {
    const family = fontFamilyCss(resolveFontId(patch.fontFamily))
    if (hasSelection) applyStyleToSelection(range, (span) => {
      span.style.fontFamily = family
    })
    else editor.style.fontFamily = family
  }
  if (patch.textColor) {
    const color = contentColor(patch.textColor, theme)
    if (hasSelection) applyStyleToSelection(range, (span) => {
      span.style.color = color
    })
    else editor.style.color = color
  }
  if (patch.bold != null) {
    if (hasSelection) document.execCommand("bold")
    else editor.style.fontWeight = patch.bold ? "700" : "400"
  }
  if (patch.underline != null) {
    if (hasSelection) document.execCommand("underline")
    else editor.style.textDecoration = patch.underline ? "underline" : "none"
  }

  return hasSelection
}

export function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, "").trim()
}

export function titleFromContent(html, fallback = "무제 메모") {
  return stripHtml(html).slice(0, 30) || fallback
}

export function todayNoticeTitle() {
  const now = new Date()
  return `${now.getMonth() + 1}월 ${now.getDate()}일 알림장`
}

export function todayNoticeDateText() {
  const now = new Date()
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}`
}

export function kstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function inferNoticeDate(raw) {
  if (typeof raw?.noticeDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.noticeDate)) {
    return raw.noticeDate
  }
  const titleMatch = String(raw?.title || "").match(/(\d{1,2})월\s*(\d{1,2})일/)
  const fromUpdated = raw?.updatedAt ? kstDateKey(new Date(raw.updatedAt)) : null
  if (titleMatch) {
    const year = (fromUpdated || kstDateKey()).slice(0, 4)
    const month = String(titleMatch[1]).padStart(2, "0")
    const day = String(titleMatch[2]).padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  return fromUpdated
}
