export const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return this._backup[key] ?? null
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      this._backup[key] = value
    }
  },
  _backup: {},
}

export function loadJson(key, fallback) {
  const raw = safeStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function saveJson(key, value) {
  safeStorage.setItem(key, JSON.stringify(value))
}
