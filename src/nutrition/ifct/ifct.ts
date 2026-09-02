import type { NutrientTotals } from '../../ai/schema'
import ifctData from './data/ifct-foods.json'

interface IfctFood {
  id: string
  ifctCode: string
  name: string
  group: string
  per100g: NutrientTotals
}

const foods = ifctData.foods as IfctFood[]

const STOPWORDS = new Set(['whole', 'raw', 'dal', 'the', 'a', 'of', 'and', 'with', 'ripe', 'dry', 'fresh'])

function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 3 && !STOPWORDS.has(w)))
}

// The model extracts free-text names like "black chana (sprouts)", which is
// longer/more descriptive than a stored name like "Bengal gram, whole (chana)" —
// plain substring containment only works one direction, so match on shared
// significant words instead (works whichever side is more specific).
export function matchesQuery(name: string, query: string): boolean {
  const nameWords = words(name)
  for (const w of words(query)) {
    if (nameWords.has(w)) return true
  }
  return false
}

export function findIfctFood(query: string): IfctFood | undefined {
  const q = query.trim()
  if (!q) return undefined
  return foods.find((f) => matchesQuery(f.name, q))
}

export function listIfctFoods(): IfctFood[] {
  return foods
}
