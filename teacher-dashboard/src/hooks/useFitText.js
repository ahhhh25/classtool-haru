import { useLayoutEffect, useRef, useState } from "react"

export function useFitText(text, basePt, extraKey = "") {
  const boxRef = useRef(null)
  const textRef = useRef(null)
  const [pt, setPt] = useState(Number(basePt) || 16)

  useLayoutEffect(() => {
    const box = boxRef.current
    const el = textRef.current
    if (!box || !el) return

    const measure = () => {
      const availW = Math.max(4, box.clientWidth - 4)
      const availH = Math.max(4, box.clientHeight - 4)
      let low = 8
      let high = 480
      for (let i = 0; i < 16; i += 1) {
        const mid = (low + high) / 2
        el.style.fontSize = `${mid}pt`
        if (el.scrollWidth <= availW && el.scrollHeight <= availH) low = mid
        else high = mid
      }
      setPt(Math.max(8, low))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [text, basePt, extraKey])

  return { boxRef, textRef, pt }
}
