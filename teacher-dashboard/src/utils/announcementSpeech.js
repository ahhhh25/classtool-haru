import {
  isHaruReceiver,
  persistAnnouncementSpeechStatus,
  subscribeSync,
  SYNC,
} from "./syncChannel"

const SETTINGS_KEY = "classtool-announcement-speech"
const RATE = { slow: 0.8, normal: 1, fast: 1.2 }
export const SPEECH_EXPAND_MS = 5000

const statusListeners = new Set()
const catalogListeners = new Set()
const recentCmds = []
let bridgeBound = false
let unlocked = typeof window !== "undefined" ? !isHaruReceiver() : false
let speaking = { widgetId: null, itemId: null, requestId: null }
let blockedRequest = false
let utterance = null
let pendingLocked = null
let speakTimer = 0
let playGen = 0
let expandUntil = 0
let previewUtterance = null
let appliedVoice = ""
let requestedVoice = ""
let voiceError = ""
let receiverVoiceCatalog = null
const previewListeners = new Set()
const queue = []

function emitPreview(active) {
  previewListeners.forEach((fn) => {
    try {
      fn(active)
    } catch {
      /* ignore */
    }
  })
}

export function subscribeAnnouncementPreview(fn) {
  previewListeners.add(fn)
  fn(Boolean(previewUtterance))
  return () => previewListeners.delete(fn)
}

function emitStatus(extra = {}) {
  const snapshot = getAnnouncementSpeechStatus()
  statusListeners.forEach((fn) => {
    try {
      fn({ ...snapshot, ...extra })
    } catch {
      /* ignore */
    }
  })
}

function publishSpeechStatus(extra = {}) {
  emitStatus(extra)
  if (isHaruReceiver()) return
  persistAnnouncementSpeechStatus({
    unlocked,
    blocked: blockedRequest,
    widgetId: speaking.widgetId,
    itemId: speaking.itemId,
    requestId: speaking.requestId,
    expandUntil,
    appliedVoice,
    requestedVoice,
    error: voiceError,
    ...extra,
  })
}

export function getAnnouncementSpeechStatus() {
  return {
    unlocked,
    blocked: blockedRequest,
    widgetId: speaking.widgetId,
    itemId: speaking.itemId,
    requestId: speaking.requestId,
    expandUntil,
    appliedVoice,
    requestedVoice,
    error: voiceError,
  }
}

export function subscribeAnnouncementSpeechStatus(fn) {
  statusListeners.add(fn)
  fn(getAnnouncementSpeechStatus())
  return () => statusListeners.delete(fn)
}

function asText(value) {
  return typeof value === "string" ? value : ""
}

function normalizeVoiceKey(value) {
  return asText(value).normalize("NFC").trim()
}

function langsMatch(left, right) {
  const a = normalizeVoiceKey(left).toLowerCase().replaceAll("_", "-")
  const b = normalizeVoiceKey(right).toLowerCase().replaceAll("_", "-")
  if (!a || !b) return true
  return a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`)
}

export function readSpeechSettings() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}")
    const rate = raw.rate === "slow" || raw.rate === "fast" ? raw.rate : "normal"
    return {
      rate,
      voiceURI: asText(raw.voiceURI),
      voiceName: asText(raw.voiceName),
      voiceLang: asText(raw.voiceLang),
    }
  } catch {
    return { rate: "normal", voiceURI: "", voiceName: "", voiceLang: "" }
  }
}

export function saveSpeechSettings(patch, options = {}) {
  const next = { ...readSpeechSettings() }
  if (patch?.rate === "slow" || patch?.rate === "fast" || patch?.rate === "normal") next.rate = patch.rate
  if (typeof patch?.voiceURI === "string") next.voiceURI = patch.voiceURI
  if (typeof patch?.voiceName === "string") next.voiceName = patch.voiceName
  if (typeof patch?.voiceLang === "string") next.voiceLang = patch.voiceLang
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function republishSpeechSettings() {}

export function serializeSpeechVoice(voice) {
  return {
    voiceURI: asText(voice?.voiceURI),
    name: asText(voice?.name),
    lang: asText(voice?.lang),
    localService: Boolean(voice?.localService),
  }
}

export function isKoreanVoice(voice) {
  const lang = normalizeVoiceKey(voice?.lang).toLowerCase().replaceAll("_", "-")
  const name = asText(voice?.name)
  if (lang === "ko" || lang.startsWith("ko-")) return true
  return /한국|korean/i.test(name)
}

export function listKoreanVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return []
  return window.speechSynthesis.getVoices().filter(isKoreanVoice)
}

export function subscribeKoreanVoices(fn) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    fn([])
    return () => {}
  }
  const emit = () => fn(listKoreanVoices())
  emit()
  window.speechSynthesis.addEventListener("voiceschanged", emit)
  return () => window.speechSynthesis.removeEventListener("voiceschanged", emit)
}

export function subscribeReceiverVoiceCatalog(fn) {
  catalogListeners.add(fn)
  fn(receiverVoiceCatalog)
  return () => catalogListeners.delete(fn)
}

function setReceiverVoiceCatalog(voices) {
  if (!Array.isArray(voices)) return
  receiverVoiceCatalog = voices.map(serializeSpeechVoice)
  catalogListeners.forEach((fn) => {
    try {
      fn(receiverVoiceCatalog)
    } catch {
      /* ignore */
    }
  })
}

export function waitForSpeechVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([])
  const read = () => window.speechSynthesis.getVoices()
  const current = read()
  if (current.length) return Promise.resolve(current)
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.speechSynthesis.removeEventListener("voiceschanged", finish)
      window.clearTimeout(timer)
      resolve(read())
    }
    const timer = window.setTimeout(finish, 1500)
    window.speechSynthesis.addEventListener("voiceschanged", finish)
  })
}

export function resolveSpeechVoice(voices, wanted) {
  const list = Array.isArray(voices) ? voices : []
  const uri = normalizeVoiceKey(wanted?.voiceURI)
  const name = normalizeVoiceKey(wanted?.voiceName)
  const lang = normalizeVoiceKey(wanted?.voiceLang)
  if (!uri && !name) return { voice: null, unmatched: false }
  const byUri = list.find((voice) => normalizeVoiceKey(voice.voiceURI) === uri)
  if (byUri) return { voice: byUri, unmatched: false }
  const byNameLang = list.find(
    (voice) => normalizeVoiceKey(voice.name) === name && langsMatch(voice.lang, lang),
  )
  if (byNameLang) return { voice: byNameLang, unmatched: false }
  const byName = list.find((voice) => normalizeVoiceKey(voice.name) === name)
  if (byName) return { voice: byName, unmatched: false }
  return { voice: null, unmatched: true }
}

function applyUtteranceVoice(next, voice) {
  if (voice) {
    next.voice = voice
    next.lang = voice.lang || "ko-KR"
    return voice.name || voice.voiceURI
  }
  next.lang = "ko-KR"
  return ""
}

function wantedVoiceFrom(payload) {
  const settings = readSpeechSettings()
  return {
    voiceURI: asText(payload?.voiceURI) || settings.voiceURI,
    voiceName: asText(payload?.voiceName) || settings.voiceName,
    voiceLang: asText(payload?.voiceLang) || settings.voiceLang,
    rate: payload?.rate === "slow" || payload?.rate === "fast" || payload?.rate === "normal" ? payload.rate : settings.rate,
  }
}

export function announcementSpeechText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function asId(value) {
  return typeof value === "string" && value ? value : value != null ? String(value) : null
}

function clearSpeaking() {
  speaking = { widgetId: null, itemId: null, requestId: null }
  expandUntil = 0
}

function cancelUtterance() {
  playGen += 1
  if (speakTimer) {
    window.clearTimeout(speakTimer)
    speakTimer = 0
  }
  utterance = null
  pendingLocked = null
  queue.length = 0
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
  clearSpeaking()
}

function rememberCmd(payload) {
  const token = `${payload?.action || ""}|${payload?.requestId || ""}|${payload?.itemId || ""}|${payload?.at || ""}`
  if (!payload?.action) return false
  if (recentCmds.includes(token)) return false
  recentCmds.push(token)
  if (recentCmds.length > 48) recentCmds.shift()
  return true
}

async function createSpokenUtterance(text, wanted) {
  await waitForSpeechVoices()
  const liveVoices = listKoreanVoices()
  const { voice, unmatched } = resolveSpeechVoice(liveVoices, wanted)
  if (unmatched) {
    return {
      utterance: null,
      appliedVoice: "",
      error: "voice-unavailable",
      label: wanted.voiceName || wanted.voiceURI,
    }
  }
  const next = new SpeechSynthesisUtterance(text)
  next.rate = RATE[wanted.rate] ?? 1
  const fresh = voice ? liveVoices.find((item) => item.voiceURI === voice.voiceURI) || voice : null
  const applied = applyUtteranceVoice(next, fresh)
  return { utterance: next, appliedVoice: applied, error: "", voice: fresh }
}

export function stopAnnouncementPreview() {
  const was = Boolean(previewUtterance)
  previewUtterance = null
  if (was) emitPreview(false)
  if (typeof window === "undefined" || !window.speechSynthesis || isHaruReceiver()) return
  if (utterance) return
  window.speechSynthesis.cancel()
}

export async function toggleAnnouncementPreview(text) {
  if (isHaruReceiver() || typeof window === "undefined" || !window.speechSynthesis) {
    return { active: false, error: "", appliedVoice: "" }
  }
  if (previewUtterance) {
    stopAnnouncementPreview()
    return { active: false, error: "", appliedVoice: "" }
  }
  const plain = announcementSpeechText(text)
  if (!plain) return { active: false, error: "", appliedVoice: "" }
  const built = await createSpokenUtterance(plain, readSpeechSettings())
  if (built.error === "voice-unavailable") {
    return {
      active: false,
      appliedVoice: "",
      error: `이 브라우저에서는 ‘${built.label}’ 목소리를 사용할 수 없습니다.`,
    }
  }
  const next = built.utterance
  next.onend = () => {
    if (previewUtterance !== next) return
    previewUtterance = null
    emitPreview(false)
  }
  next.onerror = () => {
    if (previewUtterance !== next) return
    previewUtterance = null
    emitPreview(false)
  }
  previewUtterance = next
  window.speechSynthesis.speak(next)
  emitPreview(true)
  return { active: true, error: "", appliedVoice: built.appliedVoice || next.voice?.name || "" }
}

async function playPayload(payload) {
  if (isHaruReceiver()) return
  const gen = ++playGen
  const text = announcementSpeechText(payload?.text)
  const widgetId = asId(payload?.widgetId)
  const itemId = asId(payload?.itemId)
  const requestId = asId(payload?.requestId)
  if (!text || !itemId || !widgetId) return

  blockedRequest = false
  pendingLocked = null
  if (typeof window === "undefined" || !window.speechSynthesis) {
    voiceError = "unsupported"
    publishSpeechStatus({ blocked: true, error: "unsupported", reason: "blocked" })
    return
  }

  if (speakTimer) {
    window.clearTimeout(speakTimer)
    speakTimer = 0
  }
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel()
  }

  const wanted = wantedVoiceFrom(payload)
  requestedVoice = wanted.voiceName || wanted.voiceURI
  const built = await createSpokenUtterance(text, wanted)
  if (gen !== playGen) return
  if (built.error === "voice-unavailable") {
    utterance = null
    clearSpeaking()
    appliedVoice = ""
    voiceError = "voice-unavailable"
    publishSpeechStatus({
      reason: "blocked",
      error: "voice-unavailable",
      requestedVoice,
      appliedVoice: "",
    })
    return
  }

  const next = built.utterance
  const fresh = built.voice
  appliedVoice = built.appliedVoice
  voiceError = ""
  expandUntil = Number(payload?.expandUntil) || Date.now() + SPEECH_EXPAND_MS
  next.onstart = () => {
    if (utterance !== next) return
    speaking = { widgetId, itemId, requestId }
    appliedVoice = next.voice?.name || appliedVoice
    publishSpeechStatus({
      reason: "start",
      appliedVoice,
      requestedVoice,
      error: "",
    })
  }
  next.onend = () => {
    if (utterance !== next) return
    utterance = null
    clearSpeaking()
    publishSpeechStatus({ reason: "ended", appliedVoice, requestedVoice, error: "" })
    const queued = queue.shift()
    if (queued) playPayload(queued)
  }
  next.onerror = (event) => {
    if (utterance !== next) return
    const error = event?.error || "speak-error"
    if (error === "canceled" || error === "interrupted") return
    utterance = null
    clearSpeaking()
    voiceError = error
    publishSpeechStatus({ error, reason: "blocked", appliedVoice, requestedVoice })
  }
  utterance = next
  speaking = { widgetId, itemId, requestId }
  speakTimer = window.setTimeout(() => {
    speakTimer = 0
    if (utterance !== next) return
    if (fresh) {
      const latest = listKoreanVoices().find((item) => item.voiceURI === fresh.voiceURI) || fresh
      next.voice = latest
      next.lang = latest.lang || next.lang
      appliedVoice = latest.name || appliedVoice
    }
    window.speechSynthesis.speak(next)
    publishSpeechStatus({
      reason: "start",
      appliedVoice,
      requestedVoice,
      error: "",
    })
  }, 40)
}

function handleSpeechCommand(payload) {
  if (!rememberCmd(payload)) return
  const action = payload?.action
  if (action === "stop") {
    const itemId = asId(payload?.itemId)
    if (itemId && speaking.itemId && speaking.itemId !== itemId) return
    cancelUtterance()
    blockedRequest = false
    voiceError = ""
    publishSpeechStatus({ reason: "stop" })
    return
  }
  if (action !== "play") return
  if (payload?.queue && (utterance || speaking.itemId)) {
    queue.push(payload)
    return
  }
  queue.length = 0
  playPayload(payload)
}

export function unlockAnnouncementSpeech() {
  return !isHaruReceiver()
}

export function requestAnnouncementSpeech(payload) {
  if (isHaruReceiver()) return
  stopAnnouncementPreview()
  handleSpeechCommand({ ...payload, at: Date.now() })
}

function applyRemoteSpeechStatus(payload) {
  unlocked = true
  blockedRequest = Boolean(payload.blocked)
  speaking = {
    widgetId: asId(payload.widgetId),
    itemId: asId(payload.itemId),
    requestId: asId(payload.requestId),
  }
  expandUntil = Number(payload.expandUntil) || 0
  appliedVoice = asText(payload.appliedVoice)
  requestedVoice = asText(payload.requestedVoice)
  voiceError = asText(payload.error)
  emitStatus({
    error: voiceError,
    reason: payload.reason || "",
    expandUntil,
    appliedVoice,
    requestedVoice,
  })
}

export function ensureAnnouncementSpeechBridge() {
  if (bridgeBound || typeof window === "undefined") return
  bridgeBound = true
  if (isHaruReceiver()) {
    subscribeSync((msg) => {
      if (msg.type !== SYNC.ANNOUNCEMENT_SPEECH_STATUS) return
      applyRemoteSpeechStatus(msg.payload || {})
    })
    return
  }
  unlocked = true
}
