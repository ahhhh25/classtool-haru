import { get, goOnline, onValue, ref, remove, set, update } from "firebase/database"
import { ensureAnonymousUser, firebaseErrorMessage, getFirebaseDb, isFirebaseConfigured } from "./firebase"
import { boardToCloudMaps } from "../utils/checkboardCloud"
import { isKioskLinked, loadKioskLink, saveKioskLink } from "../utils/kioskLinkStore"
import { generateKioskToken } from "../utils/kioskTokens"

function dbOrThrow() {
  const db = getFirebaseDb()
  if (!db) throw new Error("Firebase 설정이 없습니다.")
  return db
}

async function readOwnerUid(classId) {
  const snap = await get(ref(dbOrThrow(), `classes/${classId}/ownerUid`))
  return typeof snap.val() === "string" ? snap.val() : null
}

async function writeClassShell(uid, classId, name) {
  const db = dbOrThrow()
  const now = Date.now()
  await set(ref(db, `users/${uid}`), { classId, createdAt: now })
  await set(ref(db, `classes/${classId}`), {
    ownerUid: uid,
    name: name || "",
    createdAt: now,
    kioskEnabled: false,
    activeChecklistId: null,
  })
}

async function writeLiveAndClassData(widget, classId, kioskToken, previousCompletions) {
  const db = dbOrThrow()
  const maps = boardToCloudMaps(widget.checkboard, previousCompletions)
  const studentCount = Object.keys(maps.students).length
  const hasChecklists = Object.keys(maps.checklists).length > 0
  const livePatch = {
    classId,
    name: widget.title || "",
    activeChecklistId: maps.activeChecklistId,
    studentCount,
    students: studentCount > 0 ? maps.students : null,
    completions: studentCount > 0 ? maps.completions : {},
  }
  if (hasChecklists) livePatch.checklists = maps.checklists
  await update(ref(db, `live/${kioskToken}`), livePatch)
  const classPatch = {
    studentCount,
    students: studentCount > 0 ? maps.students : null,
    completions: studentCount > 0 ? maps.completions : {},
  }
  if (hasChecklists) classPatch.checklists = maps.checklists
  if (Object.keys(classPatch).length) {
    await update(ref(db, `classData/${classId}`), classPatch)
  }
  await update(ref(db, `classes/${classId}`), {
    name: widget.title || "",
    kioskEnabled: true,
    activeChecklistId: maps.activeChecklistId,
  })
  return maps.completions
}

async function dropKioskAccess(link) {
  const db = dbOrThrow()
  if (link?.kioskToken) {
    await remove(ref(db, `live/${link.kioskToken}`))
    await remove(ref(db, `kioskIndex/${link.kioskToken}`))
  }
  if (link?.joinCode) {
    await remove(ref(db, `joinCodes/${link.joinCode}`))
  }
}

export async function ensureBrowserOwner() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase 설정이 없습니다. .env.local에 VITE_FIREBASE_* 값을 넣어 주세요.")
  }
  return ensureAnonymousUser()
}

export async function connectKiosk(widget) {
  const user = await ensureBrowserOwner()
  let link = loadKioskLink()

  if (link?.classId) {
    const ownerUid = await readOwnerUid(link.classId)
    if (ownerUid && ownerUid !== user.uid) {
      saveKioskLink(null)
      link = null
    } else if (!ownerUid) {
      saveKioskLink(null)
      link = null
    }
  }

  if (!link?.classId) {
    const classId = crypto.randomUUID()
    await writeClassShell(user.uid, classId, widget.title || "")
    link = {
      classId,
      widgetId: widget.id,
      kioskToken: null,
      createdAt: Date.now(),
    }
  }

  const kioskToken = generateKioskToken()

  if (link.kioskToken || link.joinCode) {
    await dropKioskAccess(link)
  }

  await set(ref(dbOrThrow(), `kioskIndex/${kioskToken}`), {
    classId: link.classId,
    ownerUid: user.uid,
  })
  await writeLiveAndClassData(widget, link.classId, kioskToken, {})

  const next = {
    classId: link.classId,
    widgetId: widget.id,
    kioskToken,
    createdAt: link.createdAt || Date.now(),
  }
  saveKioskLink(next)
  return next
}

export async function rotateKioskToken(widget) {
  const link = loadKioskLink()
  if (!isKioskLinked(link)) throw new Error("연결된 학생용 화면이 없습니다.")
  return connectKiosk(widget)
}

export async function disconnectKiosk() {
  const user = await ensureBrowserOwner()
  const link = loadKioskLink()
  if (!link?.classId) return
  await dropKioskAccess(link)
  if (link.classId) {
    const ownerUid = await readOwnerUid(link.classId)
    if (ownerUid === user.uid) {
      await update(ref(dbOrThrow(), `classes/${link.classId}`), {
        kioskEnabled: false,
        activeChecklistId: null,
      })
    }
  }
  saveKioskLink({
    classId: link.classId,
    widgetId: link.widgetId,
    kioskToken: null,
    createdAt: link.createdAt,
  })
}

export async function pushBoardToCloud(widget, previousCompletions = {}) {
  const link = loadKioskLink()
  if (!isKioskLinked(link) || link.widgetId !== widget.id) return null
  const user = await ensureBrowserOwner()
  const ownerUid = await readOwnerUid(link.classId)
  if (ownerUid !== user.uid) {
    saveKioskLink(null)
    throw new Error("이 브라우저는 이 학급의 소유자가 아닙니다. 새로 연결해 주세요.")
  }
  return writeLiveAndClassData(widget, link.classId, link.kioskToken, previousCompletions)
}

export function subscribeLiveBoard(kioskToken, onData, onError) {
  const db = getFirebaseDb()
  if (!db || !kioskToken) return () => {}
  try {
    goOnline(db)
  } catch {
    /* already connected */
  }
  return onValue(
    ref(db, `live/${kioskToken}`),
    (snap) => onData(snap.val()),
    (error) => onError?.(error),
  )
}

const KIOSK_MAX_ATTEMPTS = 5
const KIOSK_RETRY_DELAYS_MS = [0, 1500, 3000, 5000, 8000]
const KIOSK_SNAPSHOT_TIMEOUT_MS = 8000

function logKiosk(event, detail = {}) {
  const safe = { ...detail }
  delete safe.token
  delete safe.kioskToken
  delete safe.uid
  console.info("[haru-kiosk]", event, safe)
}

function wakeDatabase() {
  const db = getFirebaseDb()
  if (!db) return null
  try {
    goOnline(db)
  } catch {
    /* ignore */
  }
  return db
}

/**
 * 학생용(태블릿) 연결: kioskIndex로 주소 유효성을 먼저 확인하고,
 * live 구독이 응답하지 않으면 제한된 횟수로 재시도한다.
 */
export function subscribeKioskLive(kioskToken, { onLive, onStatus } = {}) {
  let cancelled = false
  let unsubLive = null
  let attempt = 0
  let timeoutId = null
  let retryId = null
  let liveOk = false
  let lastStatus = "connecting"
  let retryArmed = false

  const setStatus = (status, error = "", reason = "") => {
    lastStatus = status
    onStatus?.({ status, error, reason })
  }

  const detachLive = () => {
    if (unsubLive) {
      unsubLive()
      unsubLive = null
    }
    if (timeoutId) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const stopRetryLoop = () => {
    if (retryId) {
      window.clearTimeout(retryId)
      retryId = null
    }
  }

  const scheduleRetry = (err) => {
    if (cancelled || retryArmed) return
    retryArmed = true
    detachLive()
    const code = err?.code || err?.message || "unknown"
    attempt += 1
    if (attempt >= KIOSK_MAX_ATTEMPTS) {
      logKiosk("give-up", { code, attempts: attempt })
      setStatus("error", "연결에 실패했습니다.", code)
      return
    }
    const delay = KIOSK_RETRY_DELAYS_MS[Math.min(attempt, KIOSK_RETRY_DELAYS_MS.length - 1)]
    logKiosk("retry-scheduled", { code, attempt: attempt + 1, delayMs: delay })
    setStatus("retrying", "", code)
    retryId = window.setTimeout(() => {
      retryId = null
      retryArmed = false
      connect()
    }, delay)
  }

  const connect = async () => {
    if (cancelled) return
    retryArmed = false
    detachLive()
    const retrying = attempt > 0
    setStatus(retrying ? "retrying" : "connecting")
    logKiosk(retrying ? "retry" : "connect", {
      attempt: attempt + 1,
      tokenLength: typeof kioskToken === "string" ? kioskToken.length : 0,
    })

    if (!kioskToken) {
      setStatus("invalid", "유효하지 않거나 만료된 연결 주소입니다.", "missing-token")
      return
    }
    if (!isFirebaseConfigured()) {
      setStatus("error", "Firebase 설정이 없어 학생용 화면에 연결할 수 없습니다.", "no-config")
      return
    }

    const db = wakeDatabase()
    if (!db) {
      scheduleRetry({ code: "no-db", message: "Realtime Database를 열 수 없습니다." })
      return
    }

    let index = null
    try {
      index = await readKioskIndex(kioskToken)
    } catch (err) {
      logKiosk("kioskIndex-error", { code: err?.code || "", message: err?.message || "" })
      scheduleRetry(err)
      return
    }
    if (cancelled) return

    if (!index || typeof index !== "object") {
      logKiosk("kioskIndex-missing", { tokenLength: kioskToken.length })
      setStatus("invalid", "유효하지 않거나 만료된 연결 주소입니다.", "kioskIndex-missing")
      return
    }

    let resolved = false
    unsubLive = onValue(
      ref(db, `live/${kioskToken}`),
      (snap) => {
        if (cancelled) return
        const value = snap.val()
        if (!value || typeof value !== "object") {
          logKiosk("live-empty", { hadLive: liveOk, attempt: attempt + 1 })
          if (liveOk) {
            liveOk = false
            setStatus("invalid", "연결이 없거나 교사가 해제했습니다.", "live-removed")
            detachLive()
          }
          return
        }
        resolved = true
        liveOk = true
        attempt = 0
        if (timeoutId) {
          window.clearTimeout(timeoutId)
          timeoutId = null
        }
        onLive?.(value)
        setStatus("live", "")
      },
      (error) => {
        logKiosk("live-listen-error", { code: error?.code || "", message: error?.message || "" })
        liveOk = false
        scheduleRetry(error)
      },
    )

    timeoutId = window.setTimeout(() => {
      timeoutId = null
      if (cancelled || resolved || liveOk) return
      logKiosk("snapshot-timeout", { attempt: attempt + 1 })
      scheduleRetry({ code: "timeout", message: "Realtime Database 응답 없음" })
    }, KIOSK_SNAPSHOT_TIMEOUT_MS)
  }

  const retryNow = () => {
    if (cancelled) return
    stopRetryLoop()
    attempt = 0
    liveOk = false
    connect()
  }

  const resumeIfNeeded = (reason) => {
    if (cancelled || liveOk || lastStatus === "invalid") return
    logKiosk(reason, { attempt: attempt + 1, lastStatus })
    retryNow()
  }

  const onOnline = () => {
    wakeDatabase()
    resumeIfNeeded("browser-online")
  }

  const onVisible = () => {
    if (document.hidden) return
    wakeDatabase()
    resumeIfNeeded("page-visible")
  }

  window.addEventListener("online", onOnline)
  document.addEventListener("visibilitychange", onVisible)
  connect()

  return {
    stop() {
      cancelled = true
      detachLive()
      stopRetryLoop()
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisible)
    },
    retry: retryNow,
  }
}

export async function readKioskIndex(kioskToken) {
  const snap = await get(ref(dbOrThrow(), `kioskIndex/${kioskToken}`))
  return snap.val()
}

export async function toggleStudentCompletion(kioskToken, itemId, studentId) {
  const db = dbOrThrow()
  const studentSnap = await get(ref(db, `live/${kioskToken}/students/${studentId}`))
  const itemSnap = await get(ref(db, `live/${kioskToken}/checklists/${itemId}`))
  if (!studentSnap.exists() || !itemSnap.exists()) {
    throw new Error("학생 또는 체크 항목을 찾을 수 없습니다.")
  }
  const cellRef = ref(db, `live/${kioskToken}/completions/${itemId}/${studentId}`)
  const current = (await get(cellRef)).val()
  await set(cellRef, {
    done: !current?.done,
    at: Date.now(),
  })
}

export { firebaseErrorMessage }
