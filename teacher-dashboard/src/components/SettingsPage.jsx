import { useRef } from "react"
import { ChevronRight, Download, List, Moon, Sun, Upload } from "lucide-react"
import { useTheme } from "../theme/ThemeProvider"

export default function SettingsPage({ onBackup, onRestore, onOpenStudents }) {
  const { theme, setTheme } = useTheme()
  const fileRef = useRef(null)

  return (
    <main className="theme-surface min-w-0 flex-1 overflow-auto bg-app p-6">
      <div className="mx-auto w-full max-w-md space-y-8">
        <h2 className="text-[18px] font-semibold text-ink">설정</h2>

        <section>
          <p className="mb-2 text-[15px] font-medium text-ink">학생 명단</p>
          <button
            type="button"
            onClick={onOpenStudents}
            className="accent-hover flex h-10 w-full items-center justify-between rounded-lg px-3 text-[13px] text-icon hover:bg-hover"
          >
            <span className="flex items-center gap-2">
              <List size={16} strokeWidth={1.5} />
              학생 명단 관리
            </span>
            <ChevronRight size={16} strokeWidth={1.5} className="text-faint" />
          </button>
        </section>

        <section>
          <p className="mb-2 text-[15px] font-medium text-ink">테마</p>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-pressed={theme === "dark"}
              className={`nav-item flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] ${
                theme === "dark" ? "is-active" : "text-icon hover:bg-hover"
              }`}
            >
              <Moon size={16} strokeWidth={1.5} />
              다크 모드
            </button>
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-pressed={theme === "light"}
              className={`nav-item flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] ${
                theme === "light" ? "is-active" : "text-icon hover:bg-hover"
              }`}
            >
              <Sun size={16} strokeWidth={1.5} />
              라이트 모드
            </button>
          </div>
        </section>

        <section>
          <p className="mb-2 text-[15px] font-medium text-ink">데이터</p>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onBackup}
              className="accent-hover flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] text-icon hover:bg-hover"
            >
              <Download size={16} strokeWidth={1.5} />
              데이터 백업
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="accent-hover flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] text-icon hover:bg-hover"
            >
              <Upload size={16} strokeWidth={1.5} />
              데이터 복원
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) onRestore(file)
              }}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
