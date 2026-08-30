function randomBytes(size) {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return bytes
}

export function generateKioskToken() {
  const bytes = randomBytes(18)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function isLoopbackHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]"
}

function resolvePublicOrigin() {
  const { protocol, hostname, port } = window.location
  if (!isLoopbackHost(hostname)) return window.location.origin
  const lanHost = typeof __HARU_DEV_LAN_HOST__ === "string" ? __HARU_DEV_LAN_HOST__ : ""
  if (!lanHost) return window.location.origin
  return `${protocol}//${lanHost}${port ? `:${port}` : ""}`
}

export function buildKioskUrl(token) {
  const url = new URL("/kiosk", resolvePublicOrigin())
  url.searchParams.set("t", token)
  return url.toString()
}

export function readKioskTokenFromLocation() {
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get("t")?.trim()
  if (fromQuery) return fromQuery
  const parts = window.location.pathname.split("/").filter(Boolean)
  if (parts[0] === "kiosk" && parts[1]) return decodeURIComponent(parts[1])
  try {
    return sessionStorage.getItem("haru_kiosk_token") || ""
  } catch {
    return ""
  }
}

export function rememberKioskToken(token) {
  try {
    if (token) sessionStorage.setItem("haru_kiosk_token", token)
    else sessionStorage.removeItem("haru_kiosk_token")
  } catch {
    /* ignore */
  }
}

export function isKioskRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/"
  return path === "/kiosk" || path.startsWith("/kiosk/")
}
