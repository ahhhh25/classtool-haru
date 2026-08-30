import { CLOCK_STYLES, DATE_STYLES, normalizeDisplayStyle } from "../constants/displayStyles"
import WidgetSettings from "./WidgetSettings"

export default function DateClockSettings({ widget, onChange }) {
  const styles = widget.type === "clock" ? CLOCK_STYLES : DATE_STYLES
  const selected = normalizeDisplayStyle(widget.displayStyle)

  return (
    <div>
      <WidgetSettings widget={widget} onChange={onChange} compact />
      <div className="border-t border-line px-4 py-3">
        <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">표시 스타일</p>
        <div className="grid grid-cols-2 gap-1.5">
          {styles.map((style) => {
            const active = selected === style.id
            return (
              <button
                key={style.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ displayStyle: style.id })}
                className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  active
                    ? "border-line-strong bg-active text-ink"
                    : "border-line text-icon hover:bg-hover hover:text-ink"
                }`}
              >
                <span className="block text-[11px] text-muted">{style.label}</span>
                <span className="mt-0.5 block text-[13px] text-ink">{style.sample}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
