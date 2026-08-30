import { useEffect, useState } from "react"

const COLORS = ["#E8B423", "#FF6F61", "#00A9CE", "#9B5DE5", "#E87A32", "#FFFFFF"]

export default function ConfettiBurst({ burstId }) {
  const [pieces, setPieces] = useState([])

  useEffect(() => {
    if (!burstId) return
    const next = Array.from({ length: 80 }, (_, i) => ({
      id: `${burstId}-${i}`,
      left: Math.random() * 100,
      width: Math.random() * 8 + 6,
      height: Math.random() * 12 + 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() > 0.5,
      duration: Math.random() * 2 + 1.5,
    }))
    setPieces(next)
    const timer = setTimeout(() => setPieces([]), 3600)
    return () => clearTimeout(timer)
  }, [burstId])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="tool-confetti"
          style={{
            left: `${piece.left}%`,
            top: "-10px",
            width: piece.width,
            height: piece.height,
            backgroundColor: piece.color,
            borderRadius: piece.round ? "50%" : 2,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
    </div>
  )
}
