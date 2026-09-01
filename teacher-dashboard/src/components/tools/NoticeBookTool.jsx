import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Copy, Maximize2, Save, Settings, Trash2, Upload, X } from "lucide-react"
import { DEFAULT_FONT } from "../../constants/fonts"
import { DEFAULT_TEXT_COLOR } from "../../constants/palette"
import { useTheme } from "../../theme/ThemeProvider"
import LineHeightControl from "../LineHeightControl"
import {
  applyBaseEditorStyle,
  applyEditorPatch,
  applyLineHeight,
  inferNoticeDate,
  kstDateKey,
  parseStoredSize,
  resolveFontId,
  titleFromContent,
  todayNoticeDateText,
  todayNoticeTitle,
} from "../../utils/editorStyle"
import { loadJson, saveJson } from "../../utils/safeStorage"
import { flushSyncMessage, scheduleSyncMessage, subscribeSync, SYNC } from "../../utils/syncChannel"
import ConfirmDialog from "../ConfirmDialog"
import WidgetSettings from "../WidgetSettings"

const NOTICES_KEY = "edu_notices_v1"
const PUBLISH_URL_KEY = "edu_notice_publish_url"
const AUTO_DELETE_KEY = "edu_notices_auto_delete_v1"

function normalizeUrl(raw) {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return ""
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function emptyNotice() {
  return {
    id: `notice-${Date.now()}`,
    title: todayNoticeTitle(),
    content: "",
    fontFamily: DEFAULT_FONT.id,
    fontSize: 36,
    lineHeight: "normal",
    textColor: DEFAULT_TEXT_COLOR,
    bold: true,
    underline: false,
    noticeDate: kstDateKey(),
    kept: false,
    updatedAt: new Date().toISOString(),
  }
}

function hydrateNotice(raw) {
  if (!raw || typeof raw !== "object") return null
  return {
    ...emptyNotice(),
    ...raw,
    id: String(raw.id || `notice-${Date.now()}`),
    fontFamily: resolveFontId(raw.fontFamily),
    fontSize: parseStoredSize(raw.fontSize, 36),
    textColor: raw.textColor || raw.color || DEFAULT_TEXT_COLOR,
    bold: raw.bold !== false,
    underline: Boolean(raw.underline),
    lineHeight: raw.lineHeight || "normal",
    noticeDate: inferNoticeDate(raw),
    kept: raw.kept == null ? true : Boolean(raw.kept),
  }
}

export default function NoticeBookTool() {
  const { theme } = useTheme()
  const [notices, setNotices] = useState(() => {
    const loaded = loadJson(NOTICES_KEY, [])
    const hydrated = Array.isArray(loaded) ? loaded.map(hydrateNotice).filter(Boolean) : []
    if (hydrated.length > 0) return hydrated
    const created = emptyNotice()
    saveJson(NOTICES_KEY, [created])
    return [created]
  })
  const [activeId, setActiveId] = useState(() => notices[0]?.id ?? null)
  const [listOpen, setListOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [todayLabel, setTodayLabel] = useState(todayNoticeDateText)
  const [copyLabel, setCopyLabel] = useState("복사")
  const [saveLabel, setSaveLabel] = useState("저장")
  const [autoDelete, setAutoDelete] = useState(() => Boolean(loadJson(AUTO_DELETE_KEY, false)))
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishUrl, setPublishUrl] = useState(() => loadJson(PUBLISH_URL_KEY, "") || "")
  const editorRef = useRef(null)
  const savedRange = useRef(null)
  const noticesRef = useRef(notices)
  const activeIdRef = useRef(activeId)
  const saveTimer = useRef(null)
  const applyingRemote = useRef(false)
  const applyNoticeRef = useRef(() => {})

  noticesRef.current = notices
  activeIdRef.current = activeId
  const activeNotice = notices.find((item) => item.id === activeId) ?? null

  const persist = useCallback((next) => {
    noticesRef.current = next
    setNotices(next)
    saveJson(NOTICES_KEY, next)
  }, [])

  const noticePayload = useCallback(() => {
    const editor = editorRef.current
    const id = activeIdRef.current
    let list = noticesRef.current
    if (editor && id) {
      const html = editor.innerHTML
      list = list.map((item) =>
        item.id === id
          ? {
              ...item,
              content: html,
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
    }
    return { notices: list, activeId: id }
  }, [])

  const pushNoticeSync = useCallback((immediate = false) => {
    if (applyingRemote.current) return
    if (immediate) flushSyncMessage(SYNC.NOTICE_UPDATE, noticePayload)
    else scheduleSyncMessage(SYNC.NOTICE_UPDATE, noticePayload, 1000)
  }, [noticePayload])

  const flushNoticeWith = (id) => {
    if (applyingRemote.current) return
    flushSyncMessage(SYNC.NOTICE_UPDATE, () => ({ notices: noticesRef.current, activeId: id }))
  }

  const pruneExpired = useCallback(() => {
    if (!loadJson(AUTO_DELETE_KEY, false)) return
    const today = kstDateKey()
    const current = noticesRef.current
    const kept = current.filter((item) => item.kept || !item.noticeDate || item.noticeDate >= today)
    if (kept.length === current.length) return
    if (kept.length === 0) {
      const created = emptyNotice()
      persist([created])
      setActiveId(created.id)
      flushNoticeWith(created.id)
      return
    }
    persist(kept)
    if (!kept.some((item) => item.id === activeIdRef.current)) {
      setActiveId(kept[0].id)
    }
    flushNoticeWith(
      kept.some((item) => item.id === activeIdRef.current) ? activeIdRef.current : kept[0].id,
    )
  }, [persist])

  useEffect(() => {
    pruneExpired()
    const timer = window.setInterval(() => {
      setTodayLabel(todayNoticeDateText())
      pruneExpired()
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setTodayLabel(todayNoticeDateText())
        pruneExpired()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [pruneExpired])

  const saveFromEditor = useCallback(() => {
    const id = activeIdRef.current
    const editor = editorRef.current
    if (!id || !editor) return
    persist(
      noticesRef.current.map((item) =>
        item.id === id
          ? {
              ...item,
              content: editor.innerHTML,
              title: item.title || todayNoticeTitle(),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
  }, [persist])

  const applyNotice = useCallback(
    (notice) => {
      const editor = editorRef.current
      if (!editor || !notice) return
      editor.innerHTML = notice.content || ""
      applyBaseEditorStyle(editor, notice, theme)
    },
    [theme],
  )
  applyNoticeRef.current = applyNotice

  useEffect(() => {
    return subscribeSync((msg) => {
      if (msg.type !== SYNC.NOTICE_UPDATE) return
      const raw = msg.payload?.notices
      const list = Array.isArray(raw) ? raw.map(hydrateNotice).filter(Boolean) : []
      if (!list.length) return
      applyingRemote.current = true
      persist(list)
      const requested = msg.payload?.activeId
      const nextId =
        requested && list.some((item) => item.id === requested)
          ? requested
          : list.some((item) => item.id === activeIdRef.current)
            ? activeIdRef.current
            : list[0].id
      setActiveId(nextId)
      const notice = list.find((item) => item.id === nextId)
      if (notice) applyNoticeRef.current(notice)
      queueMicrotask(() => {
        applyingRemote.current = false
      })
    })
  }, [persist])

  useEffect(() => {
    if (!activeId || !notices.some((item) => item.id === activeId)) {
      setActiveId(notices[0]?.id ?? null)
    }
  }, [activeId, notices])

  useEffect(() => {
    if (activeNotice) applyNotice(activeNotice)
    setTodayLabel(todayNoticeDateText())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNotice?.id])

  useEffect(() => {
    if (activeNotice && editorRef.current) {
      applyBaseEditorStyle(editorRef.current, activeNotice, theme)
    }
  }, [theme, activeNotice?.id])

  const scheduleSave = () => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(saveFromEditor, 600)
    pushNoticeSync(false)
  }

  const flushEditorAndSync = () => {
    clearTimeout(saveTimer.current)
    saveFromEditor()
    pushNoticeSync(true)
  }

  const rememberSelection = () => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange()
    }
  }

  const patchStyle = (patch) => {
    const editor = editorRef.current
    const appliedToSelection = applyEditorPatch(editor, patch, theme, savedRange.current)
    persist(
      noticesRef.current.map((item) =>
        item.id === activeIdRef.current
          ? {
              ...item,
              ...(appliedToSelection ? {} : patch),
              content: editor?.innerHTML ?? item.content,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
    pushNoticeSync(true)
  }

  const changeLineHeight = (value) => {
    applyLineHeight(editorRef.current, value)
    persist(
      noticesRef.current.map((item) =>
        item.id === activeId ? { ...item, lineHeight: value, updatedAt: new Date().toISOString() } : item,
      ),
    )
    pushNoticeSync(true)
  }

  const copyNotice = async () => {
    const editor = editorRef.current
    const text = editor?.innerText ?? ""
    const html = editor?.innerHTML ?? ""
    try {
      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopyLabel("복사됨")
      window.setTimeout(() => setCopyLabel("복사"), 1500)
    } catch {
      setCopyLabel("실패")
      window.setTimeout(() => setCopyLabel("복사"), 1500)
    }
  }

  const saveNotice = () => {
    saveFromEditor()
    persist(
      noticesRef.current.map((item) =>
        item.id === activeIdRef.current ? { ...item, kept: true } : item,
      ),
    )
    setListOpen(true)
    setSaveLabel("저장됨")
    window.setTimeout(() => setSaveLabel("저장"), 1500)
    pushNoticeSync(true)
  }

  const savePublishUrl = (raw = publishUrl) => {
    const url = normalizeUrl(raw)
    if (!url) return false
    saveJson(PUBLISH_URL_KEY, url)
    setPublishUrl(url)
    setPublishOpen(false)
    return true
  }

  const openPublishSite = (raw = publishUrl) => {
    const url = normalizeUrl(raw)
    if (!url) {
      setPublishOpen(true)
      return
    }
    savePublishUrl(url)
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const createNotice = () => {
    const created = emptyNotice()
    persist([created, ...noticesRef.current])
    setActiveId(created.id)
    setListOpen(true)
    flushNoticeWith(created.id)
  }

  const deleteNotice = (id) => {
    setConfirm({
      title: "알림장 삭제",
      message: "이 알림장을 삭제할까요? 삭제하면 되돌릴 수 없습니다.",
      onConfirm: () => {
        const next = noticesRef.current.filter((item) => item.id !== id)
        if (next.length === 0) {
          const created = emptyNotice()
          persist([created])
          setActiveId(created.id)
          flushNoticeWith(created.id)
        } else {
          persist(next)
          const nextId = activeIdRef.current === id ? next[0].id : activeIdRef.current
          if (activeIdRef.current === id) setActiveId(next[0].id)
          flushNoticeWith(nextId)
        }
        setConfirm(null)
      },
    })
  }

  const sorted = [...notices].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  return (
    <main className="theme-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app p-3">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-widget">
        {listOpen && (
          <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-sunken">
            <div className="flex h-12 items-center justify-between border-b border-line px-3">
              <p className="text-[13px] text-muted">역대 알림장</p>
              <button
                type="button"
                onClick={createNotice}
                className="rounded-md border border-line px-2 py-1 text-[12px] text-icon transition-colors hover:bg-hover hover:text-ink"
              >
                새 알림장
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {sorted.map((item) => {
                const active = item.id === activeId
                return (
                  <div
                    key={item.id}
                    className={`nav-item group relative mb-1 rounded-lg border px-3 py-2 ${
                      active ? "is-active border-transparent" : "border-transparent hover:bg-hover"
                    }`}
                  >
                    <button type="button" onClick={() => {
                      clearTimeout(saveTimer.current)
                      saveFromEditor()
                      setActiveId(item.id)
                      flushNoticeWith(item.id)
                    }} className="block w-full pr-6 text-left">
                      <p className="truncate text-[13px] text-ink">{item.title || "제목 없음"}</p>
                      <p className="mt-0.5 truncate text-[11px] text-faint">
                        {titleFromContent(item.content, "내용 없음")}
                      </p>
                    </button>
                    <button
                      type="button"
                      title="삭제"
                      onClick={() => deleteNotice(item.id)}
                      className="absolute top-2 right-2 hidden rounded p-1 text-muted hover:bg-hover hover:text-ink group-hover:block"
                    >
                      <Trash2 size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                )
              })}
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-widget-header px-3 py-2">
            <button
              type="button"
              onClick={() => setListOpen((open) => !open)}
              className="flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[12px] text-icon hover:bg-hover hover:text-ink"
            >
              {listOpen ? <ChevronLeft size={13} strokeWidth={1.5} /> : <ChevronRight size={13} strokeWidth={1.5} />}
              {listOpen ? "목록 접기" : "목록 펼치기"}
            </button>
            <WidgetSettings
              bare
              inline
              widget={{
                fontFamily: activeNotice?.fontFamily ?? DEFAULT_FONT.id,
                fontSize: activeNotice?.fontSize ?? 36,
                bold: Boolean(activeNotice?.bold),
                underline: Boolean(activeNotice?.underline),
                textColor: activeNotice?.textColor ?? DEFAULT_TEXT_COLOR,
              }}
              onChange={patchStyle}
            />
            <LineHeightControl
              value={activeNotice?.lineHeight}
              onChange={changeLineHeight}
            />
            <button
              type="button"
              title="전체화면"
              onClick={() => {
                saveFromEditor()
                setFullscreen(true)
              }}
              className="ml-auto flex size-8 items-center justify-center rounded-md text-icon hover:bg-hover hover:text-ink"
            >
              <Maximize2 size={14} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line px-6 py-5">
            <h3 className="min-w-0 text-[42px] leading-none font-semibold tracking-tight text-ink">
              {todayLabel}
            </h3>
            <div className="flex min-w-0 flex-col items-end gap-2">
              <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="알림장 전체 복사"
                onClick={copyNotice}
                className="accent-hover flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-icon transition-colors hover:bg-hover"
              >
                <Copy size={14} strokeWidth={1.5} />
                {copyLabel}
              </button>
              <div className="flex h-9 overflow-hidden rounded-lg border border-line">
                <button
                  type="button"
                  title="알림장 올릴 사이트로 이동"
                  onClick={() => {
                    if (!publishUrl) setPublishOpen(true)
                    else openPublishSite()
                  }}
                  className="accent-hover flex items-center gap-1.5 px-3 text-[13px] text-icon transition-colors hover:bg-hover"
                >
                  <Upload size={14} strokeWidth={1.5} />
                  올리기
                </button>
                <button
                  type="button"
                  title="올리기 주소 변경"
                  aria-label="올리기 주소 변경"
                  onClick={() => setPublishOpen(true)}
                  className="accent-hover flex w-6 items-center justify-center border-l border-line text-icon transition-colors hover:bg-hover"
                >
                  <Settings size={11} strokeWidth={1.5} />
                </button>
              </div>
              <button
                type="button"
                title="목록에 저장"
                onClick={saveNotice}
                className="btn-cta flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px]"
              >
                <Save size={14} strokeWidth={1.5} />
                {saveLabel}
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted">
              날짜가 지나면 알림장 내용을 자동으로 삭제
              <input
                type="checkbox"
                checked={autoDelete}
                onChange={(event) => {
                  const on = event.target.checked
                  setAutoDelete(on)
                  saveJson(AUTO_DELETE_KEY, on)
                  if (on) pruneExpired()
                }}
              />
            </label>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-6">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-sunken p-6 text-ink outline-none"
              onInput={scheduleSave}
              onBlur={flushEditorAndSync}
              onMouseUp={rememberSelection}
              onKeyUp={rememberSelection}
              onFocus={rememberSelection}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
      />

      {publishOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <button
              type="button"
              className="absolute inset-0 bg-overlay"
              aria-label="닫기"
              onClick={() => setPublishOpen(false)}
            />
            <form
              className="theme-surface relative z-10 w-[min(400px,calc(100vw-48px))] rounded-2xl border border-line bg-widget p-5 shadow-modal"
              onSubmit={(event) => {
                event.preventDefault()
                savePublishUrl(new FormData(event.currentTarget).get("url"))
              }}
            >
              <h3 className="text-[15px] font-semibold text-ink">올리기 주소</h3>
              <p className="mt-1 text-[12px] text-muted">알림장을 올릴 웹사이트 주소를 입력하세요.</p>
              <input
                name="url"
                type="text"
                defaultValue={publishUrl}
                placeholder="https://..."
                autoFocus
                className="mt-3 h-10 w-full rounded-md border border-line bg-sunken px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPublishOpen(false)}
                  className="accent-hover h-9 flex-1 rounded-lg border border-line text-[13px] text-icon hover:bg-hover"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="accent-hover h-9 flex-1 rounded-lg border border-line text-[13px] text-icon hover:bg-hover"
                >
                  저장
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[60] overflow-auto bg-app p-8">
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md border border-line text-icon hover:bg-hover hover:text-ink"
              aria-label="닫기"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
            <div
              className="mx-auto max-w-5xl text-ink"
              dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML ?? "" }}
              style={{
                fontFamily: editorRef.current?.style.fontFamily,
                fontSize: editorRef.current?.style.fontSize,
                lineHeight: editorRef.current?.style.lineHeight,
                color: editorRef.current?.style.color,
                fontWeight: editorRef.current?.style.fontWeight,
              }}
            />
          </div>,
          document.body,
        )}
    </main>
  )
}
