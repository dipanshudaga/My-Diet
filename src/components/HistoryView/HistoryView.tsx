import { useEffect, useState } from 'react'
import type { LogEntry, NutrientTotals } from '../../ai/schema'
import { sumNutrients } from '../../ai/schema'
import { db } from '../../db/dexie'

interface Props {
  targets?: NutrientTotals
}

// Matches the local-timezone day boundaries already used elsewhere in the app
// (see isToday() in App.tsx) — deliberately not toISOString(), which is UTC and
// would misfile entries logged near local midnight.
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MACROS: { key: 'kcal' | 'protein' | 'carbs' | 'fat'; label: string; suffix: string }[] = [
  { key: 'kcal', label: 'Calories', suffix: '' },
  { key: 'protein', label: 'Protein', suffix: 'g' },
  { key: 'carbs', label: 'Carbs', suffix: 'g' },
  { key: 'fat', label: 'Fat', suffix: 'g' },
]

export function HistoryView({ targets }: Props) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [selected, setSelected] = useState(() => localDateKey(new Date()))

  const year = monthCursor.getFullYear()
  const month = monthCursor.getMonth()

  useEffect(() => {
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 1)
    db.logEntries
      .where('timestamp')
      .between(start.toISOString(), end.toISOString(), true, false)
      .toArray()
      .then(setEntries)
  }, [year, month])

  const byDay = new Map<string, LogEntry[]>()
  for (const e of entries) {
    const key = localDateKey(new Date(e.timestamp))
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(e)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = new Date(year, month, 1).getDay()
  const cells: (Date | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]

  const todayKey = localDateKey(new Date())
  const selectedEntries = byDay.get(selected) ?? []
  const selectedTotals = sumNutrients(selectedEntries.map((e) => e.totals))
  const [selYear, selMonth, selDay] = selected.split('-').map(Number)
  const selectedDate = new Date(selYear, selMonth - 1, selDay)

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
          className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
        >
          ‹
        </button>
        <h2 className="text-sm font-semibold text-neutral-700">
          {monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <button
          onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
          className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const key = localDateKey(date)
          const dayEntries = byDay.get(key)
          const kcal = dayEntries ? Math.round(sumNutrients(dayEntries.map((e) => e.totals)).kcal ?? 0) : null
          const isToday = key === todayKey
          const isSelected = key === selected
          return (
            <button
              key={i}
              onClick={() => setSelected(key)}
              className={`rounded-md py-1.5 text-xs ${
                isSelected ? 'bg-emerald-600 text-white' : isToday ? 'bg-emerald-50 text-emerald-700' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <div>{date.getDate()}</div>
              {kcal != null && <div className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-neutral-400'}`}>{kcal}</div>}
            </button>
          )
        })}
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <p className="mb-2 text-xs font-medium text-neutral-600">
          {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>

        {selectedEntries.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing logged this day.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-4 gap-2 text-center">
              {MACROS.map(({ key, label, suffix }) => (
                <div key={key} className="rounded-md bg-neutral-50 px-1 py-2">
                  <div className="text-sm font-semibold text-neutral-800">
                    {Math.round(selectedTotals[key] ?? 0)}
                    {suffix}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {label}
                    {targets?.[key] != null && <span className="text-neutral-400"> /{Math.round(targets[key]!)}</span>}
                  </div>
                </div>
              ))}
            </div>
            <ul className="space-y-1 text-sm">
              {selectedEntries.map((entry) => (
                <li key={entry.id} className="text-neutral-600">
                  <span className="font-medium text-neutral-800">
                    {entry.parsedItems.length > 1 ? `${entry.parsedItems.length} items` : entry.parsedItems[0].name}
                  </span>{' '}
                  — {Math.round(entry.totals.kcal ?? 0)} kcal
                  {entry.mealContext && <span className="text-neutral-400"> · {entry.mealContext}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
