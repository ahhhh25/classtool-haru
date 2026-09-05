import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  BG_PALETTE,
  DEFAULT_BG_COLOR,
  DEFAULT_TEXT_COLOR,
  TEXT_PALETTE,
  bgSwatchFill,
  swatchFill,
} from "../constants/palette"
import { useTheme } from "../theme/ThemeProvider"
import { DRAW_COLORS } from "../utils/notepadDrawing"
import { hexForColorInput, hexToRgb, parseHexColor, rgbToHex, sameHex } from "../utils/hexColor"
import { loadRecentColors, rememberRecentColor } from "../utils/recentColors"

const PRESET_TEXT_HEXES = new Set(TEXT_PALETTE.map((item) => item.hex.toUpperCase()))

function swatchClass(selected, compact) {
  const size = compact ? "size-3.5" : "size-5"
  return `${size} relative shrink-0 rounded-full border transition-transform ${
    selected ? "scale-125 border-2 border-white" : "border-line hover:border-line-strong"
  }`
}

function defaultDraft(kind, value) {
  if (kind === "bg") {
    const swatch = BG_PALETTE.find((item) => item.id === value)
    if (swatch?.hex) return swatch.hex
    return parseHexColor(value) || "#3B5674"
  }
  return parseHexColor(value) || DEFAULT_TEXT_COLOR
}

function isPresetValue(kind, value) {
  if (kind === "bg") return BG_PALETTE.some((item) => item.id === value)
  if (kind === "draw") return DRAW_COLORS.some((hex) => sameHex(hex, value))
  return PRESET_TEXT_HEXES.has(String(value || "").toUpperCase())
}

function ColorPickerPopover({ anchorEl, kind, value, recents, onPickRecent, onPreview, onApply, onClose }) {
  const initial = defaultDraft(kind, value)
  const [hexDraft, setHexDraft] = useState(initial)
  const [rgbDraft, setRgbDraft] = useState(() => hexToRgb(initial) ?? { r: 255, g: 255, b: 255 })
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const panelRef = useRef(null)
  const dirtyRef = useRef(false)
  const hexDraftRef = useRef(hexDraft)
  const onPreviewRef = useRef(onPreview)
  const onApplyRef = useRef(onApply)
  const onCloseRef = useRef(onClose)
  hexDraftRef.current = hexDraft
  onPreviewRef.current = onPreview
  onApplyRef.current = onApply
  onCloseRef.current = onClose

  const setFromHex = (hex, preview = false) => {
    const parsed = parseHexColor(hex)
    if (!parsed) return
    setHexDraft(parsed)
    setRgbDraft(hexToRgb(parsed) ?? rgbDraft)
    if (preview) {
      dirtyRef.current = true
      onPreviewRef.current(parsed)
    }
  }

  useLayoutEffect(() => {
    const place = () => {
      if (!anchorEl || !panelRef.current) return
      const rect = anchorEl.getBoundingClientRect()
      const panel = panelRef.current.getBoundingClientRect()
      const gap = 6
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - panel.width - 8)
      const below = rect.bottom + gap
      const top =
        below + panel.height > window.innerHeight - 8
          ? Math.max(8, rect.top - panel.height - gap)
          : below
      setPos({ top, left })
    }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [anchorEl])

  useEffect(() => {
    const finish = (save) => {
      if (save && dirtyRef.current) {
        const hex = parseHexColor(hexDraftRef.current)
        if (hex) onApplyRef.current(hex, false)
      }
      onCloseRef.current()
    }
    const onKey = (event) => {
      if (event.key === "Escape") finish(true)
    }
    const onPointer = (event) => {
      if (panelRef.current?.contains(event.target)) return
      if (anchorEl?.contains(event.target)) return
      finish(true)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onPointer)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onPointer)
    }
  }, [anchorEl])

  const applyHex = (hex) => {
    const parsed = parseHexColor(hex)
    if (!parsed) return
    dirtyRef.current = false
    onApplyRef.current(parsed, true)
  }

  const applyRgb = () => {
    const hex = rgbToHex(rgbDraft.r, rgbDraft.g, rgbDraft.b)
    if (hex) applyHex(hex)
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="사용자 지정 색상"
      className="theme-surface fixed z-[80] w-[220px] rounded-xl border border-line bg-widget p-3 shadow-modal"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="색상 선택"
          value={hexForColorInput(hexDraft)}
          onChange={(event) => {
            setFromHex(event.target.value, true)
          }}
          className="size-7 shrink-0 cursor-pointer rounded-md border border-line bg-sunken p-0"
        />
        <label className="min-w-0 flex-1 text-[10px] tracking-wide text-muted uppercase">
          HEX
          <input
            value={hexDraft}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value.toUpperCase()
              setHexDraft(next.startsWith("#") ? next : `#${next}`)
              const parsed = parseHexColor(event.target.value)
              if (parsed) {
                setRgbDraft(hexToRgb(parsed) ?? rgbDraft)
                dirtyRef.current = true
                onPreviewRef.current(parsed)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyHex(hexDraft)
            }}
            className="mt-1 h-7 w-full rounded-md border border-line bg-sunken px-2 font-mono text-[12px] tracking-normal text-ink outline-none focus:border-line-strong"
          />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {["r", "g", "b"].map((channel) => (
          <label key={channel} className="text-[10px] tracking-wide text-muted uppercase">
            {channel}
            <input
              type="number"
              min={0}
              max={255}
              value={rgbDraft[channel]}
              onChange={(event) => {
                const next = { ...rgbDraft, [channel]: event.target.value }
                setRgbDraft(next)
                const hex = rgbToHex(next.r, next.g, next.b)
                if (hex) {
                  setHexDraft(hex)
                  dirtyRef.current = true
                  onPreviewRef.current(hex)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyRgb()
              }}
              className="mt-1 h-7 w-full rounded-md border border-line bg-sunken px-1.5 text-center text-[12px] text-ink outline-none focus:border-line-strong"
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={() => applyHex(parseHexColor(hexDraft) || rgbToHex(rgbDraft.r, rgbDraft.g, rgbDraft.b))}
        className="mt-2 h-7 w-full rounded-md border border-line text-[12px] text-ink transition-colors hover:bg-hover"
      >
        적용
      </button>
      {recents.length > 0 && (
        <div className="mt-2.5 border-t border-line pt-2">
          <p className="mb-1.5 text-[10px] tracking-wide text-muted uppercase">최근 사용</p>
          <div className="flex flex-wrap gap-1">
            {recents.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`최근 색상 ${hex}`}
                onClick={() => onPickRecent(hex)}
                className={swatchClass(sameHex(value, hex), true)}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

export default function ColorSwatches({ kind, value, onChange, compact = false }) {
  const { theme } = useTheme()
  const [recents, setRecents] = useState(() => loadRecentColors(kind))
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const matchesRecent = (hex) =>
    sameHex(value, hex) || (kind === "bg" && sameHex(defaultDraft("bg", value), hex))
  const customSelected = !isPresetValue(kind, value) && !recents.some(matchesRecent)

  const previewCustom = (hex) => {
    onChange(hex)
  }

  const commitCustom = (hex, close = true) => {
    onChange(hex)
    setRecents(rememberRecentColor(kind, hex))
    if (close) setOpen(false)
  }

  const pickRecent = (hex) => {
    onChange(hex)
    setRecents(rememberRecentColor(kind, hex))
  }

  const presets =
    kind === "draw"
      ? DRAW_COLORS.map((hex) => ({
          key: hex,
          selected: sameHex(value, hex),
          label: hex,
          style: { backgroundColor: hex },
          onPick: () => onChange(hex),
        }))
    : kind === "text"
      ? TEXT_PALETTE.map((item) => ({
          key: item.id,
          selected: sameHex(value, item.hex),
          label: swatchFill(item, theme),
          style: { backgroundColor: swatchFill(item, theme) },
          onPick: () => onChange(item.hex),
        }))
      : BG_PALETTE.map((item) => {
          const current = value || DEFAULT_BG_COLOR
          const selected = current === item.id || (item.hex ? sameHex(current, item.hex) : false)
          return {
            key: item.id,
            selected,
            label: item.label || item.id,
            style:
              item.id === DEFAULT_BG_COLOR
                ? {
                    backgroundImage:
                      "linear-gradient(135deg, transparent 49%, var(--line-strong) 49%, var(--line-strong) 51%, transparent 51%)",
                    backgroundColor: "var(--widget)",
                  }
                : { backgroundColor: bgSwatchFill(item, theme) },
            onPick: () => onChange(item.id),
          }
        })

  return (
    <div className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
      <div className={`flex flex-wrap items-center gap-1 ${compact ? "min-h-7" : "min-h-9"}`}>
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            aria-label={preset.label}
            aria-pressed={preset.selected}
            onMouseDown={(event) => event.preventDefault()}
            onClick={preset.onPick}
            className={swatchClass(preset.selected, compact)}
            style={preset.style}
          />
        ))}
        <span className="mx-0.5 h-3 w-px shrink-0 bg-line" aria-hidden="true" />
        <button
          ref={triggerRef}
          type="button"
          aria-label="사용자 지정 색상"
          aria-expanded={open}
          aria-pressed={customSelected}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
          className={swatchClass(customSelected, compact)}
          style={{
            background:
              "conic-gradient(#E24B4A, #E8B423, #3BB36A, #00A9CE, #9B5DE5, #E24B4A)",
          }}
        />
      </div>
      {recents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {recents.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={`최근 색상 ${hex}`}
              aria-pressed={matchesRecent(hex)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickRecent(hex)}
              className={swatchClass(matchesRecent(hex), compact)}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      )}
      {open && triggerRef.current && (
        <ColorPickerPopover
          anchorEl={triggerRef.current}
          kind={kind}
          value={value}
          recents={recents}
          onPickRecent={(hex) => {
            pickRecent(hex)
            setOpen(false)
          }}
          onPreview={previewCustom}
          onApply={commitCustom}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
