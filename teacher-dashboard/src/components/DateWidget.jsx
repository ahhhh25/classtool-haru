import { useEffect, useState } from "react"
import { fontFamilyCss } from "../constants/fonts"
import { dateFitKey, formatDateParts, normalizeDisplayStyle } from "../constants/displayStyles"
import { useFitText } from "../hooks/useFitText"
import { contentColor } from "../theme/displayColor"
import { useTheme } from "../theme/ThemeProvider"

export default function DateWidget({ widget }) {
  const { theme } = useTheme()
  const [now, setNow] = useState(() => new Date())
  const style = normalizeDisplayStyle(widget.displayStyle)
  const parts = formatDateParts(now)
  const { boxRef, textRef, pt } = useFitText(
    dateFitKey(now, style),
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

  const label =
    style === "a"
      ? `${parts.monthPad}. ${parts.dayPad}. (${parts.weekdayKoShort})`
      : style === "c"
        ? `${parts.weekdayEn}, ${parts.monthEn} ${parts.day}`
        : `${parts.month}월 ${parts.day}일 ${parts.weekdayKo}`

  return (
    <div ref={boxRef} className="flex h-full w-full items-center justify-center px-1">
      {style === "d" ? (
        <div
          ref={textRef}
          className="flex flex-col items-center text-center select-none"
          style={{ ...shared, lineHeight: 0.9 }}
        >
          <span>{parts.weekdayKo}</span>
          <span className="mt-[0.18em] tracking-wide" style={{ fontSize: "0.32em", lineHeight: 1.2 }}>
            {parts.month}월 {parts.day}일
          </span>
        </div>
      ) : (
        <p
          ref={textRef}
          className="max-w-full text-center whitespace-nowrap select-none"
          style={{ ...shared, lineHeight: 1.15 }}
        >
          {label}
        </p>
      )}
    </div>
  )
}
