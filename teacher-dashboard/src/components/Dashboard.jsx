import { useMemo } from "react"
import ReactGridLayout, { useContainerWidth } from "react-grid-layout"
import { noOverlapCompactor } from "react-grid-layout/core"
import WidgetCard from "./WidgetCard"
import { WIDGET_PRESETS } from "../utils/widgets"

export default function Dashboard({
  widgets,
  layout,
  onLayoutChange,
  onUpdateWidget,
  onCloseWidget,
  stackOrder,
  onBringToFront,
  focusedWidgetId = null,
  onToggleFocus,
}) {
  const { width, containerRef, mounted } = useContainerWidth()

  const zById = useMemo(() => {
    const map = new Map()
    stackOrder.forEach((id, index) => {
      map.set(id, index + 1)
    })
    return map
  }, [stackOrder])

  const gridLayout = useMemo(
    () =>
      layout.map((item) => {
        const widget = widgets.find((entry) => entry.id === item.i)
        const preset = widget ? WIDGET_PRESETS[widget.type] : null
        return {
          ...item,
          minW: preset?.minW ?? 2,
          minH: preset?.minH ?? 2,
          static: Boolean(widget?.locked),
        }
      }),
    [layout, widgets],
  )

  return (
    <main className="theme-surface min-w-0 flex-1 overflow-auto bg-app p-3">
      <div ref={containerRef} className="min-h-full">
        {mounted && (
          <ReactGridLayout
            width={width}
            layout={gridLayout}
            onLayoutChange={onLayoutChange}
            onDragStart={(_nextLayout, oldItem) => {
              if (oldItem?.i) onBringToFront(oldItem.i)
            }}
            onResizeStart={(_nextLayout, oldItem) => {
              if (oldItem?.i) onBringToFront(oldItem.i)
            }}
            gridConfig={{
              cols: 12,
              rowHeight: 36,
              margin: [12, 12],
              containerPadding: [4, 4],
            }}
            dragConfig={{
              enabled: true,
              handle: ".widget-drag-handle",
              cancel: ".no-drag",
            }}
            resizeConfig={{
              enabled: true,
              handles: ["se", "sw", "ne", "nw"],
            }}
            compactor={noOverlapCompactor}
          >
            {widgets.map((widget) => (
              <div
                key={widget.id}
                className={`h-full ${widget.locked ? "is-locked" : ""}`}
                style={{ zIndex: zById.get(widget.id) ?? 1 }}
                onPointerDownCapture={() => onBringToFront(widget.id)}
              >
                {focusedWidgetId === widget.id ? (
                  <div className="flex h-full items-center justify-center rounded-xl border border-line bg-widget/60">
                    <p className="text-[12px] text-faint">집중 모드</p>
                  </div>
                ) : (
                  <WidgetCard
                    widget={widget}
                    onToggleFocus={() => onToggleFocus(widget.id)}
                    onToggleLock={() => onUpdateWidget(widget.id, { locked: !widget.locked })}
                    onToggleSettings={() =>
                      onUpdateWidget(widget.id, { settingsOpen: !widget.settingsOpen })
                    }
                    onChangeSettings={(patch) => onUpdateWidget(widget.id, patch)}
                    onClose={() => onCloseWidget(widget.id)}
                  />
                )}
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>
    </main>
  )
}
