import { Bold, Underline } from "lucide-react"
import { FONT_OPTIONS, FONT_SIZE_PRESETS } from "../constants/fonts"
import { TEXT_PALETTE, swatchFill } from "../constants/palette"
import { useTheme } from "../theme/ThemeProvider"

const fieldLabel = "mb-1.5 block text-[11px] tracking-wide text-muted uppercase"

export default function WidgetSettings({
  widget,
  onChange,
  compact = false,
  bare = false,
  inline = false,
  endSlot = null,
  fields = null,
}) {
  const { theme } = useTheme()
  const controlHeight = bare ? "h-7" : "h-9"
  const control =
    `${controlHeight} rounded-md border border-line bg-sunken px-1.5 text-ink outline-none focus:border-line-strong ` +
    (bare ? "text-[12px]" : "px-2 text-[13px]")
  const iconButton = bare ? "size-7" : "size-9"
  const iconSize = bare ? 13 : 15
  const swatch = bare ? "size-3.5" : "size-5"

  const sizeSelect = (
    <select
      aria-label="글자 크기"
      value={widget.fontSize}
      onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
      className={`${control} w-[76px]`}
    >
      {!FONT_SIZE_PRESETS.includes(widget.fontSize) && (
        <option value={widget.fontSize}>{widget.fontSize} pt</option>
      )}
      {FONT_SIZE_PRESETS.map((size) => (
        <option key={size} value={size}>
          {size} pt
        </option>
      ))}
    </select>
  )

  const fontSelect = (
    <select
      aria-label="폰트"
      value={widget.fontFamily}
      onChange={(event) => onChange({ fontFamily: event.target.value })}
      className={`${control} min-w-[8.5rem]`}
    >
      {FONT_OPTIONS.map((font) => (
        <option key={font.id} value={font.id} style={{ fontFamily: font.cssFamily }}>
          {font.label}
        </option>
      ))}
    </select>
  )

  const styleButtons = (
    <div className="flex gap-0.5">
      <button
        type="button"
        aria-pressed={widget.bold}
        aria-label="진하게"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChange({ bold: !widget.bold })}
        className={`flex ${iconButton} items-center justify-center rounded-md border transition-colors ${
          widget.bold
            ? "border-line-strong bg-active text-ink"
            : "border-line text-icon hover:bg-hover"
        }`}
      >
        <Bold size={iconSize} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-pressed={widget.underline}
        aria-label="밑줄"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChange({ underline: !widget.underline })}
        className={`flex ${iconButton} items-center justify-center rounded-md border transition-colors ${
          widget.underline
            ? "border-line-strong bg-active text-ink"
            : "border-line text-icon hover:bg-hover"
        }`}
      >
        <Underline size={iconSize} strokeWidth={1.5} />
      </button>
    </div>
  )

  const colorSwatches = (
    <div className={`flex items-center gap-1 ${bare ? "h-7" : "h-9"}`}>
      {TEXT_PALETTE.map((swatchItem) => {
        const selected = widget.textColor === swatchItem.hex
        return (
          <button
            key={swatchItem.id}
            type="button"
            aria-label={swatchFill(swatchItem, theme)}
            aria-pressed={selected}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange({ textColor: swatchItem.hex })}
            className={`${swatch} shrink-0 rounded-full border transition-transform ${
              selected ? "scale-110 border-ink" : "border-line hover:border-line-strong"
            }`}
            style={{ backgroundColor: swatchFill(swatchItem, theme) }}
          />
        )
      })}
    </div>
  )

  const show = (name) => !fields || fields.includes(name)

  if (bare) {
    return (
      <div className={`no-drag ${inline ? "" : compact ? "px-4 py-2.5" : "p-4"}`}>
        <div className="flex items-start gap-2">
          {show("size") && sizeSelect}
          {show("font") && fontSelect}
          {show("style") && styleButtons}
          {show("color") && colorSwatches}
          {endSlot}
        </div>
      </div>
    )
  }

  return (
    <div className={`no-drag p-4 ${compact ? "" : "h-full overflow-y-auto"}`}>
      <div className="flex flex-nowrap items-end gap-3">
        <label className="shrink-0">
          <span className={fieldLabel}>글자 크기</span>
          {sizeSelect}
        </label>
        <label className="shrink-0">
          <span className={fieldLabel}>폰트</span>
          {fontSelect}
        </label>
        <div className="shrink-0">
          <span className={fieldLabel}>글자 스타일</span>
          {styleButtons}
        </div>
        <div className="shrink-0">
          <span className={fieldLabel}>글자색</span>
          {colorSwatches}
        </div>
      </div>
    </div>
  )
}
