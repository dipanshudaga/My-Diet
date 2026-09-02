import type { LogEntry } from '../../ai/schema'
import { sumNutrients } from '../../ai/schema'
import { db } from '../../db/dexie'

interface Props {
  entries: LogEntry[]
  onChanged: () => void
}

const MACROS: { key: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'; label: string; suffix: string }[] = [
  { key: 'kcal', label: 'Calories', suffix: '' },
  { key: 'protein', label: 'Protein', suffix: 'g' },
  { key: 'carbs', label: 'Carbs', suffix: 'g' },
  { key: 'fat', label: 'Fat', suffix: 'g' },
  { key: 'fiber', label: 'Fiber', suffix: 'g' },
]

export function TodayView({ entries, onChanged }: Props) {
  const totals = sumNutrients(entries.map((e) => e.totals))

  async function handleDelete(id: string) {
    await db.logEntries.delete(id)
    onChanged()
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">Today</h2>

      <div className="mb-4 grid grid-cols-5 gap-2 text-center">
        {MACROS.map(({ key, label, suffix }) => (
          <div key={key} className="rounded-md bg-neutral-50 py-2">
            <div className="text-lg font-semibold text-neutral-800">
              {Math.round(totals[key] ?? 0)}
              {suffix}
            </div>
            <div className="text-xs text-neutral-500">{label}</div>
          </div>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing logged yet today.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {entries.map((entry) => (
            <li key={entry.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-neutral-800">
                    {entry.parsedItems.length > 1
                      ? `${entry.parsedItems.length} items`
                      : `${entry.parsedItems[0].quantity}${entry.parsedItems[0].unit} ${entry.parsedItems[0].name}`}
                  </span>
                  {entry.mealContext && <span className="ml-2 text-neutral-400">· {entry.mealContext}</span>}
                  <div className="text-xs text-neutral-500">{Math.round(entry.totals.kcal ?? 0)} kcal</div>
                </div>
                <button onClick={() => handleDelete(entry.id)} className="text-xs text-neutral-400 hover:text-red-500">
                  remove
                </button>
              </div>
              {entry.parsedItems.length > 1 && (
                <ul className="mt-1 space-y-0.5 pl-3 text-xs text-neutral-500">
                  {entry.parsedItems.map((item, i) => (
                    <li key={i}>
                      {item.quantity}
                      {item.unit} {item.name} — {Math.round(item.nutrients.kcal ?? 0)} kcal
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
