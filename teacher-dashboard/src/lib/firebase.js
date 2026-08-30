import { initializeApp } from "firebase/app"
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth"
import { getDatabase } from "firebase/database"

let app
let auth
let db
let anonymousPromise

export function isFirebaseConfigured() {
  const config = getConfig()
  return Boolean(config.apiKey && config.projectId && config.databaseURL)
}

function env(name) {
  const value = import.meta.env[name]
  return typeof value === "string" ? value.trim() : ""
}

function getConfig() {
  const projectId = env("VITE_FIREBASE_PROJECT_ID")
  const databaseURL = env("VITE_FIREBASE_DATABASE_URL").replace(/\/+$/, "")
  return {
    apiKey: env("VITE_FIREBASE_API_KEY"),
    authDomain: env("VITE_FIREBASE_AUTH_DOMAIN") || (projectId ? `${projectId}.firebaseapp.com` : ""),
    databaseURL,
    projectId,
    appId: env("VITE_FIREBASE_APP_ID"),
  }
}

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) return null
  if (!app) app = initializeApp(getConfig())
  return app
}

export function getFirebaseAuth() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  if (!auth) auth = getAuth(firebaseApp)
  return auth
}

export function getFirebaseDb() {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  if (!db) db = getDatabase(firebaseApp)
  return db
}

function currentUser(firebaseAuth) {
  return new Promise((resolve) => {
    if (firebaseAuth.currentUser) {
      resolve(firebaseAuth.currentUser)
      return
    }
    const stop = onAuthStateChanged(firebaseAuth, (user) => {
      stop()
      resolve(user)
    })
  })
}

/**
 * 이 브라우저를 익명 사용자로 식별하고 UID를 학급 owner로 씁니다.
 * 교사 PC 인증이 아니며, 다른 브라우저에서 기존 학급을 복구하지 않습니다.
 */
export async function ensureAnonymousUser() {
  const firebaseAuth = getFirebaseAuth()
  if (!firebaseAuth) {
    throw new Error("Firebase 설정이 없습니다.")
  }
  if (!anonymousPromise) {
    anonymousPromise = (async () => {
      const existing = await currentUser(firebaseAuth)
      if (existing) return existing
      const credential = await signInAnonymously(firebaseAuth)
      return credential.user
    })().catch((error) => {
      anonymousPromise = null
      throw error
    })
  }
  return anonymousPromise
}

export function firebaseErrorMessage(error) {
  const code = error?.code || ""
  if (code === "auth/api-key-not-valid" || code === "auth/invalid-api-key") {
    return "Firebase API 키가 거부되었습니다. 개발 서버를 다시 시작한 뒤, Google Cloud에서 Identity Toolkit API가 켜져 있는지와 키 제한(HTTP 리퍼러)을 확인해 주세요."
  }
  if (code === "auth/admin-restricted-operation" || code === "auth/operation-not-allowed") {
    return "익명 로그인이 꺼져 있습니다. Firebase Authentication에서 Anonymous를 켜 주세요."
  }
  if (code === "auth/network-request-failed" || code === "unavailable") {
    return "네트워크에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."
  }
  if (code === "PERMISSION_DENIED" || code === "permission-denied") {
    return "이 학급에 접근할 권한이 없습니다. 연결이 해제되었거나 이 브라우저의 소유가 아닙니다."
  }
  return error?.message || "클라우드에 연결하지 못했습니다."
}
