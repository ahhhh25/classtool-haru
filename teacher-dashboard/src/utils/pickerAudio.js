import { gainForSfxVolume, loadSfxVolume } from "./sfxVolume"
import { isHaruReceiver } from "./syncChannel"

const SILENT_PICKER_AUDIO = {
  unlock() {},
  playTick() {},
  playReveal() {},
  dispose() {},
}

function ensureContext(state) {
  if (!state.ctx) {
    state.ctx = new (window.AudioContext || window.webkitAudioContext)()
    state.master = state.ctx.createGain()
    state.master.connect(state.ctx.destination)
  }
  if (state.master) state.master.gain.value = gainForSfxVolume(loadSfxVolume())
  if (state.ctx.state === "suspended") state.ctx.resume()
  return state.ctx
}

function tone(ctx, dest, freq, type, at, dur, peak) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(at)
  osc.stop(at + dur + 0.02)
  osc.onended = () => {
    try {
      osc.disconnect()
      gain.disconnect()
    } catch {
      /* already disconnected */
    }
  }
}

export function createPickerAudio() {
  if (isHaruReceiver()) return SILENT_PICKER_AUDIO
  const state = { ctx: null, master: null }

  return {
    unlock() {
      ensureContext(state)
    },
    playTick(progress = 0) {
      const ctx = ensureContext(state)
      const t = ctx.currentTime
      const lift = Math.min(1, Math.max(0, progress))
      tone(ctx, state.master, 620 + lift * 260, "square", t, 0.055, 0.28 + lift * 0.1)
    },
    playReveal() {
      const ctx = ensureContext(state)
      const t = ctx.currentTime
      const dest = state.master

      const hit = (freq, when, dur, peak) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = "sine"
        osc.frequency.setValueAtTime(freq, when)
        osc.frequency.exponentialRampToValueAtTime(Math.max(32, freq * 0.35), when + dur)
        gain.gain.setValueAtTime(0.0001, when)
        gain.gain.exponentialRampToValueAtTime(peak, when + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.0001, when + dur)
        osc.connect(gain)
        gain.connect(dest)
        osc.start(when)
        osc.stop(when + dur + 0.03)
        osc.onended = () => {
          try {
            osc.disconnect()
            gain.disconnect()
          } catch {
            /* already disconnected */
          }
        }
      }

      const sparkle = (when, peak) => {
        const frames = Math.floor(ctx.sampleRate * 0.18)
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < frames; i += 1) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-(i / ctx.sampleRate) * 22)
        }
        const src = ctx.createBufferSource()
        src.buffer = buffer
        const filter = ctx.createBiquadFilter()
        filter.type = "highpass"
        filter.frequency.setValueAtTime(2400, when)
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(peak, when)
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16)
        src.connect(filter)
        filter.connect(gain)
        gain.connect(dest)
        src.start(when)
        src.stop(when + 0.18)
        src.onended = () => {
          try {
            src.disconnect()
            filter.disconnect()
            gain.disconnect()
          } catch {
            /* already disconnected */
          }
        }
      }

      hit(160, t, 0.36, 0.9)
      hit(92, t + 0.02, 0.42, 0.7)
      sparkle(t, 0.42)
      sparkle(t + 0.28, 0.28)
      sparkle(t + 0.62, 0.34)

      const rise = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5]
      rise.forEach((freq, i) => {
        tone(ctx, dest, freq, i % 2 === 0 ? "sawtooth" : "square", t + i * 0.055, 0.2, 0.26)
        tone(ctx, dest, freq * 2, "triangle", t + 0.08 + i * 0.055, 0.16, 0.12)
      })

      const flourish = [523.25, 659.25, 783.99, 1046.5, 1318.5]
      flourish.forEach((freq, i) => {
        tone(ctx, dest, freq, "triangle", t + 0.42 + i * 0.05, 0.28, 0.2)
      })
    },
    dispose() {
      if (state.ctx) {
        state.ctx.close().catch(() => {})
        state.ctx = null
        state.master = null
      }
    },
  }
}
