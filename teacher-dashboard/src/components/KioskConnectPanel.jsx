import { useEffect, useState } from "react"
import { Copy } from "lucide-react"
import QRCode from "qrcode"
import ConfirmDialog from "./ConfirmDialog"
import { isFirebaseConfigured } from "../lib/firebase"
import {
  connectKiosk,
  disconnectKiosk,
  firebaseErrorMessage,
  rotateKioskToken,
} from "../lib/kioskSession"
import { isKioskLinked, useKioskLink } from "../utils/kioskLinkStore"
import { buildKioskUrl } from "../utils/kioskTokens"

export default function KioskConnectPanel({ widget }) {
  const link = useKioskLink()
  const linked = isKioskLinked(link)
  const otherWidget = linked && link.widgetId && link.widgetId !== widget.id
  const configured = isFirebaseConfigured()
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [qrUrl, setQrUrl] = useState("")
  const [confirm, setConfirm] = useState(null)

  const kioskUrl = linked ? buildKioskUrl(link.kioskToken) : ""

  useEffect(() => {
    if (!kioskUrl) {
      setQrUrl("")
      return undefined
    }
    let cancelled = false
    QRCode.toDataURL(kioskUrl, {
      width: 220,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((data) => {
      if (!cancelled) setQrUrl(data)
    })
    return () => {
      cancelled = true
    }
  }, [kioskUrl])

  const run = async (key, action) => {
    setBusy(key)
    setMessage("")
    try {
      await action()
    } catch (error) {
      setMessage(firebaseErrorMessage(error))
    } finally {
      setBusy("")
      setConfirm(null)
    }
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage("복사했습니다.")
    } catch {
      setMessage("복사하지 못했습니다.")
    }
  }

  return (
    <section className="space-y-3">
      <p className="text-[16px] text-ink">학생용 체크 화면 연결</p>
      <p className="text-[12px] leading-relaxed text-muted">
        교실 태블릿에서 이 학급만 열리도록 연결합니다. QR과 주소는 비밀이므로
        학급 바깥에 공유하지 마세요. 이 브라우저가 학급 소유자이며, 다른 컴퓨터에서
        자동으로 이어지지 않습니다.
      </p>

      {!configured && (
        <p className="text-[12px] leading-relaxed text-muted">
          Firebase 공개 설정이 없습니다. <code className="text-ink">.env.local</code>에
          VITE_FIREBASE_* 값을 넣고, Console에서 Anonymous 로그인과 Realtime Database
          규칙을 적용하세요. 그동안 체크 위젯은 이 기기에만 저장됩니다.
        </p>
      )}

      {configured && otherWidget && (
        <p className="text-[12px] text-muted">
          다른 체크 위젯에 연결되어 있습니다. 이 위젯으로 바꾸려면 다시 연결하세요.
        </p>
      )}

      {configured && (!linked || otherWidget) && (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => run("connect", () => connectKiosk(widget))}
          className="h-10 rounded-md border border-line px-3 text-[13px] text-icon hover:bg-hover hover:text-ink disabled:opacity-50"
        >
          {busy === "connect" ? "연결 중…" : "학생용 화면 연결"}
        </button>
      )}

      {configured && linked && (
        <div className="flex items-start gap-4">
          {qrUrl && (
            <img
              src={qrUrl}
              alt="학생용 체크 화면 QR"
              className="size-44 shrink-0 rounded-md border border-line bg-white p-1"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <p className="text-[11px] text-faint">연결 주소</p>
                <button
                  type="button"
                  aria-label="주소 복사"
                  onClick={() => copy(kioskUrl)}
                  className="flex size-6 items-center justify-center rounded-md text-icon hover:bg-hover hover:text-ink"
                >
                  <Copy size={13} strokeWidth={1.5} />
                </button>
              </div>
              <p className="break-all text-[12px] text-ink">{kioskUrl}</p>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => setConfirm("rotate")}
                  className="h-9 rounded-md border border-line px-3 text-[12px] text-icon hover:bg-hover hover:text-ink disabled:opacity-50"
                >
                  연결 주소 다시 만들기
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => setConfirm("disconnect")}
                  className="h-9 rounded-md border border-line px-3 text-[12px] text-icon hover:bg-hover hover:text-ink disabled:opacity-50"
                >
                  연결 해제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {message && <p className="text-[12px] text-muted">{message}</p>}

      <ConfirmDialog
        open={confirm === "rotate"}
        title="연결 주소를 다시 만들까요?"
        message="지금 연결된 태블릿 주소는 더 이상 열리지 않습니다. 새 QR을 다시 찍어야 합니다."
        confirmLabel="다시 만들기"
        onCancel={() => setConfirm(null)}
        onConfirm={() => run("rotate", () => rotateKioskToken(widget))}
      />
      <ConfirmDialog
        open={confirm === "disconnect"}
        title="학생용 화면 연결을 해제할까요?"
        message="태블릿 주소가 즉시 무효가 됩니다. 이 브라우저에서만 다시 연결할 수 있습니다."
        confirmLabel="해제"
        onCancel={() => setConfirm(null)}
        onConfirm={() => run("disconnect", () => disconnectKiosk())}
      />
    </section>
  )
}
