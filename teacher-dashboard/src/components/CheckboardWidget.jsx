import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { Check, Eye, EyeOff, Square, Trash2 } from "lucide-react"
import { fontFamilyCss } from "../constants/fonts"
import { TEXT_PALETTE, DEFAULT_TEXT_COLOR, swatchFill } from "../constants/palette"
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

function tableInk(widget, theme, settled = false) {
  const ink = contentColor(widget.textColor, theme)
  return settled ? `color-mix(in srgb, ${ink} 42%, transparent)` : ink
}

function tableTextStyle(widget, theme, settled = false, textScale = 1) {
  return {
    fontFamily: fontFamilyCss(widget.fontFamily),
    fontSize: `${Number(widget.fontSize) * textScale}pt`,
    fontWeight: widget.bold ? 700 : 400,
    color: tableInk(widget, theme, settled),
    textDecoration: settled ? "none" : widget.underline ? "underline" : "none",
    textUnderlineOffset: widget.underline && !settled ? "0.16em" : undefined,
    lineHeight: textScale > 1 ? 1.2 : 1.35,
  }
}

export function CheckboardSettings({ widget, onChange }) {
  const { theme } = useTheme()
  const board = widget.checkboard
  const kioskLink = useKioskLink()
  const linked = isKioskLinked(kioskLink)

  const updateBoard = (patch, extra = {}) => {
    onChange({ ...extra, checkboard: { ...board, ...patch, students: [] } })
  }

  return (
    <div className={`flex flex-col ${linked ? "" : "min-h-0 flex-1"}`}>
      <div className="shrink-0 bg-widget">
        <WidgetSettings widget={widget} onChange={onChange} compact bare />
      </div>

      <div className={`px-4 py-5 ${linked ? "" : "min-h-0 flex-1 overflow-y-auto"}`}>
        <section className="space-y-3">
          <div className="space-y-1">
            <p className="text-[16px] text-ink">체크 목록</p>
            <p className="text-[12px] leading-relaxed text-muted">
              위젯에 표시할 체크 항목을 관리합니다.
            </p>
          </div>
          {board.items.length > 0 && (
          <ul className="space-y-1.5">
            {board.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-line px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[13px]"
                    style={{ color: contentColor(item.color, theme) }}
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
                  onClick={() =>
                    updateBoard({
                      items: board.items.filter((entry) => entry.id !== item.id),
                    })
                  }
                  className="flex size-8 items-center justify-center rounded-md text-icon hover:bg-hover hover:text-ink"
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                </button>
              </li>
            ))}
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

  const createItem = (checkedStudentIds) => {
    const name = itemName.trim()
    if (!name) return
    const itemId = crypto.randomUUID()
    const item = {
      id: itemId,
      name,
      color: itemColor,
      createdAt: Date.now(),
      visible: true,
    }
    onChange({
      checkboard: {
        ...board,
        items: [...board.items, item],
        students: [],
        checks: setItemChecks(board.checks, students, itemId, checkedStudentIds),
      },
    })
    onClose()
  }

  const createFromAll = () => {
    createItem([])
  }

  const createFromMissing = () => {
    const submittedIds = students
      .filter((student) => !missingIds.has(student.id))
      .map((student) => student.id)
    createItem(submittedIds)
  }

  return (
    <SettingsModal title="체크 항목 추가" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex items-center gap-1.5">
          {TEXT_PALETTE.map((swatch) => {
            const selected = itemColor === swatch.hex
            return (
              <button
                key={swatch.id}
                type="button"
                aria-label={swatchFill(swatch, theme)}
                aria-pressed={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setItemColor(swatch.hex)}
                className={`size-3.5 shrink-0 rounded-full border transition-transform ${
                  selected ? "scale-110 border-ink" : "border-line hover:border-line-strong"
                }`}
                style={{ backgroundColor: swatchFill(swatch, theme) }}
              />
            )
          })}
        </div>
        <input
          value={itemName}
          onChange={(event) => setItemName(event.target.value)}
          className="h-10 w-full rounded-md border border-line bg-sunken px-3 text-[14px] outline-none focus:border-line-strong"
          style={{ color: contentColor(itemColor, theme) }}
        />

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
                if (!itemName.trim()) return
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
              <tr>
                <th className="w-px border-b border-line py-1.5 pr-2 pl-3" />
                {shownItems.map((item) => (
                  <th
                    key={item.id}
                    className="w-px border-b border-line px-1.5 py-1.5 text-center whitespace-nowrap"
                    style={{
                      ...tableTextStyle(widget, theme, false, textScale),
                      color: contentColor(item.color || widget.textColor, theme),
                    }}
                  >
                    {item.name}
                  </th>
                ))}
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
                    style={settled ? { color: tableInk(widget, theme, true) } : undefined}
                  >
                    <td
                      className="w-px border-b border-line py-0.5 pr-2 pl-3 whitespace-nowrap"
                      style={rowStyle}
                    >
                      {student.name}
                    </td>
                    {shownItems.map((item) => {
                      const checked = Boolean(board.checks[student.id]?.[item.id])
                      return (
                        <td key={item.id} className="w-px border-b border-line px-1.5 py-0.5 text-center">
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
                              width: `${36 * textScale}px`,
                              height: `${36 * textScale}px`,
                              color: tableInk(widget, theme, settled),
                            }}
                          >
                            {checked ? (
                              <Check size={26 * textScale} strokeWidth={2} />
                            ) : (
                              <Square size={26 * textScale} strokeWidth={2} />
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
