const CHANNEL_NAME = "haru-sync"
const RECENT_ID_LIMIT = 80

export const SYNC = {
  VIEW_CHANGE: "VIEW_CHANGE",
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

function getChannel() {
  if (typeof BroadcastChannel === "undefined") return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event) => {
      const msg = event.data
      if (!msg || typeof msg !== "object") return
      if (msg.sourceId === sourceId) return
      if (msg.messageId && !rememberMessageId(msg.messageId)) return
      listeners.forEach((handler) => {
        try {
          handler(msg)
        } catch {
          /* ignore subscriber errors */
        }
      })
    }
  }
  return channel
}

export function syncSend(type, payload = {}) {
  if (isHaruReceiver()) return
  const ch = getChannel()
  if (!ch || !type) return
  ch.postMessage({
    type,
    payload,
    sourceId,
    messageId: newId(),
    timestamp: Date.now(),
  })
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
