import { fontFamilyCss } from "../constants/fonts"
import { textDecorationCss } from "../utils/editorStyle"
import { contentColor } from "../theme/displayColor"
import { useTheme } from "../theme/ThemeProvider"
import { createDdayState, formatDdayText, formatTargetDate } from "../utils/dday"

function typeStyle({ fontFamily, fontSize, color, bold, underline, strike }) {
  return {
    fontFamily: fontFamilyCss(fontFamily),
    fontSize: `${fontSize}pt`,
    fontWeight: bold ? 700 : 400,
    color,
    textDecoration: textDecorationCss(underline, strike),
    textUnderlineOffset: underline ? "0.16em" : undefined,
  }
}

export default function DdayWidget({ widget, textScale = 1 }) {
  const { theme } = useTheme()
  const dday = createDdayState(widget.dday)

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center select-none">
      <p
        className="max-w-full leading-snug"
        style={typeStyle({
          fontFamily: dday.titleFontFamily,
          fontSize: Number(dday.titleFontSize) * textScale,
          color: contentColor(dday.titleTextColor, theme),
          bold: dday.titleBold,
          underline: dday.titleUnderline,
          strike: dday.titleStrike,
        })}
      >
        {dday.label}
      </p>
      <p
        className="tracking-tight"
        style={{
          ...typeStyle({
            fontFamily: widget.fontFamily,
            fontSize: Number(widget.fontSize) * textScale,
            color: contentColor(widget.textColor, theme),
            bold: widget.bold,
            underline: widget.underline,
            strike: widget.strike,
          }),
          lineHeight: 1.05,
        }}
      >
        {formatDdayText(dday.targetDate)}
      </p>
      <p className="tabular-nums text-muted" style={{ fontSize: `${18 * textScale}px` }}>
        {formatTargetDate(dday.targetDate)}
      </p>
    </div>
  )
}
