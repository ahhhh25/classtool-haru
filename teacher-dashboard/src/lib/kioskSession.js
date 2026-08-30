import { get, onValue, ref, remove, set, update } from "firebase/database"
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
  return onValue(
    ref(db, `live/${kioskToken}`),
    (snap) => onData(snap.val()),
    (error) => onError?.(error),
  )
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
