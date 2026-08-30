import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Timer, Watch } from "lucide-react"
import { loadJson, saveJson } from "../../utils/safeStorage"
import { createTimerAudio } from "../../utils/timerAudio"
import { SFX_VOLUME_STEPS, clampSfxVolume, loadSfxVolume, TIMER_PREFS_KEY } from "../../utils/sfxVolume"
import ConfettiBurst from "./ConfettiBurst"

const PRESETS = [
  { seconds: 30, label: "+30초" },
  { seconds: 60, label: "+1분" },
  { seconds: 180, label: "+3분" },
  { seconds: 300, label: "+5분" },
]

const DECREMENTS = [
  { seconds: -30, label: "-30초" },
  { seconds: -60, label: "-1분" },
  { seconds: -180, label: "-3분" },
  { seconds: -300, label: "-5분" },
]

const MODES = [
  { id: "timer", label: "타이머", hint: "카운트다운", icon: Timer },
  { id: "stopwatch", label: "스톱워치", hint: "카운트업", icon: Watch },
]

function pad(value) {
  return String(value).padStart(2, "0")
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

function loadWarnPrefs() {
  const stored = loadJson(TIMER_PREFS_KEY, {}) || {}
  const value = Number(stored.warnSeconds)
  return {
    enabled: stored.warnEnabled === true,
    seconds: !Number.isFinite(value) || value < 0 ? 30 : Math.min(600, Math.round(value)),
  }
}

export default function TimerTool() {
  const [mode, setMode] = useState("timer")
  const [durationMs, setDurationMs] = useState(0)
  const [remainingMs, setRemainingMs] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(true)
  const [warnEnabled, setWarnEnabled] = useState(() => loadWarnPrefs().enabled)
  const [warnSeconds, setWarnSeconds] = useState(() => loadWarnPrefs().seconds)
  const [sfxVolume, setSfxVolume] = useState(() => loadSfxVolume())
  const [immersive, setImmersive] = useState(false)
  const [burstId, setBurstId] = useState(0)
  const [finished, setFinished] = useState(false)

  const audioRef = useRef(null)
  const tensionOnRef = useRef(false)
  const finishedRef = useRef(false)
  const endAtRef = useRef(0)
  const resumeElapsedRef = useRef(0)
  const frameRef = useRef(0)
  const lastAudioAtRef = useRef(0)
  const rootRef = useRef(null)

  const displayMs = mode === "timer" ? remainingMs : elapsedMs
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0
  const lastTen = mode === "timer" && running && !paused && remainingMs > 0 && remainingMs <= 10000
  const lastThree = lastTen && remainingMs <= 3000
  const pulseSecond = lastTen ? Math.ceil(remainingMs / 1000) : 0
  const vignette = lastTen ? 1 - remainingMs / 10000 : 0
  const warnMs = warnEnabled ? Math.max(0, Number(warnSeconds) || 0) * 1000 : 0
  const editLocked = running && !paused
  const totalSeconds = Math.max(0, Math.floor((mode === "timer" ? remainingMs : durationMs) / 1000))
  const minutesValue = Math.floor(totalSeconds / 60)
  const secondsValue = totalSeconds % 60

  useEffect(() => {
    audioRef.current = createTimerAudio()
    return () => {
      cancelAnimationFrame(frameRef.current)
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    saveJson(TIMER_PREFS_KEY, { warnEnabled, warnSeconds, sfxVolume })
    audioRef.current?.setVolume(sfxVolume)
  }, [warnEnabled, warnSeconds, sfxVolume])

  const stopTension = () => {
    tensionOnRef.current = false
    audioRef.current?.stopTension()
  }

  const finishTimer = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    setRunning(false)
    setPaused(true)
    setRemainingMs(0)
    setFinished(true)
    setBurstId(Date.now())
    audioRef.current?.playExplosion()
    window.setTimeout(() => setFinished(false), 1600)
  }

  const syncTension = (leftMs, now) => {
    if (mode !== "timer" || warnMs <= 0 || leftMs <= 0 || leftMs > warnMs) {
      if (tensionOnRef.current) stopTension()
      return
    }
    const progressToZero = 1 - leftMs / warnMs
    if (now - lastAudioAtRef.current < 80 && tensionOnRef.current) {
      audioRef.current?.updateTension(progressToZero, leftMs)
      return
    }
    lastAudioAtRef.current = now
    if (!tensionOnRef.current) {
      tensionOnRef.current = true
      audioRef.current?.startTension(progressToZero, leftMs)
    } else {
      audioRef.current?.updateTension(progressToZero, leftMs)
    }
  }

  useEffect(() => {
    if (!running || paused) {
      cancelAnimationFrame(frameRef.current)
      return undefined
    }
    const tick = () => {
      const now = Date.now()
      if (mode === "timer") {
        const left = Math.max(0, endAtRef.current - now)
        setRemainingMs(left)
        syncTension(left, now)
        if (left <= 0) {
          finishTimer()
          return
        }
      } else {
        setElapsedMs(now - endAtRef.current + resumeElapsedRef.current)
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [running, paused, mode, warnMs])

  useEffect(() => {
    const previous = document.body.style.overflow
    if (immersive) document.body.style.overflow = "hidden"
    const onKey = (event) => {
      if (event.key === "Escape" && immersive) exitImmersive()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [immersive])

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setImmersive(false)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const exitImmersive = () => {
    setImmersive(false)
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }

  const enterImmersive = () => {
    setImmersive(true)
  }

  useEffect(() => {
    if (!immersive) return undefined
    const node = rootRef.current
    node?.requestFullscreen?.().catch(() => {})
    return undefined
  }, [immersive])

  const switchMode = (next) => {
    if (next === mode) return
    cancelAnimationFrame(frameRef.current)
    stopTension()
    finishedRef.current = false
    setMode(next)
    setRunning(false)
    setPaused(true)
    setFinished(false)
    setBurstId(0)
    setElapsedMs(0)
    setRemainingMs(durationMs)
    resumeElapsedRef.current = 0
  }

  const addTime = (seconds) => {
    if (mode !== "timer") return
    const extra = seconds * 1000
    const nextRemaining = Math.max(0, remainingMs + extra)
    const applied = nextRemaining - remainingMs
    if (applied === 0) return
    if (running && !paused) endAtRef.current += applied
    setRemainingMs(nextRemaining)
    setDurationMs((value) => Math.max(nextRemaining, value + applied))
  }

  const applyMinSec = (nextMinutes, nextSeconds) => {
    if (mode !== "timer" || editLocked) return
    const minutes = Math.max(0, Math.min(999, Math.floor(Number(nextMinutes) || 0)))
    const seconds = Math.max(0, Math.min(59, Math.floor(Number(nextSeconds) || 0)))
    const next = (minutes * 60 + seconds) * 1000
    if (running && paused) {
      const delta = next - remainingMs
      setRemainingMs(next)
      setDurationMs((value) => Math.max(value + Math.max(delta, 0), next))
      return
    }
    setDurationMs(next)
    setRemainingMs(next)
  }

  const start = () => {
    if (running && !paused) return
    audioRef.current?.unlock()
    finishedRef.current = false
    setFinished(false)
    if (mode === "timer") {
      const base = running ? remainingMs : durationMs
      if (base <= 0) return
      endAtRef.current = Date.now() + base
      setRemainingMs(base)
    } else if (!running) {
      endAtRef.current = Date.now()
      resumeElapsedRef.current = 0
    } else {
      endAtRef.current = Date.now()
    }
    setPaused(false)
    setRunning(true)
  }

  const pause = () => {
    if (!running || paused) return
    if (mode === "timer") {
      const left = Math.max(0, endAtRef.current - Date.now())
      setRemainingMs(left)
    } else {
      resumeElapsedRef.current = Date.now() - endAtRef.current + resumeElapsedRef.current
      setElapsedMs(resumeElapsedRef.current)
    }
    setPaused(true)
    stopTension()
  }

  const reset = () => {
    cancelAnimationFrame(frameRef.current)
    stopTension()
    finishedRef.current = false
    setRunning(false)
    setPaused(true)
    setFinished(false)
    setBurstId(0)
    setElapsedMs(0)
    setRemainingMs(mode === "timer" ? durationMs : 0)
    resumeElapsedRef.current = 0
  }

  const shell = (
    <div
      ref={rootRef}
      className={`theme-surface relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app ${
        immersive ? "fixed inset-0 z-[70] h-dvh w-dvw" : ""
      }`}
    >
      {finished && <div className="timer-finish-flash pointer-events-none absolute inset-0 z-[15]" />}
      {lastTen && (
        <div
          className={`timer-urgent-vignette pointer-events-none absolute inset-0 z-[5] ${lastThree ? "is-final" : ""}`}
          style={{ "--timer-vignette": vignette }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 z-[25]">
        <ConfettiBurst burstId={burstId} />
      </div>

      <div className="relative z-10 flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="flex gap-1 rounded-lg border border-line bg-sunken p-0.5">
          {MODES.map((item) => {
            const Icon = item.icon
            const active = mode === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchMode(item.id)}
                className={`nav-item flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] ${
                  active ? "is-active" : "text-icon hover:bg-hover"
                }`}
              >
                <Icon size={15} strokeWidth={1.5} className="shrink-0" />
                <span>{item.label}</span>
                <span className={`text-[11px] ${active ? "text-muted" : "text-faint"}`}>({item.hint})</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => (immersive ? exitImmersive() : enterImmersive())}
          className="accent-hover flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] text-icon hover:bg-hover"
        >
          {immersive ? <Minimize2 size={14} strokeWidth={1.5} /> : <Maximize2 size={14} strokeWidth={1.5} />}
          {immersive ? "전체화면 종료" : "전체화면"}
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        <p
          key={lastTen ? pulseSecond : "clock"}
          className={`timer-clock font-semibold tabular-nums text-ink ${
            lastTen ? "text-accent timer-clock-pulse" : ""
          } ${lastThree ? "is-final" : ""}`}
        >
          {formatClock(displayMs)}
        </p>

        {mode === "timer" && (
          <div className="mt-8 w-full max-w-5xl">
            <div className="timer-progress-track h-2 w-full overflow-hidden rounded-full">
              <div
                className={`timer-progress-fill h-full w-full rounded-full ${lastThree ? "is-final" : ""}`}
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 flex-col items-center gap-4 px-5 pb-7">
        {mode === "timer" && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {DECREMENTS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => addTime(item.seconds)}
                    className="accent-hover h-9 rounded-lg border border-line px-3 text-[13px] text-icon hover:bg-hover"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[12px] text-muted">
                분
                <input
                  type="number"
                  min={0}
                  max={999}
                  disabled={editLocked}
                  value={minutesValue}
                  onChange={(event) => applyMinSec(event.target.value, secondsValue)}
                  className="h-9 w-[4.5rem] rounded-lg border border-line bg-sunken text-center text-[15px] text-ink outline-none disabled:opacity-40"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-muted">
                초
                <input
                  type="number"
                  min={0}
                  max={59}
                  disabled={editLocked}
                  value={secondsValue}
                  onChange={(event) => applyMinSec(minutesValue, event.target.value)}
                  className="h-9 w-16 rounded-lg border border-line bg-sunken text-center text-[15px] text-ink outline-none disabled:opacity-40"
                />
              </label>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {PRESETS.map((item) => (
                  <button
                    key={item.seconds}
                    type="button"
                    onClick={() => addTime(item.seconds)}
                    className="accent-hover h-9 rounded-lg border border-line px-3 text-[13px] text-icon hover:bg-hover"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <label className="flex items-center gap-2 text-[12px] text-muted">
                <input
                  type="checkbox"
                  checked={warnEnabled}
                  onChange={(event) => {
                    const on = event.target.checked
                    setWarnEnabled(on)
                    if (!on) {
                      tensionOnRef.current = false
                      audioRef.current?.stopTension()
                    }
                  }}
                />
                종료
                <input
                  type="number"
                  min={0}
                  max={600}
                  disabled={!warnEnabled}
                  value={warnSeconds}
                  onChange={(event) => setWarnSeconds(Math.max(0, Number(event.target.value) || 0))}
                  className="h-8 w-16 rounded-md border border-line bg-sunken text-center text-[13px] text-ink outline-none disabled:opacity-40"
                />
                초 전 알림
              </label>
              <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
              <label className="flex items-center gap-2 text-[12px] text-muted">
                소리 크기
                <select
                  value={sfxVolume}
                  onChange={(event) => setSfxVolume(clampSfxVolume(event.target.value))}
                  className="h-8 rounded-md border border-line bg-sunken px-2 text-[13px] text-ink outline-none"
                >
                  {SFX_VOLUME_STEPS.map((step) => (
                    <option key={step.id} value={step.id}>
                      {step.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={start}
            disabled={
              (mode === "timer" && (running ? remainingMs : durationMs) <= 0) || (running && !paused)
            }
            className="btn-cta flex h-11 min-w-[8.5rem] items-center justify-center gap-1.5 rounded-xl px-6 text-[14px] disabled:opacity-40"
          >
            <Play size={15} strokeWidth={1.5} />
            시작
          </button>
          <button
            type="button"
            onClick={pause}
            disabled={!running || paused}
            className="accent-hover flex h-11 min-w-[8.5rem] items-center justify-center gap-1.5 rounded-xl border border-line px-6 text-[14px] text-icon hover:bg-hover disabled:opacity-40"
          >
            <Pause size={15} strokeWidth={1.5} />
            일시정지
          </button>
          <button
            type="button"
            onClick={reset}
            className="accent-hover flex h-11 min-w-[8.5rem] items-center justify-center gap-1.5 rounded-xl border border-line px-6 text-[14px] text-icon hover:bg-hover"
          >
            <RotateCcw size={15} strokeWidth={1.5} />
            초기화
          </button>
        </div>
      </div>
    </div>
  )

  const frame = (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app p-3">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-widget">
        {shell}
      </div>
    </main>
  )

  if (immersive) return createPortal(shell, document.body)
  return frame
}
