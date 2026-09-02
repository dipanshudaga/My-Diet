// Shared contract between the AI layer, nutrition resolution, and storage.
// Keep these types here and import everywhere else.

export interface NutrientTotals {
  kcal?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sugar?: number
  saturatedFat?: number
  transFat?: number
  cholesterol?: number
  sodium?: number
  vitaminA?: number
  vitaminD?: number
  vitaminE?: number
  vitaminK?: number
  vitaminC?: number
  b1?: number
  b2?: number
  b3?: number
  b6?: number
  folate?: number
  b12?: number
  calcium?: number
  iron?: number
  magnesium?: number
  zinc?: number
  potassium?: number
  phosphorus?: number
  selenium?: number
  copper?: number
  iodine?: number
  omega3?: number
}

export const NUTRIENT_KEYS = [
  'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'saturatedFat', 'transFat',
  'cholesterol', 'sodium', 'vitaminA', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminC',
  'b1', 'b2', 'b3', 'b6', 'folate', 'b12', 'calcium', 'iron', 'magnesium', 'zinc',
  'potassium', 'phosphorus', 'selenium', 'copper', 'iodine', 'omega3',
] as const satisfies readonly (keyof NutrientTotals)[]

export type ParsedItemSource = 'known' | 'ifct' | 'off' | 'ocr' | 'estimated'
export type Confidence = 'high' | 'medium' | 'low'

export interface ParsedItem {
  name: string
  quantity: number
  unit: string // g, ml, "piece", "scoop", etc.
  source: ParsedItemSource
  confidence: Confidence
  nutrients: NutrientTotals
}

export interface LogEntry {
  id: string
  timestamp: string // ISO
  mealContext?: string
  rawInput: { text?: string; imageRefs?: string[] }
  parsedItems: ParsedItem[]
  totals: NutrientTotals
  status: 'auto-saved' | 'edited' | 'confirmed'
  updatedAt: string // ISO, for sync conflict resolution
}

export interface KnownProduct {
  id: string
  name: string
  per100g: NutrientTotals
  source: 'ocr' | 'manual' | 'ifct' | 'off'
  lastUpdated: string
}

export interface Profile {
  id: string
  age: number
  sex: 'male' | 'female'
  heightCm: number
  weightKg: number
  activityDaysPerWeek: number
  goal: 'gain' | 'lose' | 'maintain'
  targets: NutrientTotals
  updatedAt: string // ISO, for sync conflict resolution
}

export function sumNutrients(items: NutrientTotals[]): NutrientTotals {
  const total: NutrientTotals = {}
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      const value = item[key]
      if (value == null) continue
      total[key] = (total[key] ?? 0) + value
    }
  }
  return total
}

// The model's free-text extraction output, before nutrient resolution.
export interface ExtractedItem {
  name: string
  quantity: number
  unit: string
  estimated?: boolean
}

function extractJsonSubstring(raw: string, open: '[' | '{', close: ']' | '}'): string {
  const start = raw.indexOf(open)
  const end = raw.lastIndexOf(close)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Model output did not contain a JSON ${open}...${close} block: ${raw}`)
  }
  return raw.slice(start, end + 1)
}

// Models occasionally wrap JSON in prose or code fences despite instructions —
// pull out the array substring and validate its shape rather than trusting it raw.
export function parseExtractedItems(raw: string): ExtractedItem[] {
  const json = JSON.parse(extractJsonSubstring(raw, '[', ']'))
  if (!Array.isArray(json)) throw new Error('Expected a JSON array of items')

  return json.map((item, i) => {
    if (typeof item?.name !== 'string' || typeof item?.quantity !== 'number' || typeof item?.unit !== 'string') {
      throw new Error(`Item ${i} is missing name/quantity/unit: ${JSON.stringify(item)}`)
    }
    return {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      estimated: item.estimated === true,
    }
  })
}

function pickNutrientFields(json: Record<string, unknown>, keys: readonly (keyof NutrientTotals)[]): NutrientTotals {
  const nutrients: NutrientTotals = {}
  for (const key of keys) {
    if (typeof json[key] === 'number') nutrients[key] = json[key] as number
  }
  return nutrients
}

const ESTIMATE_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const satisfies readonly (keyof NutrientTotals)[]

export function parseNutrientEstimate(raw: string): NutrientTotals {
  const json = JSON.parse(extractJsonSubstring(raw, '{', '}'))
  return pickNutrientFields(json, ESTIMATE_KEYS)
}

const LABEL_KEYS = [
  'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'saturatedFat', 'cholesterol', 'sodium',
] as const satisfies readonly (keyof NutrientTotals)[]

export interface ExtractedLabel {
  name: string
  per100g: NutrientTotals
}

export function parseLabelResult(raw: string): ExtractedLabel {
  const json = JSON.parse(extractJsonSubstring(raw, '{', '}'))
  if (typeof json?.name !== 'string') throw new Error(`Label result is missing a name: ${raw}`)
  return { name: json.name, per100g: pickNutrientFields(json.per100g ?? {}, LABEL_KEYS) }
}
