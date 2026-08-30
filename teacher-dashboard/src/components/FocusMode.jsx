import { useEffect } from "react"
import { createPortal } from "react-dom"

export default function FocusMode({ onClose, children }) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[45] flex items-center justify-center p-3">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-label="집중 모드 종료"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="위젯 집중 모드"
        className="relative z-10 h-[calc(100svh-24px)] w-[calc(100vw-24px)]"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
