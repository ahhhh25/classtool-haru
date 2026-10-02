import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Settings, X } from "lucide-react"
import { useSharedStudents } from "../../hooks/useSharedStudents"
import { loadJson, saveJson } from "../../utils/safeStorage"
import {
  PICKER_PREFS_KEY,
  clampGroupCount,
  bestGroupGrid,
  computeAutomaticGroups,
  normalizeSepGroups,
  shuffleArray,
} from "../../utils/pickerUtils"
import ConfettiBurst from "./ConfettiBurst"
import { createPickerAudio } from "../../utils/pickerAudio"
import { subscribeSync, SYNC, syncSend } from "../../utils/syncChannel"

function loadGroupPrefs() {
  const stored = loadJson(PICKER_PREFS_KEY, {}) || {}
  const shared = clampGroupCount(stored.total ?? stored.pickTotal, 4)
  return {
    pick: clampGroupCount(stored.pickTotal, shared),
    order: clampGroupCount(stored.orderTotal, shared),
    make: clampGroupCount(stored.makeTotal, shared),
  }
}

function saveGroupPrefs(patch) {
  const current = loadJson(PICKER_PREFS_KEY, {}) || {}
  saveJson(PICKER_PREFS_KEY, { ...current, ...patch })
}

function loadSepGroups() {
  const stored = loadJson(PICKER_PREFS_KEY, {}) || {}
  if (!Array.isArray(stored.sepGroups)) return []
  return stored.sepGroups
    .filter((group) => Array.isArray(group))
    .map((group) => [...new Set(group.map((id) => String(id || "")).filter(Boolean))])
}

const GROUP_COUNTS = [2, 3, 4, 5, 6, 7, 8]

const PICKER_TABS = [
  { id: "individual", label: "개인 랜덤 뽑기" },
  { id: "pick", label: "모둠 번호 뽑기" },
  { id: "order", label: "모둠 순서 정하기" },
  { id: "create", label: "모둠 만들기" },
]

function BookmarkTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`rounded-t-md border px-3.5 py-1.5 text-[15px] whitespace-nowrap transition-colors ${
        active
          ? "relative z-[1] -mb-px border-line border-b-widget bg-widget font-medium text-ink"
          : "border-transparent text-muted hover:bg-hover hover:text-ink"
      }`}
    >
      {children}
    </button>
  )
}

export default function PickerTool({
  sub = "individual",
  groupMode = "pick",
  onSelectSub,
  onSelectGroup,
}) {
  const [students] = useSharedStudents()
  const inGroup = sub === "group"

  return (
    <main className="theme-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app px-3 pt-2 pb-3">
      <nav className="flex items-end gap-0.5 px-2" aria-label="랜덤뽑기 메뉴">
        {PICKER_TABS.map((tab) => {
          const active = tab.id === "individual" ? !inGroup : inGroup && groupMode === tab.id
          return (
            <BookmarkTab
              key={tab.id}
              active={active}
              onClick={() =>
                tab.id === "individual" ? onSelectSub?.("individual") : onSelectGroup?.(tab.id)
              }
            >
              {tab.label}
            </BookmarkTab>
          )
        })}
      </nav>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-widget">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
          <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${inGroup ? "hidden" : ""}`}>
            <IndividualPick students={students} />
          </div>
          <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${inGroup ? "" : "hidden"}`}>
            <GroupPick students={students} mode={groupMode} />
          </div>
        </div>
      </div>
    </main>
  )
}

function IndividualPick({ students }) {
  const [count, setCount] = useState(1)
  const [pickedIds, setPickedIds] = useState(() => new Set())
  const [display, setDisplay] = useState("준비 완료!")
  const [subText, setSubText] = useState("")
  const [busy, setBusy] = useState(false)
  const [burstId, setBurstId] = useState(0)
  const timerRef = useRef(null)
  const audioRef = useRef(null)
  const studentsRef = useRef(students)
  const busyRef = useRef(false)
  studentsRef.current = students
  busyRef.current = busy

  useEffect(() => {
    audioRef.current = createPickerAudio()
    return () => {
      clearInterval(timerRef.current)
      audioRef.current?.dispose()
    }
  }, [])

  const playWinners = (winners, fromRemote = false) => {
    const list = studentsRef.current
    if (busyRef.current || !winners?.length || list.length === 0) return
    busyRef.current = true
    setBusy(true)
    audioRef.current?.unlock()
    let cycle = 0
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      cycle += 1
      setDisplay(list[Math.floor(Math.random() * list.length)].name)
      setSubText("뽑는 중...")
      audioRef.current?.playTick(cycle / 25)
      if (cycle >= 25) {
        clearInterval(timerRef.current)
        setDisplay(winners.map((w) => w.name).join(", "))
        setSubText("")
        setPickedIds((current) => {
          const next = new Set(current)
          winners.forEach((w) => next.add(w.id))
          return next
        })
        setBurstId(Date.now())
        busyRef.current = false
        setBusy(false)
        audioRef.current?.playReveal()
        if (!fromRemote) {
          syncSend(SYNC.PICKER_RESULT, {
            kind: "individual",
            winners,
            pickedIds: winners.map((w) => w.id),
          })
        }
      }
    }, 80)
  }

  const playWinnersRef = useRef(playWinners)
  playWinnersRef.current = playWinners

  useEffect(() => {
    return subscribeSync((msg) => {
      const payload = msg.payload || {}
      if (msg.type === SYNC.PICKER_DRAW_START && payload.kind === "individual") {
        playWinnersRef.current(payload.winners, true)
        return
      }
      if (msg.type === SYNC.PICKER_RESULT && payload.kind === "individual" && !busyRef.current) {
        const winners = Array.isArray(payload.winners) ? payload.winners : []
        if (winners.length) setDisplay(winners.map((w) => w.name).join(", "))
        const ids = payload.pickedIds || winners.map((w) => w.id)
        if (ids?.length) setPickedIds((current) => new Set([...current, ...ids]))
        return
      }
      if (msg.type === SYNC.PICKER_RESET && payload.kind === "individual") {
        clearInterval(timerRef.current)
        busyRef.current = false
        setBusy(false)
        setPickedIds(new Set())
        setDisplay("준비 완료!")
        setSubText("")
        return
      }
      if (msg.type === SYNC.PICKER_CONFIG && payload.kind === "individual" && payload.count != null) {
        setCount(payload.count)
      }
    })
  }, [])

  const run = () => {
    if (busy || students.length === 0) return
    const requested = Math.max(1, Number(count) || 1)
    const available = students.filter((st) => !pickedIds.has(st.id))
    if (available.length === 0) return
    const winners = shuffleArray(available).slice(0, Math.min(requested, available.length))
    syncSend(SYNC.PICKER_DRAW_START, { kind: "individual", winners, count: requested })
    playWinners(winners)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line pb-3">
        <label className="flex items-center gap-2 text-[13px] text-ink">
          뽑을 인원수
          <input
            type="number"
            min={1}
            value={count}
            onChange={(event) => {
              const value = event.target.value
              setCount(value)
              syncSend(SYNC.PICKER_CONFIG, { kind: "individual", count: value })
            }}
            className="h-8 w-16 rounded-md border border-line bg-sunken text-center text-ink outline-none"
          />
          명
        </label>
      </div>

      <div className="relative flex h-[12rem] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border border-line bg-sunken p-6 sm:h-[14rem]">
        <ConfettiBurst burstId={burstId} />
        <p className="text-center text-[80px] font-semibold leading-none text-ink sm:text-[112px]">{display}</p>
        {subText ? <p className="mt-2 text-[13px] text-muted">{subText}</p> : null}
      </div>

      <div className="flex shrink-0 justify-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={run}
          className="btn-cta h-11 min-w-[8.5rem] rounded-xl px-8 text-[14px] disabled:opacity-40"
        >
          시작
        </button>
        <button
          type="button"
          onClick={() => {
            setPickedIds(new Set())
            setDisplay("준비 완료!")
            setSubText("")
            syncSend(SYNC.PICKER_RESET, { kind: "individual" })
          }}
          className="accent-hover h-11 min-w-[8.5rem] rounded-xl border border-line px-8 text-[14px] text-icon hover:bg-hover"
        >
          초기화
        </button>
      </div>

      <IndividualRoster students={students} pickedIds={pickedIds} />
    </div>
  )
}

function IndividualRoster({ students, pickedIds }) {
  const wrapRef = useRef(null)
  const [metrics, setMetrics] = useState({ cols: 8, rows: 4, fontPx: 18, gap: 8, pad: 12 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined

    const layout = () => {
      const n = students.length
      const { width, height } = el.getBoundingClientRect()
      if (width < 16 || height < 16) return
      const count = Math.max(n, 1)
      const cols = Math.max(6, Math.min(10, Math.ceil(count / 4)))
      const rows = Math.max(1, Math.ceil(count / cols))
      const gap = n > 24 ? 6 : 8
      const pad = n > 24 ? 10 : 12
      const cellH = (height - pad * 2 - gap * (rows - 1)) / rows
      const cellW = (width - pad * 2 - gap * (cols - 1)) / cols
      const fontPx = Math.max(15, Math.min(cellH * 0.46, cellW * 0.36, 34))
      setMetrics({ cols, rows, fontPx, gap, pad })
    }

    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(el)
    return () => observer.disconnect()
  }, [students.length])

  return (
    <div
      ref={wrapRef}
      className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-sunken"
    >
      {students.length === 0 ? (
        <p className="flex h-full items-center justify-center text-[12px] text-faint">
          학생 명단을 추가하면 여기에 표시됩니다.
        </p>
      ) : (
        <div
          className="grid h-full min-h-0"
          style={{
            gridTemplateColumns: `repeat(${metrics.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${metrics.rows}, minmax(0, 1fr))`,
            gap: metrics.gap,
            padding: metrics.pad,
          }}
        >
          {students.map((st) => {
            const picked = pickedIds.has(st.id)
            return (
              <div
                key={st.id}
                className={`flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-md border px-1.5 text-center font-semibold leading-tight ${
                  picked ? "border-line text-faint line-through opacity-70" : "border-line bg-widget text-ink"
                }`}
                style={{ fontSize: `${metrics.fontPx}px` }}
              >
                <span className="min-w-0 truncate">{st.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GroupPick({ students, mode }) {
  const prefs = loadGroupPrefs()
  const [total, setTotal] = useState(prefs.pick)
  const [picked, setPicked] = useState(() => new Set())
  const [display, setDisplay] = useState("준비 완료!")
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const [burstId, setBurstId] = useState(0)
  const [orderBurstId, setOrderBurstId] = useState(0)
  const [orderTotal, setOrderTotal] = useState(prefs.order)
  const [orderNums, setOrderNums] = useState(() => Array.from({ length: prefs.order }, (_, i) => i + 1))
  const [orderShuffling, setOrderShuffling] = useState(false)
  const [makeTotal, setMakeTotal] = useState(prefs.make)
  const [balance, setBalance] = useState(true)
  const [sepGroups, setSepGroups] = useState(() => loadSepGroups())
  const [sepOpen, setSepOpen] = useState(false)
  const [groups, setGroups] = useState(null)
  const [shuffling, setShuffling] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const timers = useRef([])
  const audioRef = useRef(null)
  const studentsRef = useRef(students)
  const busyRef = useRef(false)
  const orderBusyRef = useRef(false)
  const makeBusyRef = useRef(false)
  const totalRef = useRef(total)
  studentsRef.current = students
  busyRef.current = busy
  orderBusyRef.current = orderShuffling
  makeBusyRef.current = shuffling
  totalRef.current = total

  useEffect(() => {
    const ids = new Set(students.map((student) => String(student.id)))
    setSepGroups((current) => {
      const next = current.map((group) => group.filter((id) => ids.has(id)))
      if (next.length === current.length && next.every((group, index) => group.length === current[index].length)) {
        return current
      }
      saveGroupPrefs({ sepGroups: next })
      return next
    })
  }, [students])

  useEffect(() => {
    audioRef.current = createPickerAudio()
    return () => {
      timers.current.forEach(clearInterval)
      audioRef.current?.dispose()
    }
  }, [])

  const playPick = (winner, fromRemote = false) => {
    const groupTotal = totalRef.current
    if (winner == null || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    audioRef.current?.unlock()
    let cycle = 0
    const id = setInterval(() => {
      cycle += 1
      setDisplay(`${Math.floor(Math.random() * groupTotal) + 1} 모둠`)
      setStatus("뽑는 중...")
      audioRef.current?.playTick(cycle / 25)
      if (cycle >= 25) {
        clearInterval(id)
        setDisplay(`${winner} 모둠`)
        setPicked((current) => {
          const next = new Set([...current, winner])
          setStatus(`${next.size}/${groupTotal}`)
          return next
        })
        setBurstId(Date.now())
        busyRef.current = false
        setBusy(false)
        audioRef.current?.playReveal()
        if (!fromRemote) syncSend(SYNC.PICKER_RESULT, { kind: "pick", winner })
      }
    }, 80)
    timers.current.push(id)
  }

  const playOrder = (finalOrder, fromRemote = false) => {
    if (!Array.isArray(finalOrder) || orderBusyRef.current) return
    orderBusyRef.current = true
    setOrderShuffling(true)
    audioRef.current?.unlock()
    let elapsed = 0
    const id = setInterval(() => {
      setOrderNums(shuffleArray(Array.from({ length: finalOrder.length }, (_, i) => i + 1)))
      elapsed += 80
      audioRef.current?.playTick(elapsed / 1200)
      if (elapsed >= 1200) {
        clearInterval(id)
        setOrderNums(finalOrder)
        orderBusyRef.current = false
        setOrderShuffling(false)
        setOrderBurstId(Date.now())
        audioRef.current?.playReveal()
        if (!fromRemote) syncSend(SYNC.PICKER_RESULT, { kind: "order", orderNums: finalOrder })
      }
    }, 80)
    timers.current.push(id)
  }

  const playMake = (finalGroups, fromRemote = false) => {
    const list = studentsRef.current
    if (!Array.isArray(finalGroups) || makeBusyRef.current) return
    makeBusyRef.current = true
    setShuffling(true)
    audioRef.current?.unlock()
    let elapsed = 0
    const id = setInterval(() => {
      const random = Array.from({ length: finalGroups.length }, () => [])
      shuffleArray(list).forEach((st, idx) => random[idx % finalGroups.length].push(st))
      setGroups(random)
      elapsed += 100
      audioRef.current?.playTick(elapsed / 1200)
      if (elapsed >= 1200) {
        clearInterval(id)
        setGroups(finalGroups)
        makeBusyRef.current = false
        setShuffling(false)
        audioRef.current?.playReveal()
        if (!fromRemote) syncSend(SYNC.PICKER_RESULT, { kind: "create", groups: finalGroups })
      }
    }, 100)
    timers.current.push(id)
  }

  const playPickRef = useRef(playPick)
  const playOrderRef = useRef(playOrder)
  const playMakeRef = useRef(playMake)
  playPickRef.current = playPick
  playOrderRef.current = playOrder
  playMakeRef.current = playMake

  useEffect(() => {
    return subscribeSync((msg) => {
      const payload = msg.payload || {}
      if (msg.type === SYNC.PICKER_DRAW_START) {
        if (payload.kind === "pick") playPickRef.current(payload.winner, true)
        if (payload.kind === "order") playOrderRef.current(payload.orderNums, true)
        if (payload.kind === "create") playMakeRef.current(payload.groups, true)
        return
      }
      if (msg.type === SYNC.PICKER_RESULT && payload.kind === "pick" && !busyRef.current && payload.winner != null) {
        setDisplay(`${payload.winner} 모둠`)
        setPicked((current) => new Set([...current, payload.winner]))
        return
      }
      if (msg.type === SYNC.PICKER_RESULT && payload.kind === "order" && !orderBusyRef.current && payload.orderNums) {
        setOrderNums(payload.orderNums)
        return
      }
      if (msg.type === SYNC.PICKER_RESULT && payload.kind === "create" && !makeBusyRef.current && payload.groups) {
        setGroups(payload.groups)
        return
      }
      if (msg.type === SYNC.PICKER_RESET) {
        if (payload.kind === "pick") {
          timers.current.forEach(clearInterval)
          busyRef.current = false
          setBusy(false)
          setPicked(new Set())
          setDisplay("준비 완료!")
          setStatus("")
        }
        if (payload.kind === "order") {
          timers.current.forEach(clearInterval)
          orderBusyRef.current = false
          setOrderShuffling(false)
          setOrderNums(Array.from({ length: payload.orderTotal || totalRef.current }, (_, i) => i + 1))
        }
        if (payload.kind === "create") {
          timers.current.forEach(clearInterval)
          makeBusyRef.current = false
          setShuffling(false)
          setGroups(null)
          setFullscreen(false)
        }
        return
      }
      if (msg.type === SYNC.PICKER_CONFIG) {
        if (payload.kind === "pick" && payload.total != null) {
          setTotal(payload.total)
          setPicked(new Set())
        }
        if (payload.kind === "order" && payload.orderTotal != null) {
          setOrderTotal(payload.orderTotal)
          setOrderNums(Array.from({ length: payload.orderTotal }, (_, i) => i + 1))
        }
        if (payload.kind === "create") {
          if (payload.makeTotal != null) setMakeTotal(payload.makeTotal)
          if (payload.balance != null) setBalance(Boolean(payload.balance))
          if (payload.fullscreen != null) setFullscreen(Boolean(payload.fullscreen))
        }
      }
    })
  }, [])

  const runPick = () => {
    const available = []
    for (let i = 1; i <= total; i += 1) if (!picked.has(i)) available.push(i)
    if (available.length === 0 || busy) return
    const winner = shuffleArray(available)[0]
    syncSend(SYNC.PICKER_DRAW_START, { kind: "pick", winner, total })
    playPick(winner)
  }

  const runOrder = () => {
    if (orderShuffling) return
    const finalOrder = shuffleArray(Array.from({ length: orderTotal }, (_, i) => i + 1))
    syncSend(SYNC.PICKER_DRAW_START, { kind: "order", orderNums: finalOrder, orderTotal })
    playOrder(finalOrder)
  }

  const runMake = () => {
    if (students.length === 0 || students.length < makeTotal || shuffling) return
    const finalGroups = computeAutomaticGroups(students, makeTotal, balance, sepGroups)
    syncSend(SYNC.PICKER_DRAW_START, { kind: "create", groups: finalGroups, makeTotal, balance })
    playMake(finalGroups)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {mode === "pick" && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            모둠 수
            <select
              value={total}
              onChange={(event) => {
                const n = Number(event.target.value)
                setTotal(n)
                setPicked(new Set())
                saveGroupPrefs({ pickTotal: n, total: n })
                syncSend(SYNC.PICKER_CONFIG, { kind: "pick", total: n })
              }}
              className="h-8 rounded-md border border-line bg-sunken px-2 text-ink"
            >
              {GROUP_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n} 모둠
                </option>
              ))}
            </select>
          </label>
          <div className="relative flex h-[12rem] items-center justify-center overflow-hidden rounded-xl border border-line bg-sunken p-6 sm:h-[14rem]">
            <ConfettiBurst burstId={burstId} />
            <p className="text-[80px] font-semibold leading-none text-ink sm:text-[112px]">{display}</p>
            {status && (
              <p className="absolute right-4 bottom-3 text-[13px] text-muted">{status}</p>
            )}
          </div>
          <div
            className="@container grid gap-3 rounded-xl border border-line bg-sunken p-6"
            style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                className={`flex min-w-0 items-center justify-center rounded-2xl border font-semibold ${
                  picked.has(n)
                    ? "border-line text-faint line-through opacity-70"
                    : "border-line bg-widget text-ink"
                }`}
                style={{
                  height: "calc((100cqi - 3.75rem) / 7.25)",
                  fontSize: "clamp(1.375rem, calc((100cqi - 3.75rem) / 16), 2.5rem)",
                }}
              >
                {n}
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={runPick}
              className="btn-cta h-11 min-w-[8.5rem] rounded-xl px-8 text-[14px] disabled:opacity-40"
            >
              시작
            </button>
            <button
              type="button"
              onClick={() => {
                setPicked(new Set())
                setDisplay("준비 완료!")
                setStatus("")
                syncSend(SYNC.PICKER_RESET, { kind: "pick" })
              }}
              className="accent-hover h-11 min-w-[8.5rem] rounded-xl border border-line px-8 text-[14px] text-icon hover:bg-hover"
            >
              초기화
            </button>
          </div>
        </div>
      )}

      {mode === "order" && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            모둠 수
            <select
              value={orderTotal}
              onChange={(event) => {
                const n = Number(event.target.value)
                setOrderTotal(n)
                setOrderNums(Array.from({ length: n }, (_, i) => i + 1))
                saveGroupPrefs({ orderTotal: n, total: n })
                syncSend(SYNC.PICKER_CONFIG, { kind: "order", orderTotal: n })
              }}
              className="h-8 rounded-md border border-line bg-sunken px-2 text-ink"
            >
              {GROUP_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n} 모둠
                </option>
              ))}
            </select>
          </label>
          <div
            className="relative @container grid gap-3 overflow-hidden rounded-xl border border-line bg-sunken p-6"
            style={{ gridTemplateColumns: `repeat(${orderTotal}, minmax(0, 1fr))` }}
          >
            <ConfettiBurst burstId={orderBurstId} />
            {orderNums.map((num, idx) => (
              <div
                key={`${num}-${idx}`}
                className={`flex min-w-0 items-center justify-center rounded-2xl border border-line bg-widget font-semibold text-ink ${
                  orderShuffling ? "tool-shuffle" : ""
                }`}
                style={{
                  height: "calc((100cqi - 3.75rem) / 7.25)",
                  fontSize: "clamp(1.375rem, calc((100cqi - 3.75rem) / 16), 2.5rem)",
                }}
              >
                {num}
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              disabled={orderShuffling}
              onClick={runOrder}
              className="btn-cta h-11 min-w-[8.5rem] rounded-xl px-8 text-[14px] disabled:opacity-40"
            >
              시작
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderNums(Array.from({ length: orderTotal }, (_, i) => i + 1))
                syncSend(SYNC.PICKER_RESET, { kind: "order", orderTotal })
              }}
              className="accent-hover h-11 min-w-[8.5rem] rounded-xl border border-line px-8 text-[14px] text-icon hover:bg-hover"
            >
              초기화
            </button>
          </div>
        </div>
      )}

      {mode === "create" && (
        <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <button
            type="button"
            aria-label="설정"
            onClick={() => setSepOpen(true)}
            className="absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded text-faint opacity-25 transition-opacity hover:opacity-60"
          >
            <Settings size={11} strokeWidth={1.25} />
          </button>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sunken p-4 pr-8">
            <label className="flex items-center gap-2 text-[13px] text-ink">
              구성할 모둠 수
              <select
                value={makeTotal}
                onChange={(event) => {
                  const n = Number(event.target.value)
                  setMakeTotal(n)
                  saveGroupPrefs({ makeTotal: n, total: n })
                  syncSend(SYNC.PICKER_CONFIG, { kind: "create", makeTotal: n })
                }}
                className="h-8 rounded-md border border-line bg-widget px-2 text-ink"
              >
                {GROUP_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n} 모둠
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={balance}
                onChange={(event) => {
                  const on = event.target.checked
                  setBalance(on)
                  syncSend(SYNC.PICKER_CONFIG, { kind: "create", balance: on })
                }}
              />
              남녀 성별 균등 배정
            </label>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <GroupMakeBoard groups={groups} shuffling={shuffling} />
          </div>
          <div className="flex shrink-0 justify-center gap-2">
            <button
              type="button"
              onClick={runMake}
              className="btn-cta h-11 min-w-[8.5rem] rounded-xl px-8 text-[14px]"
            >
              시작
            </button>
            <button
              type="button"
              onClick={() => {
                setGroups(null)
                setFullscreen(false)
                syncSend(SYNC.PICKER_RESET, { kind: "create" })
              }}
              className="accent-hover h-11 min-w-[8.5rem] rounded-xl border border-line px-8 text-[14px] text-icon hover:bg-hover"
            >
              초기화
            </button>
            <button
              type="button"
              disabled={!groups || shuffling}
              onClick={() => {
                setFullscreen(true)
                syncSend(SYNC.PICKER_CONFIG, { kind: "create", fullscreen: true })
              }}
              className="accent-hover h-11 min-w-[8.5rem] rounded-xl border border-line px-8 text-[14px] text-icon hover:bg-hover disabled:opacity-40"
            >
              크게 보기
            </button>
          </div>
          {fullscreen &&
            createPortal(
              <GroupMakeFullscreen
                groups={groups}
                onClose={() => {
                  setFullscreen(false)
                  syncSend(SYNC.PICKER_CONFIG, { kind: "create", fullscreen: false })
                }}
              />,
              document.body,
            )}
          {sepOpen &&
            createPortal(
              <SepSettingsModal
                students={students}
                sepGroups={sepGroups}
                onChange={(next) => {
                  setSepGroups(next)
                  saveGroupPrefs({ sepGroups: next })
                }}
                onClose={() => setSepOpen(false)}
              />,
              document.body,
            )}
        </div>
      )}
    </div>
  )
}

function applyFitNameSize(card, px) {
  card.style.setProperty("--name-px", `${px}px`)
  card.style.setProperty("--name-gap", `${Math.max(4, px * 0.16)}px`)
  card.style.setProperty("--name-py", `${Math.max(2, px * 0.18)}px`)
  card.style.setProperty("--name-px-pad", `${Math.max(6, px * 0.38)}px`)
}

function GroupFitCard({ index, members }) {
  const cardRef = useRef(null)
  const namesRef = useRef(null)
  const male = members.filter((st) => st.gender === "M").length
  const female = members.filter((st) => st.gender === "F").length

  useLayoutEffect(() => {
    const card = cardRef.current
    const names = namesRef.current
    if (!card || !names) return

    const fits = () =>
      names.scrollHeight <= names.clientHeight + 1 && names.scrollWidth <= names.clientWidth + 1

    const layout = () => {
      const height = card.clientHeight
      const width = card.clientWidth
      if (height < 8 || width < 8) return

      const title = Math.max(16, Math.min(height * 0.1, width * 0.08))
      card.style.setProperty("--title-px", `${title}px`)
      card.style.setProperty("--meta-px", `${Math.max(11, title * 0.42)}px`)
      card.style.setProperty("--head-gap", `${Math.max(4, title * 0.22)}px`)

      void names.offsetHeight

      let low = 12
      let high = Math.max(low, Math.min(height * 0.34, width * 0.26))
      let best = low
      for (let step = 0; step < 16; step += 1) {
        const mid = (low + high) / 2
        applyFitNameSize(card, mid)
        void names.offsetHeight
        if (fits()) {
          best = mid
          low = mid
        } else {
          high = mid
        }
      }
      applyFitNameSize(card, best * 0.92)
    }

    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(card)
    return () => observer.disconnect()
  }, [members])

  return (
    <article
      ref={cardRef}
      className="group-fit-card flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-sunken p-[1.4vmin]"
    >
      <div className="group-fit-head flex shrink-0 items-baseline justify-between overflow-hidden border-b border-line">
        <p className="group-fit-title min-w-0 truncate font-semibold text-ink">
          {index + 1} 모둠{" "}
          <span className="group-fit-count font-normal text-muted">({members.length}명)</span>
        </p>
        <p className="group-fit-meta ml-2 shrink-0 truncate text-muted">
          남 {male} / 여 {female}
        </p>
      </div>
      <div ref={namesRef} className="group-fit-names">
        {members.map((st) => (
          <span
            key={st.id}
            title={st.name}
            className="group-fit-name rounded-md border border-line bg-widget font-semibold text-ink"
          >
            {st.name}
          </span>
        ))}
      </div>
    </article>
  )
}

function GroupMakeBoard({ groups, shuffling = false }) {
  const areaRef = useRef(null)
  const [grid, setGrid] = useState({ cols: 1, rows: 1 })

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el || !groups?.length) return
    const apply = () => {
      const { width, height } = el.getBoundingClientRect()
      setGrid(bestGroupGrid(groups.length, width, height))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [groups?.length])

  if (!groups) return null

  return (
    <div
      ref={areaRef}
      className={`grid h-full min-h-0 min-w-0 overflow-hidden ${shuffling ? "tool-shuffle" : ""}`}
      style={{
        gap: "0.5rem",
        gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
      }}
    >
      {groups.map((members, idx) => (
        <GroupFitCard key={idx} index={idx} members={members} />
      ))}
    </div>
  )
}

function GroupMakeFullscreen({ groups, onClose }) {
  const areaRef = useRef(null)
  const [grid, setGrid] = useState({ cols: 1, rows: 1 })

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const apply = () => {
      const { width, height } = el.getBoundingClientRect()
      setGrid(bestGroupGrid(groups.length, width, height))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [groups.length])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (event) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return (
    <div className="theme-surface fixed inset-0 z-[60] flex h-dvh w-dvw overflow-hidden bg-app">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-[1.2vmin] right-[1.2vmin] z-10 flex size-8 items-center justify-center rounded-md border border-line bg-widget text-icon hover:bg-hover hover:text-ink"
        aria-label="닫기"
      >
        <X size={16} strokeWidth={1.5} />
      </button>
      <div
        ref={areaRef}
        className="grid h-full min-h-0 w-full min-w-0 overflow-hidden p-[1.4vmin]"
        style={{
          gap: "1.2vmin",
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        }}
      >
        {groups.map((members, idx) => (
          <GroupFitCard key={idx} index={idx} members={members} />
        ))}
      </div>
    </div>
  )
}

function SepSettingsModal({ students, sepGroups, onChange, onClose }) {
  const [pickIndex, setPickIndex] = useState(null)
  const activeCount = normalizeSepGroups(sepGroups).filter((group) => group.length >= 2).length

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        if (pickIndex != null) setPickIndex(null)
        else onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, pickIndex])

  const patchGroup = (index, nextGroup) => {
    onChange(sepGroups.map((group, i) => (i === index ? nextGroup : group)))
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <button type="button" className="absolute inset-0 bg-overlay" aria-label="닫기" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="theme-surface relative z-10 flex max-h-[min(80vh,640px)] w-[min(420px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-widget shadow-modal"
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
          <h3 className="text-[14px] text-ink">설정</h3>
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-icon hover:bg-hover hover:text-ink"
            aria-label="닫기"
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-3 text-[12px] text-muted">
            같은 모둠이 되지 않게 할 학생을 묶어 두세요.
            {activeCount > 0 ? ` · ${activeCount}개 적용 중` : ""}
          </p>
          <button
            type="button"
            onClick={() => onChange([...sepGroups, []])}
            className="mb-2 rounded-md border border-line px-2 py-1 text-[12px] text-icon hover:bg-hover hover:text-ink"
          >
            + 그룹 추가
          </button>
          <div className="space-y-2">
            {sepGroups.length === 0 && (
              <p className="text-[12px] text-faint">등록된 그룹이 없습니다.</p>
            )}
            {sepGroups.map((group, index) => {
              const names = group
                .map((id) => students.find((student) => student.id === id)?.name || "?")
                .join(", ")
              return (
                <div key={`sep-${index}`} className="rounded-md border border-line bg-sunken p-2 text-[12px]">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-ink">그룹 {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => onChange(sepGroups.filter((_, i) => i !== index))}
                      className="text-faint hover:text-ink"
                      aria-label="그룹 삭제"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <p className="mb-1 text-muted">{names || "(비어있음)"}</p>
                  <button
                    type="button"
                    className="text-[12px] text-accent-fg hover:underline"
                    onClick={() => setPickIndex(index)}
                  >
                    학생 선택
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {pickIndex != null && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <button
            type="button"
            className="absolute inset-0 bg-overlay"
            aria-label="닫기"
            onClick={() => setPickIndex(null)}
          />
          <div className="theme-surface relative z-10 flex max-h-[min(80vh,640px)] w-[min(360px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-widget shadow-modal">
            <header className="flex h-11 shrink-0 items-center border-b border-line px-4">
              <h4 className="text-[14px] text-ink">그룹 {pickIndex + 1} 학생 선택</h4>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {students.map((student) => {
                const checked = sepGroups[pickIndex]?.includes(student.id)
                return (
                  <label
                    key={student.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checked)}
                      onChange={(event) => {
                        const current = sepGroups[pickIndex] || []
                        patchGroup(
                          pickIndex,
                          event.target.checked
                            ? [...current, student.id]
                            : current.filter((id) => id !== student.id),
                        )
                      }}
                    />
                    {student.name}
                  </label>
                )
              })}
            </div>
            <div className="border-t border-line p-3">
              <button
                type="button"
                className="h-9 w-full rounded-lg border border-line text-[13px] text-ink hover:bg-hover"
                onClick={() => setPickIndex(null)}
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




