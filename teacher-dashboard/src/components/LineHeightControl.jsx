import { Minus, Plus } from "lucide-react"
import { formatLineHeight, nudgeLineHeight, parseLineHeight } from "../constants/lineHeights"

export default function LineHeightControl({ value, onChange }) {
  const current = parseLineHeight(value)
  return (
    <div className="flex h-7 items-center rounded-md border border-line bg-sunken">
      <button
        type="button"
        aria-label="줄간격 좁히기"
        onClick={() => onChange(nudgeLineHeight(value, -1))}
        className="flex h-full w-7 items-center justify-center text-icon hover:text-ink"
      >
        <Minus size={12} strokeWidth={1.75} />
      </button>
      <span className="min-w-[2.75rem] text-center text-[12px] tabular-nums text-ink" title="줄간격">
        {formatLineHeight(current)}
      </span>
      <button
        type="button"
        aria-label="줄간격 넓히기"
        onClick={() => onChange(nudgeLineHeight(value, 1))}
        className="flex h-full w-7 items-center justify-center text-icon hover:text-ink"
      >
        <Plus size={12} strokeWidth={1.75} />
      </button>
    </div>
  )
}
