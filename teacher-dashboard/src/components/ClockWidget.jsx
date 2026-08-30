import { useEffect, useState } from "react"
import { fontFamilyCss } from "../constants/fonts"
import { clockFitKey, formatClockParts, normalizeDisplayStyle } from "../constants/displayStyles"
import { useFitText } from "../hooks/useFitText"
import { contentColor } from "../theme/displayColor"
import { useTheme } from "../theme/ThemeProvider"

export default function ClockWidget({ widget }) {
  const { theme } = useTheme()
  const [now, setNow] = useState(() => new Date())
  const style = normalizeDisplayStyle(widget.displayStyle)
  const parts = formatClockParts(now)
  const { boxRef, textRef, pt } = useFitText(
    clockFitKey(now, style),
    widget.fontSize,
    `${style}-${widget.fontFamily}-${widget.bold}-${theme}`,
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const color = contentColor(widget.textColor, theme)
  const shared = {
    fontFamily: fontFamilyCss(widget.fontFamily),
    fontSize: `${pt}pt`,
    fontWeight: widget.bold ? 700 : 400,
    color,
    textDecoration: widget.underline ? "underline" : "none",
    textUnderlineOffset: widget.underline ? "0.16em" : undefined,
  }

  return (
    <div ref={boxRef} className="flex h-full w-full items-center justify-center px-1">
      {style === "c" ? (
        <div
          ref={textRef}
          className="flex flex-col items-center select-none"
          style={{ ...shared, lineHeight: 0.82, letterSpacing: "0.02em" }}
        >
          <span className="tabular-nums">{parts.hours24}</span>
          <span className="tabular-nums">{parts.minutes}</span>
        </div>
      ) : style === "d" ? (
        <div ref={textRef} className="relative inline-block select-none" style={shared}>
          <span className="tabular-nums tracking-wide">
            {parts.hours24}:{parts.minutes}
          </span>
          <span
            className="absolute bottom-[0.08em] left-full ml-[0.18em] tabular-nums"
            style={{ fontSize: "0.34em", lineHeight: 1, letterSpacing: "0.04em" }}
          >
            {parts.seconds}
          </span>
        </div>
      ) : (
        <p
          ref={textRef}
          className="max-w-full text-center tabular-nums whitespace-nowrap select-none"
          style={{ ...shared, lineHeight: 1.1, letterSpacing: style === "b" ? "0.06em" : "0.04em" }}
        >
          {style === "b"
            ? `${parts.period} ${parts.hours12}:${parts.minutes}`
            : `${parts.hours24}:${parts.minutes}:${parts.seconds}`}
        </p>
      )}
    </div>
  )
}
