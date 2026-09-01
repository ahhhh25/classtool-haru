import { useEffect, useRef, useState } from "react"
import {
  CalendarDays,
  Dices,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  NotebookPen,
  PanelLeftClose,
  Puzzle,
  Settings,
  Timer,
  UserRound,
  Users,
} from "lucide-react"
import { VIEWS } from "../constants/views"

const ADD_WIDGETS = [
  { type: "notice", label: "+ 공지 위젯 추가" },
  { type: "announcement", label: "+ 알림 위젯 추가" },
  { type: "checkboard", label: "+ 체크 위젯 추가" },
  { type: "date", label: "+ 날짜 위젯 추가" },
  { type: "clock", label: "+ 시간 위젯 추가" },
]

const NAV_ITEMS = [
  { id: VIEWS.dashboard, label: "대시보드 +", icon: LayoutDashboard },
  { id: VIEWS.notepad, label: "메모장", icon: NotebookPen },
  { id: VIEWS.noticebook, label: "알림장", icon: CalendarDays },
  { id: VIEWS.timer, label: "타이머", icon: Timer },
  { id: VIEWS.picker, label: "랜덤뽑기 +", icon: Dices },
  { id: VIEWS.settings, label: "설정", icon: Settings },
]

const PICKER_SUBS = [
  { id: "individual", label: "개인 랜덤", icon: UserRound },
  { id: "group", label: "모둠 랜덤", icon: Users },
]

const PICKER_GROUP_MODES = [
  { id: "pick", label: "+ 번호 뽑기" },
  { id: "order", label: "+ 순서 정하기" },
  { id: "create", label: "+ 모둠 만들기" },
]

export default function Sidebar({
  open,
  onToggle,
  activeView,
  onNavigate,
  onAddWidget,
  layoutPresets = [],
  onSaveLayoutPreset,
  onApplyLayoutPreset,
  onDeleteLayoutPreset,
  pickerSub = "individual",
  pickerGroupMode = "pick",
  onPickerSub,
  onPickerGroupMode,
}) {
  const [dashOpen, setDashOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false)
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState("")
  const [listOpen, setListOpen] = useState(false)
  const [pickerGroupOpen, setPickerGroupOpen] = useState(false)
  const presetNameRef = useRef(null)
  const expandOnOpenRef = useRef(null)

  useEffect(() => {
    if (open) {
      if (expandOnOpenRef.current === VIEWS.dashboard) {
        setDashOpen(true)
        setWidgetMenuOpen(true)
        setPickerOpen(false)
      } else if (expandOnOpenRef.current === VIEWS.picker) {
        setPickerOpen(true)
        setPickerGroupOpen(true)
        setDashOpen(false)
      } else {
        setDashOpen(false)
        setPickerOpen(false)
      }
      expandOnOpenRef.current = null
      return
    }
    setDashOpen(false)
    setPickerOpen(false)
    setPickerGroupOpen(false)
  }, [open])

  useEffect(() => {
    if (!open || activeView !== VIEWS.dashboard) {
      setWidgetMenuOpen(false)
      setPresetMenuOpen(false)
      setSavingPreset(false)
    }
  }, [open, activeView])

  useEffect(() => {
    if (savingPreset) presetNameRef.current?.focus()
  }, [savingPreset])

  const submitPreset = () => {
    const name = presetName.trim()
    if (!name) return
    onSaveLayoutPreset?.(name)
    setPresetName("")
    setSavingPreset(false)
    setListOpen(true)
  }

  return (
    <aside
      className={`theme-surface flex h-full shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "w-60" : "w-16"
      }`}
    >
      <div className={`flex h-16 items-center ${open ? "px-3" : "justify-center"}`}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "사이드바 접기" : "사이드바 펼치기"}
          aria-expanded={open}
          className="flex size-10 items-center justify-center rounded-lg text-ink transition-colors hover:bg-hover accent-hover"
        >
          {open ? (
            <PanelLeftClose size={20} strokeWidth={1.5} />
          ) : (
            <Menu size={20} strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={!open}
          aria-label="사이드바 접기"
          className={`overflow-hidden rounded-lg text-left transition-[width,opacity,margin] duration-300 ${
            open
              ? "ml-0.5 w-[11.25rem] px-1 py-0.5 opacity-100 hover:bg-hover"
              : "pointer-events-none ml-0 w-0 px-0 opacity-0"
          }`}
        >
          <div className="w-[11.25rem]">
            <p className="whitespace-nowrap text-[22px] font-bold tracking-tight text-ink">하루</p>
            <p className="whitespace-nowrap text-[11px] leading-snug text-muted">교사의 하루를 위한 도구</p>
          </div>
        </button>
      </div>

      <nav className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          const hasBranch = item.id === VIEWS.dashboard || item.id === VIEWS.picker
          const branchOpen =
            item.id === VIEWS.dashboard ? dashOpen : item.id === VIEWS.picker ? pickerOpen : false
          return (
            <div key={item.id}>
              <button
                type="button"
                title={item.label}
                aria-expanded={hasBranch ? branchOpen : undefined}
                onClick={() => {
                  if (hasBranch && !open && activeView === item.id) {
                    expandOnOpenRef.current = item.id
                    onToggle()
                    return
                  }
                  if (hasBranch && open) {
                    onNavigate(item.id)
                    if (item.id === VIEWS.dashboard) {
                      const next = !dashOpen
                      setDashOpen(next)
                      setWidgetMenuOpen(next)
                      if (!next) setPresetMenuOpen(false)
                      setPickerOpen(false)
                    } else {
                      setPickerOpen((visible) => !visible)
                      setDashOpen(false)
                    }
                    return
                  }
                  onNavigate(item.id)
                  if (open) onToggle()
                }}
                className={`nav-item flex h-11 w-full items-center rounded-lg text-icon transition-colors hover:bg-hover ${
                  active ? "is-active" : ""
                } ${open ? "gap-3 px-2.5" : "justify-center"}`}
              >
                <Icon size={20} strokeWidth={1.5} className="shrink-0" />
                <span
                  className={`overflow-hidden text-[13px] whitespace-nowrap transition-all duration-300 ${
                    open ? "w-auto opacity-100" : "w-0 opacity-0"
                  }`}
                >
                  {item.label}
                </span>
              </button>
              {item.id === VIEWS.dashboard && open && dashOpen && (
                <div className="mt-1 mb-1 flex flex-col gap-1 pl-7">
                  <button
                    type="button"
                    aria-expanded={widgetMenuOpen}
                    onClick={() => {
                      onNavigate(VIEWS.dashboard)
                      setWidgetMenuOpen((visible) => !visible)
                      setPresetMenuOpen(false)
                    }}
                    className={`nav-item is-nested flex items-center rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-hover ${
                      widgetMenuOpen ? "is-active" : "text-icon"
                    }`}
                  >
                    <span className="nav-nested-label has-icon gap-3">
                      <Puzzle size={20} strokeWidth={1.5} className="shrink-0" />
                      위젯 추가
                    </span>
                  </button>
                  {widgetMenuOpen &&
                    ADD_WIDGETS.map((widget) => (
                      <button
                        key={widget.type}
                        type="button"
                        onClick={() => onAddWidget?.(widget.type)}
                        className="accent-hover flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-icon transition-colors hover:bg-hover"
                      >
                        <span className="size-5 shrink-0" aria-hidden />
                        {widget.label}
                      </button>
                    ))}

                  <button
                    type="button"
                    aria-expanded={presetMenuOpen}
                    onClick={() => {
                      onNavigate(VIEWS.dashboard)
                      setPresetMenuOpen((visible) => !visible)
                      setWidgetMenuOpen(false)
                    }}
                    className={`nav-item is-nested flex items-center rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-hover ${
                      presetMenuOpen ? "is-active" : "text-icon"
                    }`}
                  >
                    <span className="nav-nested-label has-icon gap-3">
                      <LayoutGrid size={20} strokeWidth={1.5} className="shrink-0" />
                      화면 배치 저장
                    </span>
                  </button>
                  {presetMenuOpen && (
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSavingPreset(true)
                          setPresetName("")
                        }}
                        className="accent-hover flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-icon hover:bg-hover"
                      >
                        <span className="size-5 shrink-0" aria-hidden />
                        + 현재 화면 저장
                      </button>
                      {savingPreset && (
                        <form
                          className="flex flex-col gap-1.5 px-0.5"
                          onSubmit={(event) => {
                            event.preventDefault()
                            submitPreset()
                          }}
                        >
                          <input
                            ref={presetNameRef}
                            type="text"
                            value={presetName}
                            onChange={(event) => setPresetName(event.target.value)}
                            placeholder="화면 이름"
                            className="h-9 w-full rounded-md border border-line bg-sunken px-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSavingPreset(false)
                                setPresetName("")
                              }}
                              className="accent-hover h-8 flex-1 rounded-md border border-line text-[12px] text-icon hover:bg-hover"
                            >
                              취소
                            </button>
                            <button
                              type="submit"
                              className="btn-cta h-8 flex-1 rounded-md text-[12px]"
                            >
                              저장
                            </button>
                          </div>
                        </form>
                      )}
                      <button
                        type="button"
                        aria-expanded={listOpen}
                        onClick={() => setListOpen((visible) => !visible)}
                        className={`nav-item is-nested flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-hover ${
                          listOpen ? "is-active" : "text-icon"
                        }`}
                      >
                        <span className="size-5 shrink-0" aria-hidden />
                        <span className="nav-nested-label">+ 저장 목록</span>
                      </button>
                      {listOpen && (
                        <div className="flex flex-col gap-1">
                          {layoutPresets.length === 0 && (
                            <p className="px-2.5 py-1 text-[12px] text-faint">저장된 화면이 없습니다.</p>
                          )}
                          {layoutPresets.map((preset) => (
                            <div key={preset.id} className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onApplyLayoutPreset?.(preset.id)}
                                className="accent-hover min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-[13px] text-icon hover:bg-hover"
                              >
                                {preset.name}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteLayoutPreset?.(preset.id)}
                                className="shrink-0 rounded-md px-2 py-1.5 text-[12px] text-muted hover:bg-hover hover:text-ink"
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {item.id === VIEWS.picker && open && pickerOpen && (
                <div className="mt-1 mb-1 flex flex-col gap-1 pl-7">
                  {PICKER_SUBS.map((sub) => {
                    const SubIcon = sub.icon
                    const subActive = activeView === VIEWS.picker && pickerSub === sub.id
                    return (
                      <div key={sub.id}>
                        <button
                          type="button"
                          onClick={() => onPickerSub?.(sub.id)}
                          className={`nav-item is-nested flex items-center rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-hover ${
                            subActive ? "is-active" : "text-icon"
                          }`}
                        >
                          <span className="nav-nested-label has-icon gap-3">
                            <SubIcon size={20} strokeWidth={1.5} className="shrink-0" />
                            {sub.label}
                          </span>
                        </button>
                        {sub.id === "group" && (subActive || pickerGroupOpen) && (
                          <div className="mt-1 flex flex-col gap-1 pl-4">
                            {PICKER_GROUP_MODES.map((mode) => (
                              <button
                                key={mode.id}
                                type="button"
                                onClick={() => onPickerGroupMode?.(mode.id)}
                                className={`nav-item is-nested flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-hover ${
                                  pickerGroupMode === mode.id ? "is-active" : "text-icon"
                                }`}
                              >
                                <span className="size-5 shrink-0" aria-hidden />
                                <span className="nav-nested-label">{mode.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
