import { DEFAULT_COMPOSE_FONT_SIZE, getComposeFontSize } from "./composeFontSize"

export function createNoticeState() {
  return {
    mode: "auto",
    schedules: [],
    manualRuns: [],
    savedNotices: [],
    manualSavedId: null,
  }
}

export function createRun(text, style = {}) {
  return {
    text,
    fontFamily: style.fontFamily ?? "Paperlogy",
    fontSize: style.fontSize ?? getComposeFontSize() ?? DEFAULT_COMPOSE_FONT_SIZE,
    color: style.color ?? "#FFFFFF",
    bold: Boolean(style.bold),
    underline: Boolean(style.underline),
  }
}

export function plainToRuns(text, style = {}) {
  if (!text) return []
  return [createRun(text, style)]
}

export function runsToPlain(runs = []) {
  return runs.map((run) => run.text).join("")
}

export function styleFromWidget(widget) {
  return {
    fontFamily: widget.fontFamily,
    fontSize: widget.fontSize,
    color: widget.textColor,
    bold: widget.bold,
    underline: widget.underline,
  }
}

export function widgetPatchToRunPatch(patch) {
  const next = {}
  if (patch.fontSize != null) next.fontSize = patch.fontSize
  if (patch.fontFamily != null) next.fontFamily = patch.fontFamily
  if (patch.textColor != null) next.color = patch.textColor
  if (patch.bold != null) next.bold = patch.bold
  if (patch.underline != null) next.underline = patch.underline
  return next
}

function sameStyle(a, b) {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.underline === b.underline
  )
}

export function mergeRuns(runs) {
  const merged = []
  for (const run of runs) {
    if (!run.text) continue
    const prev = merged[merged.length - 1]
    if (prev && sameStyle(prev, run)) {
      prev.text += run.text
    } else {
      merged.push({ ...run })
    }
  }
  return merged
}

export function sliceRuns(runs, start, end) {
  const to = end
  const next = []
  let cursor = 0
  for (const run of runs) {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd
    if (runEnd <= start || runStart >= to) continue
    next.push({
      ...run,
      text: run.text.slice(Math.max(0, start - runStart), Math.min(run.text.length, to - runStart)),
    })
  }
  return mergeRuns(next)
}

function styleAt(runs, offset, fallback) {
  if (!runs.length) return fallback
  let cursor = 0
  for (const run of runs) {
    const runEnd = cursor + run.text.length
    if (offset < runEnd || offset === cursor) return run
    cursor = runEnd
  }
  return runs[runs.length - 1]
}

export function syncRunsWithPlain(runs, nextPlain, fallbackStyle) {
  const prev = runsToPlain(runs)
  if (nextPlain === prev) return runs
  if (!nextPlain) return []
  if (!runs.length) return plainToRuns(nextPlain, fallbackStyle)
  if (nextPlain.startsWith(prev)) {
    const extra = nextPlain.slice(prev.length)
    const last = runs[runs.length - 1]
    return mergeRuns([...runs.slice(0, -1), { ...last, text: last.text + extra }])
  }
  if (prev.startsWith(nextPlain)) {
    return sliceRuns(runs, 0, nextPlain.length)
  }

  let prefix = 0
  const limit = Math.min(prev.length, nextPlain.length)
  while (prefix < limit && prev[prefix] === nextPlain[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < prev.length - prefix &&
    suffix < nextPlain.length - prefix &&
    prev[prev.length - 1 - suffix] === nextPlain[nextPlain.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const head = sliceRuns(runs, 0, prefix)
  const tail = suffix ? sliceRuns(runs, prev.length - suffix, prev.length) : []
  const mid = nextPlain.slice(prefix, nextPlain.length - suffix)
  if (!mid) return mergeRuns([...head, ...tail])
  const midStyle = styleAt(runs, Math.min(prefix, Math.max(0, prev.length - 1)), fallbackStyle)
  return mergeRuns([...head, createRun(mid, midStyle), ...tail])
}

export function restoreSelection(container, start, end) {
  if (!container) return
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let pos = 0
  let startNode
  let startOff = 0
  let endNode
  let endOff = 0
  let node = walker.nextNode()
  while (node) {
    const len = node.textContent.length
    if (!startNode && start <= pos + len) {
      startNode = node
      startOff = Math.max(0, start - pos)
    }
    if (end <= pos + len) {
      endNode = node
      endOff = Math.max(0, end - pos)
      break
    }
    pos += len
    node = walker.nextNode()
  }
  if (!startNode) return
  const range = document.createRange()
  range.setStart(startNode, Math.min(startOff, startNode.textContent.length))
  range.setEnd(endNode || startNode, Math.min(endOff, (endNode || startNode).textContent.length))
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

export function toolbarWidgetFromRuns(runs, selection, fallback) {
  if (!runs?.length) return fallback
  const offset = selection ? selection.start : 0
  let cursor = 0
  for (const run of runs) {
    const runEnd = cursor + run.text.length
    if (offset < runEnd || (offset === cursor && run.text.length)) {
      return {
        fontSize: run.fontSize,
        fontFamily: run.fontFamily,
        textColor: run.color,
        bold: run.bold,
        underline: run.underline,
      }
    }
    cursor = runEnd
  }
  const last = runs[runs.length - 1]
  return {
    fontSize: last.fontSize,
    fontFamily: last.fontFamily,
    textColor: last.color,
    bold: last.bold,
    underline: last.underline,
  }
}

export function applyStyleToRange(runs, start, end, stylePatch) {
  const from = Math.max(0, Math.min(start, end))
  const to = Math.max(start, end)
  if (from === to || !runs.length) return runs

  const next = []
  let cursor = 0

  for (const run of runs) {
    const runStart = cursor
    const runEnd = cursor + run.text.length
    cursor = runEnd

    if (runEnd <= from || runStart >= to) {
      next.push({ ...run })
      continue
    }

    if (runStart < from) {
      next.push({ ...run, text: run.text.slice(0, from - runStart) })
    }

    next.push({
      ...run,
      ...stylePatch,
      text: run.text.slice(Math.max(0, from - runStart), Math.min(run.text.length, to - runStart)),
    })

    if (runEnd > to) {
      next.push({ ...run, text: run.text.slice(to - runStart) })
    }
  }

  return mergeRuns(next)
}

export function getOffsetsFromSelection(container) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !container) return null

  const range = selection.getRangeAt(0)
  if (range.collapsed) return null
  if (!container.contains(range.commonAncestorContainer)) return null

  const beforeStart = document.createRange()
  beforeStart.selectNodeContents(container)
  beforeStart.setEnd(range.startContainer, range.startOffset)

  const beforeEnd = document.createRange()
  beforeEnd.selectNodeContents(container)
  beforeEnd.setEnd(range.endContainer, range.endOffset)

  const start = beforeStart.toString().length
  const end = beforeEnd.toString().length
  if (start === end) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

export function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}

export function isTimeInRange(start, end, date) {
  const now = date.getHours() * 60 + date.getMinutes()
  const from = timeToMinutes(start)
  const to = timeToMinutes(end)
  if (from <= to) return now >= from && now <= to
  return now >= from || now <= to
}

export function getScheduleSlots(schedule) {
  if (Array.isArray(schedule?.slots) && schedule.slots.length > 0) {
    return schedule.slots
  }
  if (schedule?.start && schedule?.end) {
    return [{ id: "legacy", start: schedule.start, end: schedule.end }]
  }
  return []
}

export function formatSlotsLabel(schedule) {
  return getScheduleSlots(schedule)
    .map((slot) => `${slot.start}–${slot.end}`)
    .join(", ")
}

export function createDraftSlot(start = "09:00", end = "09:10") {
  return { id: crypto.randomUUID(), start, end }
}

export function findActiveSchedule(schedules, date) {
  let active = null
  for (const schedule of schedules) {
    const matches = getScheduleSlots(schedule).some((slot) =>
      isTimeInRange(slot.start, slot.end, date),
    )
    if (matches) active = schedule
  }
  return active
}

export function formatClock(date) {
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}
