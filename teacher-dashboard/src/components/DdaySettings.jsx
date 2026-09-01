import { useState } from "react"
import { applyDdayTitlePatch, createDdayState, ddayTitleAsWidget } from "../utils/dday"
import WidgetSettings from "./WidgetSettings"

const sectionLabel = "px-4 pt-3 text-[11px] tracking-wide text-muted uppercase"

export default function DdaySettings({ widget, onChange, onClose }) {
  const current = createDdayState(widget.dday)
  const [label, setLabel] = useState(current.label)
  const [targetDate, setTargetDate] = useState(current.targetDate)

  const save = () => {
    onChange({ dday: createDdayState({ ...widget.dday, label, targetDate }) })
    onClose()
  }

  return (
    <div>
      <p className={sectionLabel}>제목 글자</p>
      <WidgetSettings
        widget={ddayTitleAsWidget(current)}
        onChange={(patch) => onChange({ dday: applyDdayTitlePatch(widget.dday, patch) })}
        compact
        fields={["size", "font", "style", "color"]}
      />
      <div className="border-t border-line">
        <p className={sectionLabel}>디데이 글자</p>
        <WidgetSettings widget={widget} onChange={onChange} compact />
      </div>
      <div className="space-y-3 border-t border-line px-4 py-4">
        <label className="block">
          <span className="mb-1.5 block text-[11px] tracking-wide text-muted uppercase">일정 제목</span>
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="여름방학까지"
            className="h-10 w-full rounded-md border border-line bg-sunken px-3 text-[14px] text-ink outline-none focus:border-line-strong"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] tracking-wide text-muted uppercase">목표 날짜</span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            className="h-10 w-full rounded-md border border-line bg-sunken px-3 text-[14px] text-ink outline-none focus:border-line-strong"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-line px-4 text-[13px] text-icon hover:bg-hover hover:text-ink"
          >
            취소
          </button>
          <button type="button" onClick={save} className="btn-cta h-9 rounded-md px-4 text-[13px]">
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
