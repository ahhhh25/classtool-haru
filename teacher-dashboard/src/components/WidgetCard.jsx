import { Lock, LockOpen, Maximize2, Minimize2, Plus, Settings, X } from "lucide-react"
import { useState } from "react"
import { fontFamilyCss } from "../constants/fonts"
import { chromeInkOnBackground, widgetBackground } from "../constants/palette"
import { contentColor } from "../theme/displayColor"
import { useTheme } from "../theme/ThemeProvider"
import { isKioskLinked, useKioskLink } from "../utils/kioskLinkStore"
import AnnouncementWidget from "./AnnouncementWidget"
import CheckboardWidget, { CheckboardSettings } from "./CheckboardWidget"
import ClockWidget from "./ClockWidget"
import DateClockSettings from "./DateClockSettings"
import DateWidget from "./DateWidget"
import NoticeWidget, { NoticeSettings } from "./NoticeWidget"
import SettingsModal from "./SettingsModal"
import WidgetSettings from "./WidgetSettings"

const iconBtn =
  "no-drag relative flex size-6 items-center justify-center rounded text-icon transition-colors hover:bg-hover hover:text-ink"

function TitleIcon({ label, className = "", align = "center", ink, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`group ${iconBtn} ${className}`}
      style={ink ? { color: ink } : undefined}
      {...props}
    >
      {children}
      <span
        className={`pointer-events-none absolute top-[calc(100%+4px)] z-20 whitespace-nowrap rounded-md border border-line bg-widget px-1.5 py-0.5 text-[11px] text-ink opacity-0 shadow-widget transition-opacity delay-75 group-hover:opacity-100 ${
          align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
        }`}
      >
        {label}
      </span>
    </button>
  )
}

export default function WidgetCard({
  widget,
  focused = false,
  onToggleFocus,
  onToggleLock,
  onToggleSettings,
  onChangeSettings,
  onClose,
}) {
  const [addItemOpen, setAddItemOpen] = useState(false)
  const { theme } = useTheme()
  const kioskLink = useKioskLink()
  const checkboardLinked = widget.type === "checkboard" && isKioskLinked(kioskLink)
  const transparent = widget.type === "date" || widget.type === "clock"
  const customBg = widget.type === "announcement" ? null : widgetBackground(widget.bgColor, theme)
  const chromeInk = chromeInkOnBackground(customBg)
  const cardStyle = customBg
    ? {
        backgroundColor: customBg,
        "--widget": customBg,
        "--widget-header": customBg,
        "--chrome-ink": chromeInk,
      }
    : undefined

  return (
    <>
      <article
        className={`group/chrome flex h-full flex-col overflow-hidden ${
          transparent
            ? `relative ${customBg ? "rounded-xl" : "bg-transparent"} ${
                focused || widget.locked
                  ? "cursor-default"
                  : "widget-drag-handle cursor-grab active:cursor-grabbing"
              }`
            : "theme-surface rounded-xl border border-line bg-widget shadow-widget"
        }`}
        style={cardStyle}
      >
        <header
          className={`z-10 flex items-center px-1.5 ${
            transparent
              ? `absolute inset-x-0 top-0 h-9 justify-end border-transparent bg-transparent transition-opacity ${
                  widget.settingsOpen ? "opacity-100" : "opacity-20 group-hover/chrome:opacity-100"
                }`
              : "relative h-9 shrink-0 border-b border-line bg-widget-header"
          } ${
            transparent
              ? ""
              : focused
                ? "cursor-default"
                : widget.locked
                  ? "widget-drag-handle cursor-default"
                  : "widget-drag-handle cursor-grab active:cursor-grabbing"
          }`}
        >
          {!transparent && (
            <h2
              className="min-w-0 flex-1 truncate pr-2 pl-1 text-[13px] text-ink-soft select-none"
              style={chromeInk ? { color: chromeInk } : undefined}
            >
              {widget.title}
            </h2>
          )}

          <div className="flex shrink-0 items-center">
            {(widget.type === "checkboard" || widget.type === "announcement") && (
              <TitleIcon
                label="추가"
                ink={chromeInk}
                onClick={() => setAddItemOpen(true)}
              >
                <Plus size={14} strokeWidth={1.5} />
              </TitleIcon>
            )}
            {!transparent && (
              <>
                <TitleIcon
                  label={focused ? "축소" : "확대"}
                  ink={chromeInk}
                  aria-pressed={focused}
                  onClick={onToggleFocus}
                >
                  {focused ? (
                    <Minimize2 size={14} strokeWidth={1.5} />
                  ) : (
                    <Maximize2 size={14} strokeWidth={1.5} />
                  )}
                </TitleIcon>
                <span
                  className="mx-0.5 h-3 w-px bg-line"
                  aria-hidden="true"
                  style={chromeInk ? { backgroundColor: chromeInk, opacity: 0.35 } : undefined}
                />
              </>
            )}
            <TitleIcon
              label={widget.locked ? "잠금 해제" : "잠금"}
              ink={chromeInk}
              className={widget.locked && !chromeInk ? "text-ink" : ""}
              onClick={onToggleLock}
            >
              {widget.locked ? (
                <Lock size={14} strokeWidth={1.5} />
              ) : (
                <LockOpen size={14} strokeWidth={1.5} />
              )}
            </TitleIcon>
            {widget.type !== "announcement" && (
              <TitleIcon
                label="설정"
                ink={chromeInk}
                className={widget.settingsOpen ? (chromeInk ? "bg-active" : "bg-active text-ink") : ""}
                aria-pressed={widget.settingsOpen}
                onClick={onToggleSettings}
              >
                <Settings size={14} strokeWidth={1.5} />
              </TitleIcon>
            )}
            {!focused && (
              <TitleIcon label="닫기" align="right" ink={chromeInk} onClick={onClose}>
                <X size={14} strokeWidth={1.5} />
              </TitleIcon>
            )}
          </div>
        </header>

        <div className={`min-h-0 flex-1 ${transparent ? "absolute inset-0" : ""}`}>
          {widget.type === "notice" ? (
            <NoticeWidget widget={widget} textScale={focused ? 2 : 1} />
          ) : widget.type === "date" ? (
            <DateWidget widget={widget} />
          ) : widget.type === "clock" ? (
            <ClockWidget widget={widget} />
          ) : widget.type === "announcement" ? (
            <AnnouncementWidget
              widget={widget}
              onChange={onChangeSettings}
              addItemOpen={addItemOpen}
              onCloseAddItem={() => setAddItemOpen(false)}
              textScale={focused ? 2 : 1}
            />
          ) : widget.type === "checkboard" ? (
            <CheckboardWidget
              widget={widget}
              onChange={onChangeSettings}
              addItemOpen={addItemOpen}
              onCloseAddItem={() => setAddItemOpen(false)}
              textScale={focused ? 2 : 1}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-5 text-center">
              <p
                style={{
                  fontFamily: fontFamilyCss(widget.fontFamily),
                  fontSize: `${Number(widget.fontSize) * (focused ? 2 : 1)}pt`,
                  fontWeight: widget.bold ? 700 : 400,
                  color: contentColor(widget.textColor, theme),
                  textDecoration: widget.underline ? "underline" : "none",
                  textUnderlineOffset: widget.underline ? "0.16em" : undefined,
                  lineHeight: 1.35,
                }}
              >
                {widget.title}
              </p>
            </div>
          )}
        </div>
      </article>

      {widget.settingsOpen && widget.type !== "announcement" && (
        <SettingsModal
          title={`${widget.title} 설정`}
          onClose={onToggleSettings}
          fit={widget.type === "date" || widget.type === "clock"}
          tall={checkboardLinked}
          headerExtra={
            widget.type === "notice" ? (
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex rounded border border-line p-px">
                  {["auto", "manual"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() =>
                        onChangeSettings({
                          notice: { ...widget.notice, mode },
                        })
                      }
                      className={`h-6 rounded px-2 text-[11px] transition-colors ${
                        widget.notice.mode === mode
                          ? "bg-active text-ink"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {mode === "auto" ? "자동" : "수동"}
                    </button>
                  ))}
                </div>
                <p className="min-w-0 truncate text-[12px] text-muted">
                  {widget.notice.mode === "auto"
                    ? "시간대에 맞춰 공지가 바뀝니다."
                    : "지금 입력한 공지를 계속 보여줍니다."}
                </p>
              </div>
            ) : null
          }
        >
          {widget.type === "notice" ? (
            <NoticeSettings widget={widget} onChange={onChangeSettings} />
          ) : widget.type === "checkboard" ? (
            <CheckboardSettings widget={widget} onChange={onChangeSettings} />
          ) : widget.type === "date" || widget.type === "clock" ? (
            <DateClockSettings widget={widget} onChange={onChangeSettings} />
          ) : (
            <WidgetSettings widget={widget} onChange={onChangeSettings} />
          )}
        </SettingsModal>
      )}
    </>
  )
}
