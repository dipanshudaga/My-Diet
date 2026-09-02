import { useRef, useState } from 'react'
import type { ExtractedLabel, NutrientTotals, ParsedItem, ParsedItemSource } from '../../ai/schema'
import { sumNutrients } from '../../ai/schema'
import { isGpuAvailable, isModelLoaded, loadModel, type LoadProgress } from '../../ai/model'
import { downscaleImage } from '../../ai/image'
import { parseFoodLog, parseFoodPhoto, parseLabelPhoto } from '../../ai/parseLog'
import { db } from '../../db/dexie'
import { resolveFood, scaleNutrients } from '../../nutrition/resolve'

interface Props {
  knownFoodNames: string[]
  onSaved: () => void
}

const UNITS = ['g', 'ml', 'piece', 'scoop', 'tablet']

export function LogInput(props: Props) {
  return isGpuAvailable() ? <ChatLogInput {...props} /> : <StructuredLogInput {...props} />
}

// ---- Chat-based entry (Phase 2/3): free text or photo -> Gemma -> review -> save ----

type ModelState = 'idle' | 'loading' | 'ready' | 'error'

const LABEL_FIELDS: { key: keyof NutrientTotals; label: string }[] = [
  { key: 'kcal', label: 'Kcal' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
  { key: 'fiber', label: 'Fiber' },
  { key: 'sugar', label: 'Sugar' },
  { key: 'saturatedFat', label: 'Sat. fat' },
  { key: 'cholesterol', label: 'Cholesterol' },
  { key: 'sodium', label: 'Sodium' },
]

function ChatLogInput({ onSaved }: Props) {
  const [text, setText] = useState('')
  const [mealContext, setMealContext] = useState('')
  const [modelState, setModelState] = useState<ModelState>(isModelLoaded() ? 'ready' : 'idle')
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [parsing, setParsing] = useState(false)
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoCanvas, setPhotoCanvas] = useState<HTMLCanvasElement | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [labelResult, setLabelResult] = useState<ExtractedLabel | null>(null)
  const [labelQuantity, setLabelQuantity] = useState(0)
  const [labelUnit, setLabelUnit] = useState('g')

  async function ensureModelLoaded(): Promise<boolean> {
    if (isModelLoaded()) {
      setModelState('ready')
      return true
    }
    setModelState('loading')
    try {
      await loadModel(setProgress)
      setModelState('ready')
      return true
    } catch {
      setModelState('error')
      setError('Could not load the on-device model. Check your connection and try again.')
      return false
    }
  }

  async function handleSubmit() {
    if (!text.trim()) return
    setError(null)
    setItems(null)
    if (!(await ensureModelLoaded())) return

    setParsing(true)
    try {
      setItems(await parseFoodLog(text))
    } catch {
      setError("Couldn't parse that — try rephrasing with clearer quantities.")
    } finally {
      setParsing(false)
    }
  }

  function clearPhotoAttachment() {
    setPhotoCanvas(null)
    setPhotoPreview(null)
  }

  async function handlePhotoSelected(file: File) {
    setError(null)
    const canvas = await downscaleImage(file)
    setPhotoCanvas(canvas)
    setPhotoPreview(canvas.toDataURL('image/jpeg', 0.8))
  }

  async function handleFoodPhoto() {
    if (!photoCanvas) return
    setError(null)
    setItems(null)
    if (!(await ensureModelLoaded())) return

    setParsing(true)
    try {
      setItems(await parseFoodPhoto(photoCanvas))
      clearPhotoAttachment()
    } catch {
      setError("Couldn't read that photo — try a clearer shot.")
    } finally {
      setParsing(false)
    }
  }

  async function handleLabelPhoto() {
    if (!photoCanvas) return
    setError(null)
    setLabelResult(null)
    if (!(await ensureModelLoaded())) return

    setParsing(true)
    try {
      const result = await parseLabelPhoto(photoCanvas)
      setLabelResult(result)
      setLabelQuantity(0)
      setLabelUnit('g')
      clearPhotoAttachment()
    } catch {
      setError("Couldn't read that label — try a clearer, well-lit photo.")
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    if (!items || items.length === 0) return
    setSaving(true)
    const now = new Date().toISOString()
    await db.logEntries.add({
      id: crypto.randomUUID(),
      timestamp: now,
      mealContext: mealContext.trim() || undefined,
      rawInput: { text },
      parsedItems: items,
      totals: sumNutrients(items.map((i) => i.nutrients)),
      status: 'confirmed',
      updatedAt: now,
    })
    setSaving(false)
    setText('')
    setMealContext('')
    setItems(null)
    onSaved()
  }

  async function handleSaveLabel() {
    if (!labelResult || !labelResult.name.trim()) return
    setSaving(true)
    const now = new Date().toISOString()

    const existing = (await db.knownProducts.toArray()).find(
      (p) => p.name.toLowerCase() === labelResult.name.trim().toLowerCase(),
    )
    await db.knownProducts.put({
      id: existing?.id ?? crypto.randomUUID(),
      name: labelResult.name.trim(),
      per100g: labelResult.per100g,
      source: 'ocr',
      lastUpdated: now,
    })

    if (labelQuantity > 0) {
      const nutrients = scaleNutrients(labelResult.per100g, labelQuantity, labelUnit)
      await db.logEntries.add({
        id: crypto.randomUUID(),
        timestamp: now,
        mealContext: mealContext.trim() || undefined,
        rawInput: { text: `${labelQuantity}${labelUnit} ${labelResult.name} (scanned label)` },
        parsedItems: [
          { name: labelResult.name, quantity: labelQuantity, unit: labelUnit, source: 'known', confidence: 'high', nutrients },
        ],
        totals: nutrients,
        status: 'confirmed',
        updatedAt: now,
      })
    }

    setSaving(false)
    setLabelResult(null)
    setMealContext('')
    onSaved()
  }

  const isBusy = modelState === 'loading' || parsing
  const pct = progress && progress.totalBytes > 0 ? Math.round((progress.loadedBytes / progress.totalBytes) * 100) : 0

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">Log food</h2>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. 60g oats, grated 10 almonds, 2 walnuts, 350g milk, one spoon peanut butter"
        rows={3}
        className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <input
        value={mealContext}
        onChange={(e) => setMealContext(e.target.value)}
        placeholder="meal context (optional), e.g. post-workout"
        className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isBusy}
          className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {modelState === 'loading' ? 'Loading Gemma…' : parsing ? 'Reading…' : 'Log it'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) handlePhotoSelected(file)
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600"
        >
          📷 Add photo
        </button>
      </div>

      {photoPreview && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-neutral-200 p-2">
          <img src={photoPreview} alt="Attached" className="h-16 w-16 rounded object-cover" />
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <button
              onClick={handleFoodPhoto}
              disabled={isBusy}
              className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              🍽️ Food photo
            </button>
            <button
              onClick={handleLabelPhoto}
              disabled={isBusy}
              className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              🏷️ Label / supplement
            </button>
            <button onClick={clearPhotoAttachment} className="text-xs text-neutral-400 hover:text-red-500">
              remove
            </button>
          </div>
        </div>
      )}

      {modelState === 'loading' && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full bg-neutral-800 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            One-time model download ({pct}%) — cached on this device after this.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {items && items.length > 0 && (
        <div className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="py-1 pr-2 font-medium">Ingredient</th>
                  <th className="py-1 pr-2 font-medium">Qty</th>
                  <th className="py-1 pr-2 font-medium">Kcal</th>
                  <th className="py-1 pr-2 font-medium">Protein</th>
                  <th className="py-1 pr-2 font-medium">Carbs</th>
                  <th className="py-1 pr-2 font-medium">Fat</th>
                  <th className="py-1 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="py-1 pr-2">{item.name}</td>
                    <td className="py-1 pr-2 text-neutral-500">
                      {item.quantity}
                      {item.unit}
                    </td>
                    <td className="py-1 pr-2">{Math.round(item.nutrients.kcal ?? 0)}</td>
                    <td className="py-1 pr-2">{Math.round(item.nutrients.protein ?? 0)}g</td>
                    <td className="py-1 pr-2">{Math.round(item.nutrients.carbs ?? 0)}g</td>
                    <td className="py-1 pr-2">{Math.round(item.nutrients.fat ?? 0)}g</td>
                    <td className="py-1">
                      <SourceBadge source={item.source} confidence={item.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save entry'}
            </button>
            <button onClick={() => setItems(null)} className="rounded-md px-4 py-2 text-sm font-medium text-neutral-500">
              Discard
            </button>
          </div>
        </div>
      )}

      {labelResult && (
        <div className="mt-4 rounded-md border border-neutral-200 p-3">
          <p className="mb-2 text-xs text-neutral-500">Reconciled from the photo + on-device OCR — check the numbers before saving.</p>
          <input
            value={labelResult.name}
            onChange={(e) => setLabelResult({ ...labelResult, name: e.target.value })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium"
          />

          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {LABEL_FIELDS.map(({ key, label }) => (
              <label key={key} className="text-xs text-neutral-500">
                {label}
                <input
                  type="number"
                  value={labelResult.per100g[key] ?? ''}
                  onChange={(e) =>
                    setLabelResult({
                      ...labelResult,
                      per100g: { ...labelResult.per100g, [key]: e.target.value ? Number(e.target.value) : undefined },
                    })
                  }
                  className="mt-0.5 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-400">All values are per 100g.</p>

          <label className="mt-3 block text-xs text-neutral-500">
            Log how much you're having now (optional)
            <div className="mt-0.5 flex gap-1">
              <input
                type="number"
                value={labelQuantity || ''}
                onChange={(e) => setLabelQuantity(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
              />
              <select
                value={labelUnit}
                onChange={(e) => setLabelUnit(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSaveLabel}
              disabled={saving || !labelResult.name.trim()}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : labelQuantity > 0 ? 'Save to library + log entry' : 'Save to library'}
            </button>
            <button onClick={() => setLabelResult(null)} className="rounded-md px-4 py-2 text-sm font-medium text-neutral-500">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SourceBadge({ source, confidence }: { source: ParsedItemSource; confidence: string }) {
  const label = source === 'known' ? 'your library' : source === 'ifct' ? 'IFCT' : source
  const isLow = confidence === 'low'
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${isLow ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
      {label}
    </span>
  )
}

// ---- Structured-form fallback (Phase 1): used when navigator.gpu is unavailable ----

interface Match {
  source: ParsedItemSource
  nutrients: NutrientTotals
}

function StructuredLogInput({ knownFoodNames, onSaved }: Props) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState(100)
  const [unit, setUnit] = useState('g')
  const [mealContext, setMealContext] = useState('')
  const [match, setMatch] = useState<Match | null>(null)
  const [manualKcal, setManualKcal] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [manualFat, setManualFat] = useState('')
  const [manualFiber, setManualFiber] = useState('')
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleCheck() {
    const resolved = await resolveFood(name)
    if (resolved) {
      setMatch({ source: resolved.source, nutrients: scaleNutrients(resolved.per100g, quantity, unit) })
    } else {
      setMatch(null)
    }
    setChecked(true)
  }

  function resetForm() {
    setName('')
    setQuantity(100)
    setUnit('g')
    setMealContext('')
    setMatch(null)
    setManualKcal('')
    setManualProtein('')
    setManualCarbs('')
    setManualFat('')
    setManualFiber('')
    setChecked(false)
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    const nutrients: NutrientTotals = match
      ? match.nutrients
      : {
          kcal: manualKcal ? Number(manualKcal) : undefined,
          protein: manualProtein ? Number(manualProtein) : undefined,
          carbs: manualCarbs ? Number(manualCarbs) : undefined,
          fat: manualFat ? Number(manualFat) : undefined,
          fiber: manualFiber ? Number(manualFiber) : undefined,
        }

    const parsedItem: ParsedItem = {
      name: name.trim(),
      quantity,
      unit,
      source: match ? match.source : 'estimated',
      confidence: match ? 'high' : 'medium',
      nutrients,
    }

    const now = new Date().toISOString()
    await db.logEntries.add({
      id: crypto.randomUUID(),
      timestamp: now,
      mealContext: mealContext.trim() || undefined,
      rawInput: { text: `${quantity}${unit} ${name}` },
      parsedItems: [parsedItem],
      totals: sumNutrients([nutrients]),
      status: 'confirmed',
      updatedAt: now,
    })

    setSaving(false)
    resetForm()
    onSaved()
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-neutral-700">Log food</h2>
      <p className="mb-3 text-xs text-neutral-400">
        Your browser doesn't support on-device AI (WebGPU) — using manual entry instead.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          list="known-foods"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setChecked(false)
          }}
          placeholder="e.g. wheat atta, almond, oats"
          className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <datalist id="known-foods">
          {knownFoodNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <input
          type="number"
          value={quantity}
          onChange={(e) => {
            setQuantity(Number(e.target.value))
            setChecked(false)
          }}
          className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />

        <select
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value)
            setChecked(false)
          }}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      <input
        value={mealContext}
        onChange={(e) => setMealContext(e.target.value)}
        placeholder="meal context (optional), e.g. post-workout"
        className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      {!checked && (
        <button
          onClick={handleCheck}
          disabled={!name.trim()}
          className="mt-3 rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Look up
        </button>
      )}

      {checked && match && (
        <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Matched <strong>{match.source === 'known' ? 'your known products' : 'IFCT'}</strong> — {match.nutrients.kcal ?? 0} kcal
          , {match.nutrients.protein ?? 0}g protein, {match.nutrients.carbs ?? 0}g carbs, {match.nutrients.fat ?? 0}g fat
        </div>
      )}

      {checked && !match && (
        <div className="mt-3 space-y-2 rounded-md bg-amber-50 p-3">
          <p className="text-sm text-amber-800">No match found — enter values for the whole {quantity}{unit} manually.</p>
          <div className="flex flex-wrap gap-2">
            <input placeholder="kcal" value={manualKcal} onChange={(e) => setManualKcal(e.target.value)} className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
            <input placeholder="protein g" value={manualProtein} onChange={(e) => setManualProtein(e.target.value)} className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
            <input placeholder="carbs g" value={manualCarbs} onChange={(e) => setManualCarbs(e.target.value)} className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
            <input placeholder="fat g" value={manualFat} onChange={(e) => setManualFat(e.target.value)} className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
            <input placeholder="fiber g" value={manualFiber} onChange={(e) => setManualFiber(e.target.value)} className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </div>
        </div>
      )}

      {checked && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save entry'}
          </button>
          <button onClick={resetForm} className="rounded-md px-4 py-2 text-sm font-medium text-neutral-500">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
