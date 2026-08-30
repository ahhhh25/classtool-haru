import { createPortal } from "react-dom"

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        className="absolute inset-0 bg-overlay"
        aria-label="닫기"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="theme-surface relative z-10 w-[min(360px,calc(100vw-48px))] rounded-2xl border border-line bg-widget p-5 shadow-modal"
      >
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 flex-1 rounded-lg border border-line text-[13px] text-icon transition-colors hover:bg-hover accent-hover"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-cta h-9 flex-1 rounded-lg text-[13px] transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
