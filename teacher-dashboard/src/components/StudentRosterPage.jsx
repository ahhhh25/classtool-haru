import { useState } from "react"
import { useSharedStudents } from "../hooks/useSharedStudents"
import ConfirmDialog from "./ConfirmDialog"
import StudentManagePanel from "./StudentManagePanel"

export default function StudentRosterPage({ onBack }) {
  const [students, persist] = useSharedStudents()
  const [confirm, setConfirm] = useState(null)

  return (
    <main className="theme-surface min-w-0 flex-1 overflow-auto bg-app p-6">
      <div className="mx-auto w-full max-w-5xl">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 text-[13px] text-muted hover:text-ink"
          >
            설정
          </button>
        )}
        <StudentManagePanel students={students} persist={persist} setConfirm={setConfirm} />
      </div>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={confirm?.onConfirm}
      />
    </main>
  )
}
