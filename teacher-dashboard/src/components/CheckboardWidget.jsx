import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { Check, Eye, EyeOff, GripVertical, Square, Trash2 } from "lucide-react"
import { fontFamilyCss } from "../constants/fonts"
import { DEFAULT_TEXT_COLOR } from "../constants/palette"
import ColorSwatches from "./ColorSwatches"
import { contentColor } from "../theme/displayColor"
import { useTheme } from "../theme/ThemeProvider"
import SettingsModal from "./SettingsModal"
import WidgetSettings from "./WidgetSettings"
import KioskConnectPanel from "./KioskConnectPanel"
import { useCheckboardCloud } from "../hooks/useCheckboardCloud"
import { useSharedStudents } from "../hooks/useSharedStudents"
import { isKioskLinked, useKioskLink } from "../utils/kioskLinkStore"
import {
  formatItemTimestamp,
  isStudentSettled,
  patchCheckItem,
  reorderItems,
  reorderVisibleItems,
  resolveCheckItemStyle,
  setItemChecks,
  sortCheckboardStudents,
  toggleCheck,
  visibleItems,
} from "../utils/checkboard"

function useFlipRows(ids) {
  const bodyRef = useRef(null)
  const lastRects = useRef(new Map())
  const idKey = ids.join("|")

  useLayoutEffect(() => {
    const root = bodyRef.current
    if (!root) return

    const rows = [...root.querySelectorAll("[data-flip-id]")]
    const nextRects = new Map()
    for (const row of rows) {
      nextRects.set(row.dataset.flipId, row.getBoundingClientRect())
    }

    for (const row of rows) {
      const id = row.dataset.flipId
      const previous = lastRects.current.get(id)
      const next = nextRects.get(id)
      if (!previous || !next) continue
      const dy = previous.top - next.top
      if (Math.abs(dy) < 1) continue
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: 340,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      })
    }

    lastRects.current = nextRects
  }, [idKey])

  return bodyRef
}

function inkFrom(color, theme, settled = false) {
  const ink = contentColor(color, theme)
  return settled ? `color-mix(in srgb, ${ink} 42%, transparent)` : ink
}

function textStyleFrom(style, theme, settled = false, textScale = 1) {
  return {
    fontFamily: fontFamilyCss(style.fontFamily),
    fontSize: `${Number(style.fontSize) * textScale}pt`,
    fontWeight: style.bold ? 700 : 400,
    color: inkFrom(style.textColor, theme, settled),
    textDecoration: settled ? "none" : style.underline ? "underline" : "none",
    textUnderlineOffset: style.underline && !settled ? "0.16em" : undefined,
    lineHeight: textScale > 1 ? 1.2 : 1.35,
  }
}

function tableTextStyle(widget, theme, settled = false, textScale = 1) {
  return textStyleFrom(widget, theme, settled, textScale)
}

function columnTextStyle(item, widget, theme, settled = false, textScale = 1) {
  return textStyleFrom(resolveCheckItemStyle(item, widget), theme, settled, textScale)
}

function columnCheckSize(item, widget, textScale = 1) {
  const style = resolveCheckItemStyle(item, widget)
  const base = Number(widget.fontSize) || style.fontSize || 16
  const scale = (style.fontSize / base) * textScale
  return { box: 36 * scale, icon: 26 * scale }
}

function isReorderHandle(target) {
  return !target.closest("button")
}

function slotFromPointer(list, selector, client, axis) {
  const nodes = [...list.querySelectorAll(selector)]
  if (!nodes.length) return 0
  for (let index = 0; index < nodes.length; index += 1) {
    const rect = nodes[index].getBoundingClientRect()
    const mid = axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2
    if (client < mid) return index
  }
  return nodes.length
}

function useReorderDrag({ items, axis, selector, onReorder, onActivate }) {
  const [dragId, setDragId] = useState(null)
  const [dropSlot, setDropSlot] = useState(null)
  const listRef = useRef(null)
  const dragRef = useRef(null)
  const itemsRef = useRef(items)
  const onReorderRef = useRef(onReorder)
  const onActivateRef = useRef(onActivate)
  itemsRef.current = items
  onReorderRef.current = onReorder
  onActivateRef.current = onActivate

  const finishDrag = (client) => {
    const session = dragRef.current
    dragRef.current = null
    setDragId(null)
    setDropSlot(null)
    if (!session) return
    if (!session.dragging) {
      onActivateRef.current?.(session.id)
      return
    }
    if (!listRef.current) return
    const fromIndex = itemsRef.current.findIndex((item) => item.id === session.id)
    const insertSlot = slotFromPointer(listRef.current, selector, client, axis)
    onReorderRef.current(fromIndex, insertSlot)
  }

  const onPointerDown = (event, id) => {
    if (event.button !== 0) return
    if (!isReorderHandle(event.target)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      start: axis === "x" ? event.clientX : event.clientY,
      dragging: false,
    }
  }

  const onPointerMove = (event) => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const pos = axis === "x" ? event.clientX : event.clientY
    if (!session.dragging) {
      if (Math.abs(pos - session.start) < 5) return
      session.dragging = true
      setDragId(session.id)
    }
    event.preventDefault()
    if (!listRef.current) return
    setDropSlot(slotFromPointer(listRef.current, selector, pos, axis))
  }

  const onPointerUp = (event) => {
    const session = dragRef.current
    if (!session || session.pointerId !== event.pointerId) return
    finishDrag(axis === "x" ? event.clientX : event.clientY)
  }

  const itemHandlers = (id) => ({
    onPointerDown: (event) => onPointerDown(event, id),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  })

  return { listRef, dragId, dropSlot, itemHandlers }
}

export function CheckboardSettings({ widget, onChange }) {
  const { theme } = useTheme()
  const board = widget.checkboard
  const kioskLink = useKioskLink()
  const linked = isKioskLinked(kioskLink)
  const [selectedId, setSelectedId] = useState(null)
  const selected = board.items.find((item) => item.id === selectedId) ?? null
  const selectedStyle = selected ? resolveCheckItemStyle(selected, widget) : null

  const updateBoard = (patch, extra = {}) => {
    onChange({ ...extra, checkboard: { ...board, ...patch, students: [] } })
  }

  const reorder = useReorderDrag({
    items: board.items,
    axis: "y",
    selector: "[data-check-item-id]",
    onReorder: (fromIndex, insertSlot) => {
      updateBoard({ items: reorderItems(board.items, fromIndex, insertSlot) })
    },
    onActivate: (id) => {
      setSelectedId((current) => (current === id ? null : id))
    },
  })

  const onStyleChange = (patch) => {
    if (!selected) {
      onChange(patch)
      return
    }
    const itemPatch = {}
    if (patch.fontSize != null) itemPatch.fontSize = patch.fontSize
    if (patch.fontFamily != null) itemPatch.fontFamily = patch.fontFamily
    if (patch.textColor != null) itemPatch.color = patch.textColor
    if (patch.bold != null) itemPatch.bold = patch.bold
    if (patch.underline != null) itemPatch.underline = patch.underline
    if (!Object.keys(itemPatch).length) return
    updateBoard({ items: patchCheckItem(board.items, selected.id, itemPatch) })
  }

  return (
    <div className={`flex flex-col ${linked ? "" : "min-h-0 flex-1"}`}>
      <div className="shrink-0 border-b border-line bg-widget">
        <WidgetSettings
          widget={
            selected
              ? {
                  ...widget,
                  fontSize: selectedStyle.fontSize,
                  fontFamily: selectedStyle.fontFamily,
                  textColor: selectedStyle.textColor,
                  bold: selectedStyle.bold,
                  underline: selectedStyle.underline,
                }
              : widget
          }
          onChange={onStyleChange}
          compact
          bare
          fields={selected ? ["size", "font", "style", "color"] : null}
        />
        <p className="px-4 pb-2.5 text-[12px] leading-relaxed text-muted">
          {selected
            ? `"${selected.name}" 항목의 글자 모양입니다. 다시 누르면 위젯 공통 설정으로 돌아갑니다.`
            : "위젯 공통 글자 모양입니다. 아래 목록에서 항목을 고르면 항목별로 바꿀 수 있습니다."}
        </p>
      </div>

      <div className={`px-4 py-5 ${linked ? "" : "min-h-0 flex-1 overflow-y-auto"}`}>
        <section className="space-y-3">
          <div className="space-y-1">
            <p className="text-[16px] text-ink">체크 목록</p>
            <p className="text-[12px] leading-relaxed text-muted">
              위젯에 표시할 체크 항목을 관리합니다. 마우스로 끌어 순서를 바꿀 수 있습니다.
            </p>
          </div>
          {board.items.length > 0 && (
          <ul ref={reorder.listRef} className="space-y-1.5">
            {board.items.map((item, index) => {
              const dragging = reorder.dragId === item.id
              const isSelected = selected?.id === item.id
              const showLine = reorder.dropSlot === index && reorder.dragId && reorder.dragId !== item.id
              return (
              <li
                key={item.id}
                data-check-item-id={item.id}
                {...reorder.itemHandlers(item.id)}
                className={`no-drag relative flex touch-none items-center gap-2 rounded-md border px-2.5 py-2 ${
                  isSelected ? "border-line-strong bg-active" : "border-line"
                } ${dragging ? "opacity-40" : ""} ${
                  reorder.dragId ? "cursor-grabbing select-none" : "cursor-grab"
                }`}
              >
                {showLine && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-0.5 bg-ink" />
                )}
                <GripVertical
                  size={14}
                  strokeWidth={1.5}
                  className="shrink-0 text-faint"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[13px]"
                    style={{ color: contentColor(item.color || widget.textColor, theme) }}
                  >
                    {item.name}
                  </p>
                  <p className="text-[11px] text-muted tabular-nums">
                    {formatItemTimestamp(item.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={item.visible ? `${item.name} 숨기기` : `${item.name} 보이기`}
                  aria-pressed={item.visible}
                  onClick={() =>
                    updateBoard({
                      items: board.items.map((entry) =>
                        entry.id === item.id ? { ...entry, visible: !entry.visible } : entry,
                      ),
                    })
                  }
                  className="flex size-8 items-center justify-center rounded-md text-icon hover:bg-hover hover:text-ink"
                >
                  {item.visible ? (
                    <Eye size={16} strokeWidth={1.5} />
                  ) : (
                    <EyeOff size={16} strokeWidth={1.5} className="text-faint" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`${item.name} 삭제`}
                  onClick={() => {
                    if (selectedId === item.id) setSelectedId(null)
                    updateBoard({
                      items: board.items.filter((entry) => entry.id !== item.id),
                    })
                  }}
                  className="flex size-8 items-center justify-center rounded-md text-icon hover:bg-hover hover:text-ink"
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                </button>
              </li>
              )
            })}
            {reorder.dropSlot === board.items.length && reorder.dragId && (
              <li className="pointer-events-none h-0.5 bg-ink" aria-hidden="true" />
            )}
          </ul>
          )}
        </section>

        <KioskConnectPanel widget={widget} />
      </div>
    </div>
  )
}

function AddItemModal({ widget, onChange, onClose }) {
  const { theme } = useTheme()
  const [students] = useSharedStudents()
  const board = widget.checkboard
  const [itemName, setItemName] = useState("")
  const [itemColor, setItemColor] = useState(widget.textColor || DEFAULT_TEXT_COLOR)
  const [pickingMissing, setPickingMissing] = useState(false)
  const [missingIds, setMissingIds] = useState(() => new Set())

  const resolveName = () => {
    const typed = itemName.trim()
    if (typed) return typed
    return `체크 ${board.items.length + 1}`
  }

  const createItem = (checkedStudentIds) => {
    try {
      const name = resolveName()
      const itemId = crypto.randomUUID()
      const item = {
        id: itemId,
        name,
        color: itemColor,
        createdAt: Date.now(),
        visible: true,
      }
      console.log("[checkboard] createItem", { name, itemId, students: students.length, checked: checkedStudentIds.length })
      onChange({
        checkboard: {
          items: [...board.items, item],
          students: [],
          checks: setItemChecks(board.checks, students, itemId, checkedStudentIds),
        },
      })
      onClose()
    } catch (error) {
      console.error("[checkboard] createItem failed", error)
    }
  }

  const createFromAll = () => {
    console.log("[checkboard] 전체 명단 만들기")
    createItem([])
  }

  const createFromMissing = () => {
    const submittedIds = students
      .filter((student) => !missingIds.has(student.id))
      .map((student) => student.id)
    console.log("[checkboard] 미제출자 명단 만들기", { missing: missingIds.size, submitted: submittedIds.length })
    createItem(submittedIds)
  }

  return (
    <SettingsModal title="체크 항목 추가" onClose={onClose} fit>
      <div className="space-y-4 px-4 py-4">
        <ColorSwatches kind="text" compact value={itemColor} onChange={setItemColor} />
        <div className="flex items-center gap-2">
          <span
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-line"
            style={{ color: contentColor(itemColor, theme) }}
            aria-hidden="true"
          >
            <Check size={22} strokeWidth={2} />
          </span>
          <input
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
            placeholder="항목 이름"
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-sunken px-3 text-[14px] outline-none focus:border-line-strong"
            style={{ color: contentColor(itemColor, theme) }}
          />
        </div>

        {!pickingMissing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={createFromAll}
              className="h-10 flex-1 rounded-md border border-line text-[13px] text-icon transition-colors hover:bg-hover hover:text-ink"
            >
              전체 명단 만들기
            </button>
            <button
              type="button"
              onClick={() => {
                console.log("[checkboard] 미제출자 선택 화면")
                setPickingMissing(true)
                setMissingIds(new Set())
              }}
              className="h-10 flex-1 rounded-md border border-line text-[13px] text-icon transition-colors hover:bg-hover hover:text-ink"
            >
              미제출자 명단 만들기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {students.length === 0 ? (
              <p className="text-[13px] text-faint">등록된 학생이 없습니다.</p>
            ) : (
              <ul className="grid grid-cols-5 gap-1.5">
                {students.map((student) => {
                  const selected = missingIds.has(student.id)
                  return (
                    <li key={student.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setMissingIds((current) => {
                            const next = new Set(current)
                            if (next.has(student.id)) next.delete(student.id)
                            else next.add(student.id)
                            return next
                          })
                        }}
                        className={`h-10 w-full truncate rounded-md border px-2 text-[13px] transition-colors ${
                          selected
                            ? "border-line-strong bg-active text-ink"
                            : "border-line text-icon hover:bg-hover"
                        }`}
                      >
                        {student.name}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPickingMissing(false)}
                className="h-9 rounded-md border border-line px-3 text-[13px] text-icon hover:bg-hover hover:text-ink"
              >
                뒤로
              </button>
              <button
                type="button"
                onClick={createFromMissing}
                className="h-9 rounded-md border border-line px-3 text-[13px] text-ink hover:bg-active"
              >
                완료
              </button>
            </div>
          </div>
        )}
      </div>
    </SettingsModal>
  )
}

export default function CheckboardWidget({ widget, onChange, addItemOpen, onCloseAddItem, textScale = 1 }) {
  const { theme } = useTheme()
  const [students] = useSharedStudents()
  const board = widget.checkboard
  const cloud = useCheckboardCloud(widget, onChange)
  const shownItems = useMemo(() => visibleItems(board.items), [board.items])
  const rows = useMemo(
    () => sortCheckboardStudents(students, shownItems, board.checks),
    [students, shownItems, board.checks],
  )
  const bodyRef = useFlipRows(rows.map((student) => student.id))

  const updateBoard = (patch) => {
    onChange({ checkboard: { ...board, ...patch, students: [] } })
  }

  const reorder = useReorderDrag({
    items: shownItems,
    axis: "x",
    selector: "[data-check-item-id]",
    onReorder: (fromIndex, insertSlot) => {
      updateBoard({ items: reorderVisibleItems(board.items, fromIndex, insertSlot) })
    },
  })

  const empty = students.length === 0 || shownItems.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {cloud.linked && cloud.error && (
        <p className="shrink-0 border-b border-line px-3 py-1.5 text-[12px] text-muted">{cloud.error}</p>
      )}
      <div className="widget-scroll min-h-0 flex-1 overflow-auto">
        {empty ? (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <p className="widget-empty text-[13px]">
              설정 → 학생 명단 관리에서 학생을 등록하고, + 로 체크 항목을 추가하세요.
            </p>
          </div>
        ) : (
          <table className="w-max max-w-full border-collapse">
            <thead className="sticky top-0 z-[1] bg-widget">
              <tr ref={reorder.listRef}>
                <th className="w-px border-b border-line py-1.5 pr-2 pl-3" />
                {shownItems.map((item, index) => {
                  const dragging = reorder.dragId === item.id
                  const showLeft = reorder.dropSlot === index && reorder.dragId && reorder.dragId !== item.id
                  const showRight =
                    index === shownItems.length - 1 &&
                    reorder.dropSlot === shownItems.length &&
                    Boolean(reorder.dragId)
                  return (
                  <th
                    key={item.id}
                    data-check-item-id={item.id}
                    {...reorder.itemHandlers(item.id)}
                    className={`no-drag relative w-px touch-none border-b border-line px-1.5 py-1.5 text-center whitespace-nowrap ${
                      dragging ? "opacity-40" : ""
                    } ${reorder.dragId ? "cursor-grabbing select-none" : "cursor-grab"}`}
                    style={columnTextStyle(item, widget, theme, false, textScale)}
                  >
                    {showLeft && (
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-0.5 bg-ink" />
                    )}
                    {showRight && (
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-0.5 bg-ink" />
                    )}
                    {item.name}
                  </th>
                  )
                })}
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {rows.map((student) => {
                const settled = isStudentSettled(student, shownItems, board.checks)
                const rowStyle = tableTextStyle(widget, theme, settled, textScale)
                return (
                  <tr
                    key={student.id}
                    data-flip-id={student.id}
                    className={settled ? "checkboard-settled" : "hover:bg-hover"}
                    style={settled ? { color: inkFrom(widget.textColor, theme, true) } : undefined}
                  >
                    <td
                      className="w-px border-b border-line py-0.5 pr-2 pl-3 whitespace-nowrap"
                      style={rowStyle}
                    >
                      {student.name}
                    </td>
                    {shownItems.map((item) => {
                      const checked = Boolean(board.checks[student.id]?.[item.id])
                      const checkStyle = resolveCheckItemStyle(item, widget)
                      const checkSize = columnCheckSize(item, widget, textScale)
                      return (
                        <td
                          key={item.id}
                          className={`w-px border-b border-line px-1.5 py-0.5 text-center ${
                            reorder.dragId === item.id ? "opacity-40" : ""
                          }`}
                          style={{ color: inkFrom(checkStyle.textColor, theme, settled) }}
                        >
                          <button
                            type="button"
                            aria-label={`${student.name} ${item.name} ${checked ? "해제" : "체크"}`}
                            aria-pressed={checked}
                            onClick={() =>
                              updateBoard({
                                checks: toggleCheck(board.checks, student.id, item.id),
                              })
                            }
                            className="inline-flex items-center justify-center rounded-md transition-colors hover:bg-hover"
                            style={{
                              width: `${checkSize.box}px`,
                              height: `${checkSize.box}px`,
                              color: inkFrom(checkStyle.textColor, theme, settled),
                            }}
                          >
                            {checked ? (
                              <Check size={checkSize.icon} strokeWidth={2} />
                            ) : (
                              <Square size={checkSize.icon} strokeWidth={2} />
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {addItemOpen && (
        <AddItemModal widget={widget} onChange={onChange} onClose={onCloseAddItem} />
      )}
    </div>
  )
}
