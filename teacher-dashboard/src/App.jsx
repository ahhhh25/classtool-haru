import { useCallback, useEffect, useRef, useState } from "react"
import Dashboard from "./components/Dashboard"
import FocusMode from "./components/FocusMode"
import SettingsPage from "./components/SettingsPage"
import Sidebar from "./components/Sidebar"
import StudentRosterPage from "./components/StudentRosterPage"
import WidgetCard from "./components/WidgetCard"
import NotepadTool from "./components/tools/NotepadTool"
import NoticeBookTool from "./components/tools/NoticeBookTool"
import PickerTool from "./components/tools/PickerTool"
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
import { createLayoutItem, createWidget, mergeLayoutChange } from "./utils/widgets"

export default function App() {
  const { theme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeView, setActiveView] = useState(VIEWS.dashboard)
  const [pickerSub, setPickerSub] = useState("individual")
  const [pickerGroupMode, setPickerGroupMode] = useState("pick")
  const [settingsSub, setSettingsSub] = useState("general")
  const [saved] = useState(loadDashboard)
  const [widgets, setWidgets] = useState(saved.widgets)
  const [layout, setLayout] = useState(saved.layout)
  const [stackOrder, setStackOrder] = useState(saved.stackOrder)
  const [layoutPresets, setLayoutPresets] = useState(saved.layoutPresets ?? [])
  const [focusedWidgetId, setFocusedWidgetId] = useState(null)
  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets

  useEffect(() => {
    saveDashboard({ widgets, layout, stackOrder, layoutPresets })
  }, [widgets, layout, stackOrder, layoutPresets])

  const updateWidget = useCallback((id, patch) => {
    setWidgets((current) =>
      current.map((widget) => (widget.id === id ? { ...widget, ...patch } : widget)),
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
    setFocusedWidgetId((focused) => (focused === id ? null : focused))
    setWidgets((current) => current.filter((widget) => widget.id !== id))
    setLayout((items) => items.filter((item) => item.i !== id))
    setStackOrder((order) => order.filter((item) => item !== id))
  }, [])

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
    },
    [layoutPresets],
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
    setActiveView(view)
    if (view === VIEWS.settings) setSettingsSub("general")
    if (view !== VIEWS.dashboard) setFocusedWidgetId(null)
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
        onPickerSub={(id) => {
          setPickerSub(id)
          setActiveView(VIEWS.picker)
        }}
        onPickerGroupMode={(id) => {
          setPickerSub("group")
          setPickerGroupMode(id)
          setActiveView(VIEWS.picker)
        }}
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
          onToggleFocus={(id) => setFocusedWidgetId(id)}
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
          onSelectSub={setPickerSub}
          onSelectGroup={(id) => {
            setPickerSub("group")
            setPickerGroupMode(id)
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
        <FocusMode onClose={() => setFocusedWidgetId(null)}>
          <WidgetCard
            widget={focusedWidget}
            focused
            onToggleFocus={() => setFocusedWidgetId(null)}
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
    </div>
  )
}
