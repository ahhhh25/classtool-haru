import { gainForSfxVolume, loadSfxVolume } from "./sfxVolume"

const C_MAJOR = [261.63, 329.63, 392.0, 523.25]
const G_MAJOR = [392.0, 493.88, 587.33, 783.99]
const F_MAJOR = [349.23, 440.0, 523.25, 698.46]
const CHORDS = [C_MAJOR, G_MAJOR, F_MAJOR, C_MAJOR]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function chordForRemaining(remainingMs) {
  const bar = Math.floor(Math.max(0, remainingMs) / 4000)
  return CHORDS[bar % CHORDS.length]
}

export function createTimerAudio() {
  let ctx = null
  let master = null
  let bgmGain = null
  let schedulerId = null
  let nextBeat = 0
  let seq = 0
  let active = false
  let leftovers = []
  let richness = 0
  let remaining = 0
  let volumeStep = loadSfxVolume()

  const applyMasterGain = () => {
    if (master) master.gain.value = gainForSfxVolume(volumeStep)
  }

  const ensure = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      applyMasterGain()
      master.connect(ctx.destination)
      bgmGain = ctx.createGain()
      bgmGain.gain.value = 0
      bgmGain.connect(master)
    }
    if (ctx.state === "suspended") ctx.resume()
    return ctx
  }

  const track = (node) => {
    leftovers.push(node)
    return node
  }

  const forget = (node) => {
    leftovers = leftovers.filter((item) => item !== node)
  }

  const disconnectSafe = (node) => {
    try {
      node.disconnect()
    } catch {
      /* already disconnected */
    }
  }

  const spawnTone = (freq, type, dest, at, dur, peak) => {
    const osc = track(ctx.createOscillator())
    const gain = track(ctx.createGain())
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(gain)
    gain.connect(dest)
    osc.start(at)
    osc.stop(at + dur + 0.02)
    osc.onended = () => {
      disconnectSafe(osc)
      disconnectSafe(gain)
      forget(osc)
      forget(gain)
    }
  }

  const scheduleTick = (at, amount) => {
    const urgent = amount > 0.66
    const freq = 660 + amount * 220
    spawnTone(freq, "sine", master, at, 0.09, 0.62 + amount * 0.2)
    if (urgent) {
      spawnTone(freq + 8, "sine", master, at + 0.11, 0.07, 0.5 + amount * 0.16)
    }
  }

  const schedulePulse = (at, amount) => {
    spawnTone(98, "sine", bgmGain, at, 0.18, 0.42 + amount * 0.16)
    spawnTone(147, "triangle", bgmGain, at, 0.12, 0.2 + amount * 0.1)
  }

  const scheduleBgm = (at, remainingMs, amount) => {
    const chord = chordForRemaining(remainingMs)
    const steps = amount > 0.6 ? 8 : amount > 0.3 ? 6 : 4
    const pattern = [0, 2, 3, 1, 2, 3, 0, 2]
    for (let i = 0; i < steps; i += 1) {
      const freq = chord[pattern[i] % chord.length]
      const when = at + i * 0.125
      spawnTone(freq, "triangle", bgmGain, when, 0.09, 0.2 + amount * 0.12)
      if (amount > 0.35) {
        spawnTone(freq * 2, "sine", bgmGain, when, 0.07, 0.08 + amount * 0.06)
      }
    }
  }

  const applyPulseLevel = () => {
    if (!ctx || !bgmGain) return
    bgmGain.gain.setTargetAtTime(0.85 + richness * 0.15, ctx.currentTime, 0.08)
  }

  const scheduler = (token) => {
    if (!active || token !== seq || !ctx) return
    const horizon = ctx.currentTime + 0.18
    while (nextBeat < horizon) {
      if (nextBeat >= ctx.currentTime - 0.02) {
        scheduleTick(nextBeat, richness)
        schedulePulse(nextBeat, richness)
        scheduleBgm(nextBeat, remaining, richness)
      }
      nextBeat += 1
    }
  }

  const startClock = () => {
    const token = seq
    window.clearInterval(schedulerId)
    scheduler(token)
    schedulerId = window.setInterval(() => scheduler(token), 40)
  }

  return {
    unlock() {
      ensure()
    },
    setVolume(step) {
      volumeStep = step
      applyMasterGain()
    },
    startTension(progress, remainingMs) {
      ensure()
      seq += 1
      active = true
      richness = clamp(progress, 0, 1)
      remaining = remainingMs
      const wait = remainingMs % 1000 === 0 ? 1 : (remainingMs % 1000) / 1000
      nextBeat = ctx.currentTime + wait
      applyPulseLevel()
      startClock()
    },
    updateTension(progress, remainingMs) {
      if (!active || !ctx) return
      richness = clamp(progress, 0, 1)
      remaining = remainingMs
      applyPulseLevel()
    },
    stopTension() {
      active = false
      seq += 1
      window.clearInterval(schedulerId)
      schedulerId = null
      if (!ctx) return
      const t = ctx.currentTime
      bgmGain?.gain.cancelScheduledValues(t)
      bgmGain?.gain.setTargetAtTime(0.0001, t, 0.03)
      for (const node of leftovers) {
        try {
          if (node.stop) node.stop(t)
        } catch {
          /* ignore */
        }
        disconnectSafe(node)
      }
      leftovers = []
    },
    playExplosion() {
      this.stopTension()
      ensure()
      const t = ctx.currentTime
      const endBus = ctx.createGain()
      endBus.gain.value = 2.1
      endBus.connect(master)

      const makeNoise = (seconds, decay) => {
        const frames = Math.floor(ctx.sampleRate * seconds)
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < frames; i += 1) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-((i / ctx.sampleRate) * decay))
        }
        const src = ctx.createBufferSource()
        src.buffer = buffer
        return src
      }

      const crack = makeNoise(0.18, 28)
      const crackFilter = ctx.createBiquadFilter()
      crackFilter.type = "highpass"
      crackFilter.frequency.setValueAtTime(1800, t)
      crackFilter.frequency.exponentialRampToValueAtTime(400, t + 0.12)
      const crackGain = ctx.createGain()
      crackGain.gain.setValueAtTime(1.1, t)
      crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      crack.connect(crackFilter)
      crackFilter.connect(crackGain)
      crackGain.connect(endBus)

      const body = makeNoise(1.15, 3.4)
      const bodyFilter = ctx.createBiquadFilter()
      bodyFilter.type = "lowpass"
      bodyFilter.Q.value = 0.8
      bodyFilter.frequency.setValueAtTime(900, t)
      bodyFilter.frequency.exponentialRampToValueAtTime(55, t + 0.7)
      const bodyGain = ctx.createGain()
      bodyGain.gain.setValueAtTime(1.15, t)
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.05)
      body.connect(bodyFilter)
      bodyFilter.connect(bodyGain)
      bodyGain.connect(endBus)

      const sub = ctx.createOscillator()
      const subGain = ctx.createGain()
      sub.type = "sine"
      sub.frequency.setValueAtTime(72, t)
      sub.frequency.exponentialRampToValueAtTime(22, t + 0.85)
      subGain.gain.setValueAtTime(0.0001, t)
      subGain.gain.exponentialRampToValueAtTime(1.2, t + 0.012)
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.15)
      sub.connect(subGain)
      subGain.connect(endBus)

      const thump = ctx.createOscillator()
      const thumpGain = ctx.createGain()
      thump.type = "triangle"
      thump.frequency.setValueAtTime(140, t)
      thump.frequency.exponentialRampToValueAtTime(36, t + 0.32)
      thumpGain.gain.setValueAtTime(0.95, t)
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
      thump.connect(thumpGain)
      thumpGain.connect(endBus)

      crack.start(t)
      crack.stop(t + 0.18)
      body.start(t)
      body.stop(t + 1.15)
      sub.start(t)
      sub.stop(t + 1.2)
      thump.start(t)
      thump.stop(t + 0.4)

      const cleanup = (...nodes) => {
        for (const node of nodes) disconnectSafe(node)
      }
      crack.onended = () => cleanup(crack, crackFilter, crackGain)
      body.onended = () => cleanup(body, bodyFilter, bodyGain, endBus)
      sub.onended = () => cleanup(sub, subGain)
      thump.onended = () => cleanup(thump, thumpGain)
    },
    dispose() {
      this.stopTension()
      window.clearInterval(schedulerId)
      if (ctx) {
        ctx.close().catch(() => {})
        ctx = null
      }
      master = null
      bgmGain = null
    },
  }
}
