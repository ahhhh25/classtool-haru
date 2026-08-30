import { useEffect, useState } from "react"
import { loadJson, saveJson, safeStorage } from "./safeStorage"

export const KIOSK_LINK_KEY = "haru_kiosk_link_v1"

const listeners = new Set()

export function loadKioskLink() {
  const raw = loadJson(KIOSK_LINK_KEY, null)
  if (!raw || typeof raw !== "object") return null
  return {
    classId: typeof raw.classId === "string" ? raw.classId : null,
    widgetId: typeof raw.widgetId === "string" ? raw.widgetId : null,
    kioskToken: typeof raw.kioskToken === "string" ? raw.kioskToken : null,
    joinCode: typeof raw.joinCode === "string" ? raw.joinCode : null,
    joinExpiresAt: typeof raw.joinExpiresAt === "number" ? raw.joinExpiresAt : null,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : null,
  }
}

export function saveKioskLink(link) {
  if (!link) {
    try {
      localStorage.removeItem(KIOSK_LINK_KEY)
    } catch {
      safeStorage.setItem(KIOSK_LINK_KEY, "")
    }
    listeners.forEach((fn) => fn(null))
    return
  }
  saveJson(KIOSK_LINK_KEY, link)
  listeners.forEach((fn) => fn(link))
}

export function subscribeKioskLink(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useKioskLink() {
  const [link, setLink] = useState(loadKioskLink)
  useEffect(() => subscribeKioskLink(setLink), [])
  return link
}

export function isKioskLinked(link) {
  return Boolean(link?.classId && link?.kioskToken)
}
