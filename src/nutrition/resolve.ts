import { NUTRIENT_KEYS, type NutrientTotals } from '../ai/schema'
import { db } from '../db/dexie'
import { findIfctFood, matchesQuery } from './ifct/ifct'

export type ResolvedSource = 'known' | 'ifct'

export interface ResolvedFood {
  matchedName: string
  source: ResolvedSource
  per100g: NutrientTotals
}

// Resolution order (see CLAUDE.md): the user's own KnownProduct library, then IFCT.
// Open Food Facts joins this in a later phase, once there's a real need for
// branded packaged products beyond what IFCT/KnownProduct already cover.
// Model estimation (source: 'estimated') is the caller's fallback when this
// returns undefined — see src/ai/parseLog.ts.
export async function resolveFood(query: string): Promise<ResolvedFood | undefined> {
  const q = query.trim()
  if (!q) return undefined

  const knownProducts = await db.knownProducts.toArray()
  const known = knownProducts.find((p) => matchesQuery(p.name, q))
  if (known) return { matchedName: known.name, source: 'known', per100g: known.per100g }

  const ifct = findIfctFood(q)
  if (ifct) return { matchedName: ifct.name, source: 'ifct', per100g: ifct.per100g }

  return undefined
}

// Known-product/IFCT data is stored per 100g for weighed foods, but a handful of
// seed entries (e.g. a supplement tablet) are dosed per-unit instead of by weight —
// for those, per100g holds the values for exactly 1 unit. g/ml scale by weight;
// every other unit (piece, tablet, scoop, ...) scales 1:1 with quantity instead.
export function scaleNutrients(per100g: NutrientTotals, quantity: number, unit: string): NutrientTotals {
  const isWeightUnit = unit.trim().toLowerCase() === 'g' || unit.trim().toLowerCase() === 'ml'
  const factor = isWeightUnit ? quantity / 100 : quantity

  const scaled: NutrientTotals = {}
  for (const key of NUTRIENT_KEYS) {
    const value = per100g[key]
    if (value == null) continue
    scaled[key] = Math.round(value * factor * 100) / 100
  }
  return scaled
}
