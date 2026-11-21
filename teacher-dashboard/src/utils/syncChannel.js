const CHANNEL_NAME = "haru-sync"
const WIDGET_FOCUS_KEY = "classtool-widget-focus"
const ANNOUNCEMENT_FOCUS_KEY = "classtool-announcement-focus"
const ANNOUNCEMENT_SPEECH_CMD_KEY = "classtool-announcement-speech-cmd"
const ANNOUNCEMENT_SPEECH_STATUS_KEY = "classtool-announcement-speech-status"
const RELAY_PATH = "/__haru_sync"
const RECENT_ID_LIMIT = 80

export const SYNC = {
  VIEW_CHANGE: "VIEW_CHANGE",
  STATE_REQUEST: "STATE_REQUEST",
  WIDGET_FOCUS: "WIDGET_FOCUS",
  ANNOUNCEMENT_FOCUS: "ANNOUNCEMENT_FOCUS",
  ANNOUNCEMENT_SPEECH: "ANNOUNCEMENT_SPEECH",
  ANNOUNCEMENT_SPEECH_STATUS: "ANNOUNCEMENT_SPEECH_STATUS",
  PICKER_DRAW_START: "PICKER_DRAW_START",
  PICKER_RESULT: "PICKER_RESULT",
  PICKER_RESET: "PICKER_RESET",
  PICKER_CONFIG: "PICKER_CONFIG",
  TIMER_SET: "TIMER_SET",
  TIMER_START: "TIMER_START",
  TIMER_PAUSE: "TIMER_PAUSE",
  TIMER_RESUME: "TIMER_RESUME",
  TIMER_RESET: "TIMER_RESET",
  TIMER_MODE: "TIMER_MODE",
  TIMER_CAPTION: "TIMER_CAPTION",
  DASHBOARD_UPDATE: "DASHBOARD_UPDATE",
  NOTICE_WIDGET_UPDATE: "NOTICE_WIDGET_UPDATE",
  NOTICE_WIDGET_ADD: "NOTICE_WIDGET_ADD",
  NOTICE_WIDGET_DELETE: "NOTICE_WIDGET_DELETE",
  NOTICE_UPDATE: "NOTICE_UPDATE",
  NOTEPAD_UPDATE: "NOTEPAD_UPDATE",
}

let receiverCached = null

export function isHaruReceiver() {
  if (receiverCached != null) return receiverCached
  try {
    receiverCached = new URLSearchParams(window.location.search).get("role") === "receiver"
  } catch {
    receiverCached = false
  }
  return receiverCached
}

function newId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

const sourceId = newId()
const recentIds = []
const recentSet = new Set()
const listeners = new Set()

let channel = null
let storageBound = false
let relayBound = false

function emitToListeners(msg) {
  listeners.forEach((handler) => {
    try {
      handler(msg)
    } catch {
      /* ignore subscriber errors */
    }
  })
}

function ingestRemoteMessage(msg) {
  if (!msg || typeof msg !== "object") return
  if (msg.sourceId === sourceId) return
  if (msg.messageId && !rememberMessageId(msg.messageId)) return
  emitToListeners(msg)
}

export function readWidgetFocus() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(WIDGET_FOCUS_KEY) || "null")
    return typeof raw?.widgetId === "string" && raw.widgetId ? raw.widgetId : null
  } catch {
    return null
  }
}

function emitWidgetFocus(widgetId) {
  emitToListeners({
    type: SYNC.WIDGET_FOCUS,
    payload: { widgetId },
    sourceId: "local",
    messageId: `local-widget-focus-${Date.now()}`,
    timestamp: Date.now(),
  })
}

export function persistWidgetFocus(widgetId) {
  if (isHaruReceiver()) return
  const id = typeof widgetId === "string" && widgetId ? widgetId : null
  try {
    window.localStorage.setItem(WIDGET_FOCUS_KEY, JSON.stringify({ widgetId: id, at: Date.now() }))
  } catch {
    /* ignore quota / private mode */
  }
  syncSend(SYNC.WIDGET_FOCUS, { widgetId: id })
  emitWidgetFocus(id)
}

export function parseAnnouncementFocus(raw) {
  const widgetId = typeof raw?.widgetId === "string" && raw.widgetId ? raw.widgetId : null
  const itemId = typeof raw?.itemId === "string" && raw.itemId ? raw.itemId : null
  const width = Number(raw?.width) || 0
  const mode = raw?.mode === "speech" ? "speech" : "manual"
  const until = Number(raw?.until) || 0
  const requestId = typeof raw?.requestId === "string" && raw.requestId ? raw.requestId : null
  if (!widgetId || !itemId) {
    return { widgetId: null, itemId: null, width: 0, mode: "manual", until: 0, requestId: null }
  }
  if (mode === "speech" && until > 0 && until <= Date.now()) {
    return { widgetId: null, itemId: null, width: 0, mode: "manual", until: 0, requestId: null }
  }
  return { widgetId, itemId, width, mode, until, requestId }
}

export function readAnnouncementFocus() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(ANNOUNCEMENT_FOCUS_KEY) || "null")
    const parsed = parseAnnouncementFocus(raw)
    if (!parsed.itemId) return null
    if (parsed.mode === "speech") return null
    return parsed
  } catch {
    return null
  }
}

export function persistAnnouncementSpeech(payload) {
  if (isHaruReceiver()) return
  const next = { ...payload, at: Date.now() }
  try {
    window.localStorage.setItem(ANNOUNCEMENT_SPEECH_CMD_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
  syncSend(SYNC.ANNOUNCEMENT_SPEECH, next)
}

export function persistAnnouncementSpeechStatus(payload) {
  if (isHaruReceiver()) return
  const next = { ...payload, at: Date.now() }
  try {
    window.localStorage.setItem(ANNOUNCEMENT_SPEECH_STATUS_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
  syncSend(SYNC.ANNOUNCEMENT_SPEECH_STATUS, next)
}

let lastAnnouncementFocusKey = ""

export function persistAnnouncementFocus(focus) {
  if (isHaruReceiver()) return
  const widgetId = typeof focus?.widgetId === "string" && focus.widgetId ? focus.widgetId : null
  const itemId = typeof focus?.itemId === "string" && focus.itemId ? focus.itemId : null
  const width = Number(focus?.width) || 0
  const mode = focus?.mode === "speech" ? "speech" : "manual"
  const until = Number(focus?.until) || 0
  const requestId = typeof focus?.requestId === "string" && focus.requestId ? focus.requestId : null
  const payload = { widgetId, itemId, width, mode, until, requestId }
  const key = `${widgetId}|${itemId}|${width}|${mode}|${until}|${requestId}`
  if (key === lastAnnouncementFocusKey) return
  lastAnnouncementFocusKey = key
  try {
    window.localStorage.setItem(
      ANNOUNCEMENT_FOCUS_KEY,
      JSON.stringify({ ...payload, at: Date.now() }),
    )
  } catch {
    /* ignore quota / private mode */
  }
  syncSend(SYNC.ANNOUNCEMENT_FOCUS, payload)
  emitToListeners({
    type: SYNC.ANNOUNCEMENT_FOCUS,
    payload,
    sourceId: "local",
    messageId: `local-announcement-focus-${Date.now()}`,
    timestamp: Date.now(),
  })
}

function rememberMessageId(id) {
  if (typeof id !== "string" || !id) return false
  if (recentSet.has(id)) return false
  recentSet.add(id)
  recentIds.push(id)
  if (recentIds.length > RECENT_ID_LIMIT) {
    const oldest = recentIds.shift()
    recentSet.delete(oldest)
  }
  return true
}

function bindStorageSync() {
  if (storageBound || typeof window === "undefined") return
  storageBound = true
  window.addEventListener("storage", (event) => {
    if (event.key === WIDGET_FOCUS_KEY) {
      let widgetId = null
      try {
        const raw = JSON.parse(event.newValue || "null")
        widgetId = typeof raw?.widgetId === "string" && raw.widgetId ? raw.widgetId : null
      } catch {
        widgetId = null
      }
      emitToListeners({
        type: SYNC.WIDGET_FOCUS,
        payload: { widgetId },
        sourceId: "storage",
        messageId: `storage-focus-${Date.now()}`,
        timestamp: Date.now(),
      })
      return
    }
    if (event.key === ANNOUNCEMENT_FOCUS_KEY) {
      let payload = parseAnnouncementFocus(null)
      try {
        payload = parseAnnouncementFocus(JSON.parse(event.newValue || "null"))
      } catch {
        payload = parseAnnouncementFocus(null)
      }
      emitToListeners({
        type: SYNC.ANNOUNCEMENT_FOCUS,
        payload,
        sourceId: "storage",
        messageId: `storage-announcement-focus-${Date.now()}`,
        timestamp: Date.now(),
      })
      return
    }
    if (event.key === ANNOUNCEMENT_SPEECH_CMD_KEY) {
      let payload = {}
      try {
        payload = JSON.parse(event.newValue || "{}") || {}
      } catch {
        payload = {}
      }
      emitToListeners({
        type: SYNC.ANNOUNCEMENT_SPEECH,
        payload,
        sourceId: "storage",
        messageId: `storage-announcement-speech-${Date.now()}`,
        timestamp: Date.now(),
      })
      return
    }
    if (event.key !== ANNOUNCEMENT_SPEECH_STATUS_KEY) return
    let payload = {}
    try {
      payload = JSON.parse(event.newValue || "{}") || {}
    } catch {
      payload = {}
    }
    emitToListeners({
      type: SYNC.ANNOUNCEMENT_SPEECH_STATUS,
      payload,
      sourceId: "storage",
      messageId: `storage-announcement-speech-status-${Date.now()}`,
      timestamp: Date.now(),
    })
  })
}

function bindRelaySync() {
  if (relayBound || typeof window === "undefined" || typeof EventSource === "undefined") return
  relayBound = true
  try {
    const stream = new EventSource(RELAY_PATH)
    stream.onmessage = (event) => {
      let msg = null
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      ingestRemoteMessage(msg)
    }
  } catch {
    /* preview / static hosts without the Vite relay */
  }
}

function postRelay(msg) {
  try {
    fetch(RELAY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}

function getChannel() {
  bindStorageSync()
  bindRelaySync()
  if (typeof BroadcastChannel === "undefined") return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event) => {
      ingestRemoteMessage(event.data)
    }
  }
  return channel
}

export function syncSend(type, payload = {}) {
  if (isHaruReceiver() && type !== SYNC.STATE_REQUEST) {
    return
  }
  if (!type) return
  getChannel()
  const msg = {
    type,
    payload,
    sourceId,
    messageId: newId(),
    timestamp: Date.now(),
  }
  if (channel) channel.postMessage(msg)
  postRelay(msg)
}

export function subscribeSync(handler) {
  getChannel()
  listeners.add(handler)
  return () => {
    listeners.delete(handler)
  }
}

export function closeSyncChannel() {
  if (channel) {
    channel.close()
    channel = null
  }
  listeners.clear()
}

const DASHBOARD_SYNC_DEBOUNCE_MS = 700
let dashboardTimer = null

export function scheduleDashboardSync() {
  if (isHaruReceiver()) return
  if (dashboardTimer) window.clearTimeout(dashboardTimer)
  dashboardTimer = window.setTimeout(() => {
    dashboardTimer = null
    syncSend(SYNC.DASHBOARD_UPDATE, {})
  }, DASHBOARD_SYNC_DEBOUNCE_MS)
}

export function flushDashboardSync() {
  if (isHaruReceiver()) return
  if (!dashboardTimer) return
  window.clearTimeout(dashboardTimer)
  dashboardTimer = null
  syncSend(SYNC.DASHBOARD_UPDATE, {})
}

const typedTimers = new Map()

export function scheduleSyncMessage(type, payloadOrFn, delayMs = 1000) {
  if (isHaruReceiver()) return
  const previous = typedTimers.get(type)
  if (previous) window.clearTimeout(previous)
  typedTimers.set(
    type,
    window.setTimeout(() => {
      typedTimers.delete(type)
      const payload = typeof payloadOrFn === "function" ? payloadOrFn() : payloadOrFn
      syncSend(type, payload ?? {})
    }, delayMs),
  )
}

export function flushSyncMessage(type, payloadOrFn) {
  if (isHaruReceiver()) return
  const previous = typedTimers.get(type)
  if (previous) {
    window.clearTimeout(previous)
    typedTimers.delete(type)
  }
  const payload = typeof payloadOrFn === "function" ? payloadOrFn() : payloadOrFn
  syncSend(type, payload ?? {})
}
