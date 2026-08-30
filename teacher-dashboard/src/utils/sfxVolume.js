import { loadJson } from "./safeStorage"

export const SFX_MASTER_GAIN = 1.25
export const TIMER_PREFS_KEY = "edu_timer_prefs_v1"

export const SFX_VOLUME_STEPS = [
  { id: 1, label: "아주 작게", gain: 0.4 },
  { id: 2, label: "작게", gain: 0.65 },
  { id: 3, label: "보통", gain: 1 },
  { id: 4, label: "크게", gain: 1.45 },
  { id: 5, label: "아주 크게", gain: 2 },
]

export function clampSfxVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, Math.round(n)))
}

export function loadSfxVolume() {
  const stored = loadJson(TIMER_PREFS_KEY, {}) || {}
  return clampSfxVolume(stored.sfxVolume)
}

export function gainForSfxVolume(step) {
  const level = SFX_VOLUME_STEPS.find((item) => item.id === clampSfxVolume(step))
  return SFX_MASTER_GAIN * (level?.gain ?? 1)
}
