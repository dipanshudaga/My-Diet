import { useState } from 'react'
import type { LogEntry, NutrientTotals, ParsedItem } from '../../ai/schema'
import { sumNutrients } from '../../ai/schema'
import { db } from '../../db/dexie'
import { findKnownProduct, unscaleNutrients } from '../../nutrition/resolve'
import { SourceBadge } from '../SourceBadge'

interface Props {
  entries: LogEntry[]
  targets?: NutrientTotals
  onChanged: () => void
}

const MACROS: { key: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'; label: string; suffix: string }[] = [
  { key: 'kcal', label: 'Calories', suffix: '' },
  { key: 'protein', label: 'Protein', suffix: 'g' },
  { key: 'carbs', label: 'Carbs', suffix: 'g' },
  { key: 'fat', label: 'Fat', suffix: 'g' },
  { key: 'fiber', label: 'Fiber', suffix: 'g' },
]

const MICROS: { key: keyof NutrientTotals; label: string; suffix: string }[] = [
  { key: 'sugar', label: 'Sugar', suffix: 'g' },
  { key: 'saturatedFat', label: 'Saturated fat', suffix: 'g' },
  { key: 'transFat', label: 'Trans fat', suffix: 'g' },
  { key: 'cholesterol', label: 'Cholesterol', suffix: 'mg' },
  { key: 'sodium', label: 'Sodium', suffix: 'mg' },
  { key: 'omega3', label: 'Omega-3', suffix: 'g' },
  { key: 'vitaminA', label: 'Vitamin A', suffix: 'µg' },
  { key: 'vitaminD', label: 'Vitamin D', suffix: 'µg' },
  { key: 'vitaminE', label: 'Vitamin E', suffix: 'mg' },
  { key: 'vitaminK', label: 'Vitamin K', suffix: 'µg' },
  { key: 'vitaminC', label: 'Vitamin C', suffix: 'mg' },
  { key: 'b1', label: 'B1 (thiamine)', suffix: 'mg' },
  { key: 'b2', label: 'B2 (riboflavin)', suffix: 'mg' },
  { key: 'b3', label: 'B3 (niacin)', suffix: 'mg' },
  { key: 'b6', label: 'B6', suffix: 'mg' },
  { key: 'folate', label: 'Folate', suffix: 'µg' },
  { key: 'b12', label: 'B12', suffix: 'µg' },
  { key: 'calcium', label: 'Calcium', suffix: 'mg' },
  { key: 'iron', label: 'Iron', suffix: 'mg' },
  { key: 'magnesium', label: 'Magnesium', suffix: 'mg' },
  { key: 'zinc', label: 'Zinc', suffix: 'mg' },
  { key: 'potassium', label: 'Potassium', suffix: 'mg' },
  { key: 'phosphorus', label: 'Phosphorus', suffix: 'mg' },
  { key: 'selenium', label: 'Selenium', suffix: 'µg' },
  { key: 'copper', label: 'Copper', suffix: 'mg' },
  { key: 'iodine', label: 'Iodine', suffix: 'µg' },
]

function ProgressBar({ value, target }: { value: number; target?: number }) {
  if (!target) return null
  const pct = Math.min(100, Math.round((value / target) * 100))
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div className={`h-full ${pct >= 100 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

const EDIT_FIELDS: { key: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'; label: string }[] = [
  { key: 'kcal', label: 'kcal' },
  { key: 'protein', label: 'protein g' },
  { key: 'carbs', label: 'carbs g' },
  { key: 'fat', label: 'fat g' },
  { key: 'fiber', label: 'fiber g' },
]

function EntryItemRow({ entryId, item, itemIndex, onSaved }: { entryId: string; item: ParsedItem; itemIndex: number; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setValues({
      kcal: String(item.nutrients.kcal ?? ''),
      protein: String(item.nutrients.protein ?? ''),
      carbs: String(item.nutrients.carbs ?? ''),
      fat: String(item.nutrients.fat ?? ''),
      fiber: String(item.nutrients.fiber ?? ''),
    })
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    const entry = await db.logEntries.get(entryId)
    if (!entry) {
      setSaving(false)
      return
    }

    const newNutrients: NutrientTotals = { ...item.nutrients }
    for (const { key } of EDIT_FIELDS) {
      newNutrients[key] = values[key] ? Number(values[key]) : undefined
    }

    const updatedItems = entry.parsedItems.map((it, i) => (i === itemIndex ? { ...it, nutrients: newNutrients, confidence: 'high' as const } : it))
    const now = new Date().toISOString()
    await db.logEntries.put({
      ...entry,
      parsedItems: updatedItems,
      totals: sumNutrients(updatedItems.map((i) => i.nutrients)),
      status: 'edited',
      updatedAt: now,
    })

    // Known-product correction flow: offer to fix the underlying product too,
    // so this correction applies to future logs and not just this one entry.
    if (item.source === 'known') {
      const product = await findKnownProduct(item.name)
      if (product && window.confirm(`Also update your saved "${product.name}" with this correction, so future logs use it too?`)) {
        const corrected100g = unscaleNutrients(newNutrients, item.quantity, item.unit)
        await db.knownProducts.put({ ...product, per100g: { ...product.per100g, ...corrected100g }, lastUpdated: now })
      }
    }

    setSaving(false)
    setEditing(false)
    onSaved()
  }

  if (editing) {
    return (
      <li className="space-y-1 rounded-md bg-neutral-50 p-2">
        <div className="text-xs text-neutral-600">
          {item.quantity}
          {item.unit} {item.name}
        </div>
        <div className="flex flex-wrap gap-1">
          {EDIT_FIELDS.map(({ key, label }) => (
            <input
              key={key}
              placeholder={label}
              value={values[key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              className="w-20 rounded-md border border-neutral-300 px-1.5 py-1 text-xs"
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-neutral-400">
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-2 text-xs text-neutral-600">
      <span>
        {item.quantity}
        {item.unit} {item.name} — {Math.round(item.nutrients.kcal ?? 0)} kcal
      </span>
      <span className="flex items-center gap-1.5">
        <SourceBadge source={item.source} confidence={item.confidence} />
        <button onClick={startEdit} className="text-neutral-400 hover:text-neutral-600">
          edit
        </button>
      </span>
    </li>
  )
}

export function TodayView({ entries, targets, onChanged }: Props) {
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
          <div key={key} className="rounded-md bg-neutral-50 px-1 py-2">
            <div className="text-lg font-semibold text-neutral-800">
              {Math.round(totals[key] ?? 0)}
              {suffix}
            </div>
            <div className="text-xs text-neutral-500">
              {label}
              {targets?.[key] != null && <span className="text-neutral-400"> /{Math.round(targets[key]!)}</span>}
            </div>
            <ProgressBar value={totals[key] ?? 0} target={targets?.[key]} />
          </div>
        ))}
      </div>

      {targets && (
        <details className="mb-4 rounded-md bg-neutral-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-neutral-600">Micronutrients</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {MICROS.map(({ key, label, suffix }) => (
              <div key={key} className="text-xs">
                <div className="flex justify-between text-neutral-500">
                  <span>{label}</span>
                  <span>
                    {Math.round((totals[key] ?? 0) * 10) / 10}
                    {targets[key] != null ? `/${Math.round(targets[key]!)}` : ''}
                    {suffix}
                  </span>
                </div>
                <ProgressBar value={totals[key] ?? 0} target={targets[key]} />
              </div>
            ))}
          </div>
        </details>
      )}

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
                  {entry.status === 'edited' && <span className="ml-2 text-neutral-400">· edited</span>}
                  <div className="text-xs text-neutral-500">{Math.round(entry.totals.kcal ?? 0)} kcal</div>
                </div>
                <button onClick={() => handleDelete(entry.id)} className="text-xs text-neutral-400 hover:text-red-500">
                  remove
                </button>
              </div>
              <ul className="mt-1 space-y-1 pl-3">
                {entry.parsedItems.map((item, i) => (
                  <EntryItemRow key={i} entryId={entry.id} item={item} itemIndex={i} onSaved={onChanged} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
