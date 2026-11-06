import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Dashboard from "./components/Dashboard"
import FocusMode from "./components/FocusMode"
import SettingsPage from "./components/SettingsPage"
import Sidebar from "./components/Sidebar"
import StudentRosterPage from "./components/StudentRosterPage"
import WidgetCard from "./components/WidgetCard"
import NotepadTool from "./components/tools/NotepadTool"
import NoticeBookTool from "./components/tools/NoticeBookTool"
import PickerTool from "./components/tools/PickerTool"
import SeatingTool from "./components/tools/SeatingTool"
import TimerTool from "./components/tools/TimerTool"
import { VIEWS } from "./constants/views"
import { useTheme } from "./theme/ThemeProvider"
import { downloadAppBackup, restoreAppBackup } from "./utils/appBackup"
import {
  applyLayoutPreset,
  createLayoutPreset,
  loadDashboard,
  saveDashboard,
} from "./utils/dashboardStore"
import { isHaruReceiver, persistWidgetFocus, readWidgetFocus, subscribeSync, SYNC, syncSend, scheduleDashboardSync, flushDashboardSync } from "./utils/syncChannel"
import { createLayoutItem, createWidget, mergeLayoutChange } from "./utils/widgets"

export default function App() {
  const { theme } = useTheme()
  const isReceiver = isHaruReceiver()
  const [sidebarOpen, setSidebarOpen] = useState(!isReceiver)
  const [activeView, setActiveView] = useState(VIEWS.dashboard)
  const [pickerSub, setPickerSub] = useState("individual")
  const [pickerGroupMode, setPickerGroupMode] = useState("pick")
  const [settingsSub, setSettingsSub] = useState("general")
  const [saved] = useState(loadDashboard)
  const [widgets, setWidgets] = useState(saved.widgets)
  const [layout, setLayout] = useState(saved.layout)
  const [stackOrder, setStackOrder] = useState(saved.stackOrder)
  const [layoutPresets, setLayoutPresets] = useState(saved.layoutPresets ?? [])
  const [focusedWidgetId, setFocusedWidgetId] = useState(() => (isReceiver ? readWidgetFocus() : null))
  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets
  const focusedWidgetIdRef = useRef(null)
  focusedWidgetIdRef.current = focusedWidgetId
  const viewSyncRef = useRef({})
  viewSyncRef.current = {
    view: activeView,
    pickerSub,
    pickerGroupMode,
    settingsSub,
    focusedWidgetId,
  }
  const skipDashboardSync = useRef(true)
  const applyingDashboardRemote = useRef(false)

  const sendViewSync = useCallback((overrides = {}) => {
    const snap = { ...viewSyncRef.current, ...overrides }
    syncSend(SYNC.VIEW_CHANGE, {
      view: snap.view,
      pickerSub: snap.pickerSub,
      pickerGroupMode: snap.pickerGroupMode,
      settingsSub: snap.settingsSub,
      focusedWidgetId: snap.focusedWidgetId ?? null,
    })
  }, [])

  const applyRemoteFocus = useCallback((id) => {
    const next = typeof id === "string" && id ? id : null
    focusedWidgetIdRef.current = next
    setFocusedWidgetId(next)
    if (next) setActiveView(VIEWS.dashboard)
  }, [])

  const setFocus = useCallback(
    (id) => {
      const next = typeof id === "string" && id ? id : null
      focusedWidgetIdRef.current = next
      setFocusedWidgetId(next)
      if (!isReceiver) persistWidgetFocus(next)
    },
    [isReceiver],
  )

  useEffect(() => {
    if (isReceiver) return
    saveDashboard({ widgets, layout, stackOrder, layoutPresets })
    if (skipDashboardSync.current) {
      skipDashboardSync.current = false
      return
    }
    if (applyingDashboardRemote.current) {
      applyingDashboardRemote.current = false
      return
    }
    scheduleDashboardSync()
  }, [widgets, layout, stackOrder, layoutPresets, isReceiver])

  useEffect(() => {
    return subscribeSync((msg) => {
      if (msg.type === SYNC.STATE_REQUEST) {
        if (isReceiver) return
        sendViewSync()
        persistWidgetFocus(focusedWidgetIdRef.current)
        return
      }
      if (msg.type === SYNC.WIDGET_FOCUS) {
        applyRemoteFocus(msg.payload?.widgetId)
        return
      }
      if (msg.type === SYNC.VIEW_CHANGE) {
        const payload = msg.payload || {}
        if (payload.view) setActiveView(payload.view)
        if (payload.pickerSub) setPickerSub(payload.pickerSub)
        if (payload.pickerGroupMode) setPickerGroupMode(payload.pickerGroupMode)
        if (payload.settingsSub) setSettingsSub(payload.settingsSub)
        if (Object.hasOwn(payload, "focusedWidgetId")) {
          applyRemoteFocus(payload.focusedWidgetId)
        } else if (payload.view && payload.view !== VIEWS.dashboard) {
          applyRemoteFocus(null)
        }
        return
      }
      if (msg.type !== SYNC.DASHBOARD_UPDATE) return
      applyingDashboardRemote.current = true
      const next = loadDashboard()
      setWidgets(next.widgets)
      setLayout(next.layout)
      setStackOrder(next.stackOrder)
      setLayoutPresets(next.layoutPresets ?? [])
      setFocusedWidgetId((id) => {
        const kept = next.widgets.some((widget) => widget.id === id) ? id : null
        focusedWidgetIdRef.current = kept
        return kept
      })
    })
  }, [applyRemoteFocus, isReceiver, sendViewSync])

  useEffect(() => {
    if (!isReceiver) return undefined
    syncSend(SYNC.STATE_REQUEST, {})
    return undefined
  }, [isReceiver])

  useEffect(() => {
    if (isReceiver) return undefined
    const flushIfField = (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest("input, textarea, select, [contenteditable='true']")) {
        flushDashboardSync()
      }
    }
    document.addEventListener("focusout", flushIfField)
    const onHidden = () => {
      if (document.hidden) flushDashboardSync()
    }
    document.addEventListener("visibilitychange", onHidden)
    return () => {
      document.removeEventListener("focusout", flushIfField)
      document.removeEventListener("visibilitychange", onHidden)
    }
  }, [isReceiver])

  const updateWidget = useCallback((id, patch) => {
    setWidgets((current) =>
      current.map((widget) => {
        if (widget.id !== id) return widget
        const resolved = typeof patch === "function" ? patch(widget) : patch
        if (!resolved || Object.keys(resolved).length === 0) return widget
        if (widget.type === "checkboard" && resolved.checkboard && widget.checkboard) {
          return {
            ...widget,
            ...resolved,
            checkboard: { ...widget.checkboard, ...resolved.checkboard },
          }
        }
        return { ...widget, ...resolved }
      }),
    )
  }, [])

  const bringToFront = useCallback((id) => {
    setStackOrder((current) => {
      if (current[current.length - 1] === id) return current
      return [...current.filter((item) => item !== id), id]
    })
  }, [])

  const addWidget = useCallback((type) => {
    const widget = createWidget(type)
    setLayout((current) => {
      const layoutItem = createLayoutItem(widget, current)
      return [...current, layoutItem]
    })
    setWidgets((current) => [...current, widget])
    setStackOrder((current) => [...current, widget.id])
  }, [])

  const closeWidget = useCallback((id) => {
    if (widgetsRef.current.find((widget) => widget.id === id)?.locked) return
    if (focusedWidgetIdRef.current === id) setFocus(null)
    setWidgets((current) => current.filter((widget) => widget.id !== id))
    setLayout((items) => items.filter((item) => item.i !== id))
    setStackOrder((order) => order.filter((item) => item !== id))
  }, [setFocus])

  const handleLayoutChange = useCallback((next) => {
    setLayout((current) => mergeLayoutChange(current, next))
  }, [])

  const saveLayoutPreset = useCallback(
    (name) => {
      if (!name?.trim()) return
      setLayoutPresets((current) => [...current, createLayoutPreset(name, layout)])
    },
    [layout],
  )

  const applySavedPreset = useCallback(
    (id) => {
      const preset = layoutPresets.find((entry) => entry.id === id)
      if (!preset) return
      setLayout((items) => applyLayoutPreset(items, preset.layout))
      setActiveView(VIEWS.dashboard)
      sendViewSync({ view: VIEWS.dashboard })
    },
    [layoutPresets, sendViewSync],
  )

  const deleteLayoutPreset = useCallback((id) => {
    setLayoutPresets((current) => current.filter((preset) => preset.id !== id))
  }, [])

  const backupApp = useCallback(() => {
    downloadAppBackup({ widgets, layout, stackOrder, layoutPresets }, theme)
  }, [widgets, layout, stackOrder, layoutPresets, theme])

  const restoreApp = useCallback(async (file) => {
    const confirmed = window.confirm("하루 앱의 모든 데이터를 이 백업으로 바꿀까요?")
    if (!confirmed) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!restoreAppBackup(parsed)) {
        window.alert("백업 파일을 읽을 수 없습니다.")
        return
      }
      window.location.reload()
    } catch {
      window.alert("백업 파일을 읽을 수 없습니다.")
    }
  }, [])

  const navigate = (view) => {
    const nextSettings = view === VIEWS.settings ? "general" : settingsSub
    setActiveView(view)
    if (view === VIEWS.settings) setSettingsSub("general")
    if (view !== VIEWS.dashboard) setFocus(null)
    sendViewSync({
      view,
      settingsSub: nextSettings,
      focusedWidgetId: view === VIEWS.dashboard ? focusedWidgetIdRef.current : null,
    })
  }

  const openPickerSub = (id) => {
    setPickerSub(id)
    setActiveView(VIEWS.picker)
    setFocus(null)
    sendViewSync({
      view: VIEWS.picker,
      pickerSub: id,
      focusedWidgetId: null,
    })
  }

  const openPickerGroup = (id) => {
    setPickerSub("group")
    setPickerGroupMode(id)
    setActiveView(VIEWS.picker)
    setFocus(null)
    sendViewSync({
      view: VIEWS.picker,
      pickerSub: "group",
      pickerGroupMode: id,
      focusedWidgetId: null,
    })
  }

  const focusedWidget = widgets.find((widget) => widget.id === focusedWidgetId) ?? null

  return (
    <div className="theme-surface flex h-svh overflow-hidden bg-app text-ink">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((open) => !open)}
        activeView={activeView}
        onNavigate={navigate}
        onAddWidget={addWidget}
        layoutPresets={layoutPresets}
        onSaveLayoutPreset={saveLayoutPreset}
        onApplyLayoutPreset={applySavedPreset}
        onDeleteLayoutPreset={deleteLayoutPreset}
        pickerSub={pickerSub}
        pickerGroupMode={pickerGroupMode}
        onPickerSub={openPickerSub}
        onPickerGroupMode={openPickerGroup}
      />
      <div className={activeView === VIEWS.dashboard ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <Dashboard
          widgets={widgets}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          onUpdateWidget={updateWidget}
          onCloseWidget={closeWidget}
          stackOrder={stackOrder}
          onBringToFront={bringToFront}
          focusedWidgetId={focusedWidgetId}
          onToggleFocus={setFocus}
        />
      </div>
      <div className={activeView === VIEWS.notepad ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <NotepadTool active={activeView === VIEWS.notepad} />
      </div>
      <div className={activeView === VIEWS.noticebook ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <NoticeBookTool />
      </div>
      <div className={activeView === VIEWS.timer ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <TimerTool />
      </div>
      <div className={activeView === VIEWS.picker ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <PickerTool
          sub={pickerSub}
          groupMode={pickerGroupMode}
          onSelectSub={openPickerSub}
          onSelectGroup={openPickerGroup}
        />
      </div>
      <div className={activeView === VIEWS.seating ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <SeatingTool
          active={activeView === VIEWS.seating}
          onOpenStudents={() => {
            setActiveView(VIEWS.settings)
            setSettingsSub("students")
            setFocus(null)
            sendViewSync({
              view: VIEWS.settings,
              settingsSub: "students",
              focusedWidgetId: null,
            })
          }}
        />
      </div>
      {activeView === VIEWS.settings && settingsSub === "students" ? (
        <StudentRosterPage onBack={() => setSettingsSub("general")} />
      ) : (
        activeView === VIEWS.settings && (
          <SettingsPage
            onBackup={backupApp}
            onRestore={restoreApp}
            onOpenStudents={() => setSettingsSub("students")}
          />
        )
      )}
      {focusedWidget && activeView === VIEWS.dashboard && (
        <FocusMode inert={isReceiver} onClose={() => setFocus(null)}>
          <WidgetCard
            widget={focusedWidget}
            focused
            onToggleFocus={() => setFocus(null)}
            onToggleLock={() =>
              updateWidget(focusedWidget.id, { locked: !focusedWidget.locked })
            }
            onToggleSettings={() =>
              updateWidget(focusedWidget.id, { settingsOpen: !focusedWidget.settingsOpen })
            }
            onChangeSettings={(patch) => updateWidget(focusedWidget.id, patch)}
            onClose={() => closeWidget(focusedWidget.id)}
          />
        </FocusMode>
      )}
      {isReceiver &&
        createPortal(
          <div
            className="pointer-events-auto fixed inset-0 z-40 cursor-not-allowed bg-transparent"
            aria-hidden
          />,
          document.body,
        )}
    </div>
  )
}
