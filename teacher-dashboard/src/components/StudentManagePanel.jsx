import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { DEFAULT_STUDENTS, genderLabel } from "../utils/pickerUtils"

export default function StudentManagePanel({ students, persist, setConfirm }) {
  const [name, setName] = useState("")
  const [gender, setGender] = useState("M")
  const [bulk, setBulk] = useState("")
  const pending = useMemo(
    () => students.filter((st) => st.gender !== "M" && st.gender !== "F"),
    [students],
  )

  const addOne = () => {
    const trimmed = name.trim()
    if (!trimmed || students.some((st) => st.name === trimmed)) return
    persist([...students, { id: `st-${Date.now()}`, name: trimmed, gender }])
    setName("")
  }

  const addBulk = () => {
    const names = bulk.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)
    if (names.length === 0) return
    const next = [...students]
    names.forEach((item, i) => {
      if (!next.some((st) => st.name === item)) {
        next.push({ id: `st-bulk-${Date.now()}-${i}`, name: item, gender: null })
      }
    })
    persist(next)
    setBulk("")
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <h3 className="text-[16px] font-semibold text-ink">학생 명단 관리</h3>
        <button
          type="button"
          onClick={() =>
            setConfirm({
              title: "샘플 데이터 복원",
              message: "현재 명단을 덮어쓰고 기본 샘플(10명)을 복원할까요?",
              onConfirm: () => {
                persist(DEFAULT_STUDENTS.map((st) => ({ ...st })))
                setConfirm(null)
              },
            })
          }
          className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-icon hover:bg-hover hover:text-ink"
        >
          샘플 데이터(10명) 복원
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-line bg-sunken p-4">
            <p className="mb-3 text-[13px] text-ink">한 명씩 추가</p>
            <label className="mb-2 block text-[11px] text-muted">학생 이름</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addOne()
                }
              }}
              placeholder="이름 입력"
              className="mb-3 h-9 w-full rounded-md border border-line bg-widget px-2.5 text-[13px] text-ink outline-none"
            />
            <p className="mb-1 text-[11px] text-muted">성별</p>
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              {[
                { id: "M", label: "남학생" },
                { id: "F", label: "여학생" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setGender(item.id)}
                  className={`h-8 rounded-md border text-[12px] ${
                    gender === item.id
                      ? "border-accent bg-accent-soft text-ink"
                      : "accent-hover border-line text-icon hover:bg-hover"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={addOne}
              className="btn-cta h-9 w-full rounded-md text-[12px]"
            >
              명단에 등록
            </button>
          </div>

          <div className="rounded-xl border border-line bg-sunken p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] text-ink">일괄 등록</p>
              <p className="text-[10px] text-faint">줄바꿈 또는 쉼표로 구분</p>
            </div>
            <textarea
              rows={4}
              value={bulk}
              onChange={(event) => setBulk(event.target.value)}
              placeholder="홍길동, 임꺽정, 성춘향"
              className="mb-2 w-full rounded-md border border-line bg-widget p-2.5 text-[13px] text-ink outline-none"
            />
            <button
              type="button"
              onClick={addBulk}
              className="accent-hover h-9 w-full rounded-md border border-line text-[12px] text-icon hover:bg-hover"
            >
              일괄 추가
            </button>
          </div>

          {pending.length > 0 && (
            <div className="rounded-xl border border-line bg-sunken p-4">
              <p className="mb-2 text-[13px] text-ink">성별 선택</p>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {pending.map((st) => (
                  <div key={st.id} className="flex items-center justify-between rounded-md border border-line bg-widget px-2.5 py-2">
                    <span className="text-[13px] text-ink">{st.name}</span>
                    <div className="flex gap-1">
                      {["M", "F"].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            persist(students.map((item) => (item.id === st.id ? { ...item, gender: g } : item)))
                          }
                          className="rounded border border-line px-2 py-0.5 text-[11px] text-icon hover:bg-hover hover:text-ink"
                        >
                          {g === "M" ? "남" : "여"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-sunken p-4 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] tracking-wide text-muted uppercase">현재 저장된 명단</p>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: "명단 비우기",
                  message: "등록된 학생 전체를 삭제할까요?",
                  onConfirm: () => {
                    persist([])
                    setConfirm(null)
                  },
                })
              }
              className="text-[12px] text-muted hover:text-ink"
            >
              모든 명단 비우기
            </button>
          </div>
          <div className="grid content-start grid-cols-3 gap-1">
            {students.length === 0 && (
              <p className="col-span-3 py-6 text-center text-[12px] text-faint">등록된 학생이 없습니다.</p>
            )}
            {students.map((st, idx) => (
              <div key={st.id} className="flex h-9 items-center justify-between rounded-lg border border-line bg-widget px-2.5 text-[13px]">
                <span className="text-ink">
                  <span className="mr-1.5 text-faint">{idx + 1}</span>
                  {st.name} <span className="text-muted">({genderLabel(st.gender)})</span>
                </span>
                <button
                  type="button"
                  onClick={() => persist(students.filter((item) => item.id !== st.id))}
                  className="text-muted hover:text-ink"
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
