import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

export default function SettingsModal({
  title,
  headerExtra,
  onClose,
  children,
  fit = false,
  tall = false,
  overflowVisible = false,
  contentWidth = 0,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const viewport = typeof window !== "undefined" ? window.innerWidth - 48 : 840
  const dialogWidth =
    contentWidth > 0 ? Math.min(Math.max(contentWidth + 40, 840), viewport) : 0

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        className="absolute inset-0 bg-overlay"
        aria-label="설정 닫기"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-settings-title"
        className={`theme-surface relative z-10 flex flex-col rounded-2xl border border-line bg-widget shadow-modal ${
          dialogWidth > 0 ? "" : "w-[min(840px,calc(100vw-48px))]"
        } ${
          overflowVisible ? "overflow-visible" : "overflow-hidden"
        } ${tall ? "max-h-[min(94vh,1080px)]" : fit ? "" : "max-h-[min(80vh,740px)]"}`}
        style={dialogWidth > 0 ? { width: `${dialogWidth}px`, maxWidth: "calc(100vw - 48px)" } : undefined}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
          <h3 id="widget-settings-title" className="shrink-0 text-[14px] text-ink">
            {title}
          </h3>
          {headerExtra}
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-icon transition-colors hover:bg-hover hover:text-ink"
            aria-label="설정 닫기"
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        <div
          className={`flex flex-col ${
            overflowVisible
              ? "min-h-0 flex-1 overflow-visible"
              : fit
                ? ""
                : tall
                  ? "min-h-0 overflow-y-auto"
                  : "min-h-0 flex-1 overflow-hidden"
          }`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
